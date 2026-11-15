"""Small fail-closed request guard for the single-instance API deployment."""
from __future__ import annotations

import hmac
import json
import logging
import time
from collections import deque
from typing import Any

logger = logging.getLogger("cashsense.security")


class RequestSecurityMiddleware:
    """Require server-to-server auth and bound request size/rate before parsing."""

    def __init__(
        self,
        app: Any,
        *,
        shared_secret: str | None,
        max_body_bytes: int = 1_000_000,
        requests_per_minute: int = 120,
        clock=time.monotonic,
    ) -> None:
        self.app = app
        self.shared_secret = shared_secret or ""
        self.max_body_bytes = max_body_bytes
        self.requests_per_minute = requests_per_minute
        self.clock = clock
        self.requests: deque[float] = deque()

    async def _json(self, scope: dict[str, Any], receive: Any, send: Any, status: int, message: str) -> None:
        body = json.dumps({"detail": {"message": message}}).encode()
        await send({"type": "http.response.start", "status": status, "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode()), (b"cache-control", b"no-store")]})
        await send({"type": "http.response.body", "body": body})

    def _limited(self) -> bool:
        now = self.clock()
        while self.requests and now - self.requests[0] >= 60:
            self.requests.popleft()
        if len(self.requests) >= self.requests_per_minute:
            return True
        self.requests.append(now)
        return False

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "GET").upper()
        path = scope.get("path", "")
        if method != "OPTIONS" and path != "/health" and self._limited():
            await self._json(scope, receive, send, 429, "Request rate limit exceeded. Try again shortly.")
            return

        # Health is intentionally public and reveals no configuration or user data.
        # Let CORS handle preflight without requiring credentials.
        if method != "OPTIONS" and path != "/health":
            headers = {key.lower(): value for key, value in scope.get("headers", [])}
            supplied = headers.get(b"x-cashsense-backend-token", b"").decode("utf-8", "ignore")
            backend_token_configured = bool(self.shared_secret)
            authentication_header_received = bool(supplied)
            exact_token_match = backend_token_configured and hmac.compare_digest(supplied, self.shared_secret)
            logger.info(
                "CashSense auth diagnostics backend_token_configured=%s authentication_header_received=%s exact_token_match=%s",
                backend_token_configured,
                authentication_header_received,
                exact_token_match,
            )
            if not backend_token_configured:
                await self._json(scope, receive, send, 503, "Backend authentication is not configured.")
                return
            if not exact_token_match:
                await self._json(scope, receive, send, 401, "A valid backend credential is required.")
                return

        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        content_length = headers.get(b"content-length")
        if content_length:
            try:
                if int(content_length) > self.max_body_bytes:
                    await self._json(scope, receive, send, 413, "Request body exceeds the 1 MB limit.")
                    return
            except ValueError:
                await self._json(scope, receive, send, 400, "Invalid Content-Length header.")
                return

        chunks: list[bytes] = []
        total = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            total += len(chunk)
            if total > self.max_body_bytes:
                await self._json(scope, receive, send, 413, "Request body exceeds the 1 MB limit.")
                return
            chunks.append(chunk)
            if not message.get("more_body", False):
                break

        body = b"".join(chunks)
        replayed = False

        async def replay() -> dict[str, Any]:
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": body, "more_body": False}
            return {"type": "http.disconnect"}

        await self.app(scope, replay, send)
