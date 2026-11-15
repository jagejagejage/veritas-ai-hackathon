# CashSense backend integration

The dashboard now calls a same-origin Next.js route (`POST /api/backend/forecast`). The route uses only the server-side `CASHSENSE_BACKEND_URL` setting and sends dashboard data to the Python API's `/forecast` endpoint and, when supported controls are active, `/whatif`. No backend URL or credential is placed in browser code.

## Request mapping

The proxy serializes frontend history to `rows` with `week` numbered 1 through N and the six money fields in dollars. It sends `horizon` (4, 8, or 12) and includes `opening_cash` only when the CSV supplied a starting balance. Revenue change maps to `sales_change_pct`. The one-time expense maps to an `add` operation on `other` in forecast week 1, matching the dashboard's existing control wording. The response uses `model.weeks[].net`, or `whatif.after.weeks[].net`, as weekly net flow. Only actual backend response data and backend warnings/backtest metrics are displayed.

The backend returns uncertainty bounds for projected closing cash, while this chart displays weekly net flow. Those bounds are not shown as net-flow uncertainty. The dashboard shows the backend's selected method, warnings, and its rolling backtest MAE when available. The backend marks this backtest `selection_in_sample`; the UI identifies it as overlapping method-selection history and does not call it holdout accuracy.

## Unsupported payment-delay control

The dashboard's payment-delay control is expressed in days. The backend accepts week-based shifts to individual fields; it cannot represent the frontend formula exactly. When delay is nonzero, the dashboard deliberately uses its existing local estimate and labels it as a local fallback. The proxy does not approximate days as weeks.

## Configuration and deployment limits

For local development, run FastAPI bound to `127.0.0.1:8000` and set `CASHSENSE_BACKEND_URL=http://127.0.0.1:8000` in the Next.js server environment. Never use a `NEXT_PUBLIC_` variable for the backend URL or credentials. Missing configuration, timeouts, unavailable services, and invalid responses leave the existing local forecast active with a clear source label. Requests time out after eight seconds.

The Python service currently has no authentication or shared rate limiter. Keep it on loopback or a private network with ingress restricted to the Next.js server. Do not give it a public unauthenticated URL. A public hosted deployment is blocked until a private network connection (or backend authentication plus ingress controls) and shared abuse controls are configured and verified. Vercel cannot reach a developer's loopback service; choose an appropriate private networking arrangement before hosting the dashboard.

Anthropic remains in mock mode. The AI context continues using the local estimate and is not switched to Python results.
