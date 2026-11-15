# CashSense backend integration

**Status:** Liam's FastAPI implementation has been added under [`backend/`](../backend/). Its local contract is described here and in `backend/README.md`. The Next.js dashboard still uses its local forecast. No hosted backend URL, authentication, or durable dataset storage has been configured, so no frontend requests are made yet.

## Data sent

The backend contract differs from the old provisional browser adapter (`BackendForecastRequest` in `src/lib/types.ts`):

- `POST /datasets/json` accepts `rows` with sequential integer `week` values 1..N and the six inflow/outflow fields, plus `opening_cash` and `buffer`, in dollars. Or upload CSV to `POST /datasets`.
- `POST /forecast` accepts `dataset_id` or inline `rows`, `horizon` (1–26; default 8), optional `opening_cash`/`buffer`, `baseline` (`moving_average` or `naive`), and `backtest_horizon` (1–8).
- `POST /backtest` reports the same built-in rolling-origin comparison.
- `POST /whatif` accepts `basis`, forecast controls, percent changes, and validated shift/add/scale operations. The dashboard's day-based delay and one-time expense controls do not map directly; do not silently approximate them.

Amounts cross the API in dollars (up to two decimals) and are represented as integer cents internally. The dataset store is in process memory and resets on restart. `dataset_id` is therefore not durable across restarts or independent service instances.

`toBackendForecastRequest` in `src/lib/backend-adapter.ts` is the old provisional serialization boundary. It prepares a plain object and deliberately makes no network call. It does not match the confirmed FastAPI request and response shapes; replace or amend it before making a connection.

## Expected response

`POST /forecast` returns:

- `model.weeks`: forecast cash projections by week, with cash values in dollars.
- `baseline_forecast`: baseline comparison; `backtest.net_flow` includes MAE/RMSE and `skill_vs_baseline` in dollars and unitless ratio, respectively.
- `recommended`, `warnings`, and `uncertainty`. The uncertainty interval is a rough Gaussian approximation based on historical backtest errors, not a calibrated guarantee.
- `history`, `starting_cash`, and model methods used.

The provisional TypeScript adapter is not wired to this real response shape and must be replaced or amended before making a connection. Do not label built-in rolling-origin metrics as holdout metrics: candidate selection and reporting use the same rolling windows (`selection_in_sample: true`). A separate five-week train / three-week chronological holdout was run on the supplied fictional sample. Its reproducible metrics are in [`forecast-holdout-sample.json`](./forecast-holdout-sample.json); they are illustrative only.

## Dashboard, simulator, and CashSense AI

The dashboard currently calculates forecasts locally using `buildForecast`. Keep this behavior until a hosted Python service, its durable dataset strategy, authenticated server-to-server contract, and tested adapter are ready. Vercel should call the Python service through a Next.js server route using server-only environment variables, request/response validation, bounded timeouts, and a shared rate limit. Do not send business data to a public unauthenticated service or expose the service URL/credentials to browser code.

CashSense AI receives calculated dashboard context: up to 12 weeks of history, the current local forecast, spending-category totals, current balance (or `null`), and scenario assumptions. Its server route uses those calculated values and does not claim that the Python backend is connected. After integration, decide explicitly whether AI receives local results, backend results, or both, and label their source and model accordingly.

## CSV input

Required columns are `week`, `sales_walkin`, `invoices_collected`, `supplies`, `payroll`, `rent`, and `other`. Weeks must be unique, oldest to newest, and use `YYYY-MM-DD`, `MM/DD/YYYY`, `Month DD [YYYY]`, or sequential `Week N` labels. Amounts must be non-negative numbers; use zero for no activity. `starting_cash_balance` is optional; if present it must be consistent across populated rows. No balance is inferred from weekly flows.

## Remaining integration work

- Choose and configure a Python hosting target, TLS URL, health monitoring, and deploy procedure.
- Replace process-local dataset IDs with stateless requests or durable/shared storage before multi-instance hosting.
- Specify backend authentication, shared rate limiting, privacy/retention, allowed origins, request limits, and timeout behavior.
- Implement a server-only Next.js proxy that maps dashboard rows/scenarios precisely and validates backend responses.
- Render backend source/method, baseline metrics, limitations, and warnings transparently; decide whether AI receives backend outputs.
- Keep live Anthropic disabled until spend/account controls and shared abuse controls are in place. Configure `ANTHROPIC_API_KEY` only in a secret manager/environment UI; never in chat, source, or `NEXT_PUBLIC_*`.

## Backend review notes

The implementation uses Python 3.10+ syntax. `requirements.txt` uses broad minimum versions and includes test packages; there is no pinned dependency lockfile. The FastAPI app defaults to wildcard CORS, has no authentication or shared rate limiter, limits CSV uploads to 1 MB and datasets to 156 rows, and stores at most 200 datasets in process memory. Configure CORS narrowly and add service-side access controls before hosting it publicly. Its chatbot endpoints expose deterministic tool execution and schemas only; they do not call Anthropic.
