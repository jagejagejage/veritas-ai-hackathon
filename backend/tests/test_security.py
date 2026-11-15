from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.security import RequestSecurityMiddleware


def test_authenticated_requests_are_rate_limited():
    app = FastAPI()

    @app.get("/work")
    def work():
        return {"ok": True}

    guarded = RequestSecurityMiddleware(app, shared_secret="test-only-secret", requests_per_minute=1)
    client = TestClient(guarded, headers={"x-cashsense-backend-token": "test-only-secret"})

    assert client.get("/work").status_code == 200
    limited = client.get("/work")
    assert limited.status_code == 429
    assert "rate limit" in limited.json()["detail"]["message"].lower()
