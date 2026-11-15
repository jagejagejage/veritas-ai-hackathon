# CashSense backend integration

The dashboard now calls a same-origin Next.js route (`POST /api/backend/forecast`). The route uses only the server-side `CASHSENSE_BACKEND_URL` setting and sends dashboard data to the Python API's `/forecast` endpoint and, when supported controls are active, `/whatif`. No backend URL or credential is placed in browser code.

## Request mapping

The proxy serializes frontend history to `rows` with `week` numbered 1 through N and the six money fields in dollars. It sends `horizon` (4, 8, or 12) and includes `opening_cash` only when the CSV supplied a starting balance. Revenue change maps to `sales_change_pct`. The one-time expense maps to an `add` operation on `other` in forecast week 1, matching the dashboard's existing control wording. The response uses `model.weeks[].net`, or `whatif.after.weeks[].net`, as weekly net flow. Only actual backend response data and backend warnings/backtest metrics are displayed.

The backend returns uncertainty bounds for projected closing cash, while this chart displays weekly net flow. Those bounds are not shown as net-flow uncertainty. The dashboard shows the backend's selected method, warnings, and its rolling backtest MAE when available. The backend marks this backtest `selection_in_sample`; the UI identifies it as overlapping method-selection history and does not call it holdout accuracy.

## Unsupported payment-delay control

The dashboard's payment-delay control is expressed in days. The backend accepts week-based shifts to individual fields; it cannot represent the frontend formula exactly. When delay is nonzero, the dashboard deliberately uses its existing local estimate and labels it as a local fallback. The proxy does not approximate days as weeks.

## Configuration and deployment limits

For local development, run FastAPI bound to `127.0.0.1:8000` and set `CASHSENSE_BACKEND_URL=http://127.0.0.1:8000` plus the same random `CASHSENSE_BACKEND_TOKEN` in the Next.js and Python server environments. Never use a `NEXT_PUBLIC_` variable for either value. Missing configuration, timeouts, unavailable services, and invalid responses leave the existing local forecast active with a clear source label. Requests time out after eight seconds.

## Authentication, CORS, size limits, and abuse controls

FastAPI requires the `X-CashSense-Backend-Token` header on every route except `GET /health` and CORS preflight. Comparison is constant-time and a missing server token fails closed. The Next.js proxy reads `CASHSENSE_BACKEND_TOKEN` only in server code and adds the header on upstream requests; it never returns or embeds the token in browser responses. Do not use the health response to expose environment details.

CORS is deny-by-default. `CASHSENSE_CORS_ORIGINS` may contain a comma-separated list of exact origins if an approved browser client is added; the current dashboard calls the same-origin Next.js proxy and does not need direct browser access to FastAPI. The token header is intentionally not CORS-allowed.

FastAPI caps request bodies at 1 MB and applies a process-local limit of 120 requests per minute across the instance. The Next proxy caps request bodies at 256 KB. These limits protect parsing and bound basic abuse, but are instance-local and are not a distributed rate limiter. Keep the Python service to one instance until a shared rate-limit store is configured, and enable host/platform edge rate limits before substantial public use.

## Hosting plan

The simplest Vercel-compatible arrangement is a separate Render Python web service using the included [`backend/render.yaml`](../backend/render.yaml), with the service's HTTPS URL and generated secret configured in Vercel. This is an authenticated HTTPS endpoint, not a private Vercel-to-Render network connection: every API route requires the shared secret, CORS denies browser origins by default, and `/health` is the only public route. Do not deploy it without the blueprint-generated token. Use the Render dashboard's secret environment variable controls to copy that value into Vercel's `CASHSENSE_BACKEND_TOKEN`; never paste it into a terminal transcript, source file, or chat.

The Render blueprint sets its root to `backend`, installs the existing `backend/requirements.txt`, starts Uvicorn, provides `/health` for host health checks, generates a backend token, disables auto-deploys, and leaves CORS empty. After creating the service manually, configure Vercel server-only variables:

| Variable | Value |
| --- | --- |
| `CASHSENSE_BACKEND_URL` | The Render service HTTPS origin, for example `https://<service>.onrender.com` |
| `CASHSENSE_BACKEND_TOKEN` | The exact generated Render `CASHSENSE_BACKEND_TOKEN` secret |
| `CASHSENSE_AI_MODE` | `mock` |

The Next proxy rejects non-HTTPS remote backend URLs. Local loopback HTTP is permitted for development only. Do not configure `CASHSENSE_BACKEND_URL` or the shared token as `NEXT_PUBLIC_*`. Keep the Python service to one instance while using its process-local limiter and in-memory dataset store. The dashboard forecasting requests are stateless, but other dataset endpoints remain process-local. Put a platform-level rate limit in front of the public service before enabling broad access.

No service has been created or deployed. Required external setup is a Render account with access to this repository, a manually created service from the blueprint, and Vercel access to set the URL and copy the generated token into a server-only secret variable. There is no Anthropic credential requirement; Anthropic remains in mock mode.

Anthropic remains in mock mode. The AI context continues using the local estimate and is not switched to Python results.
