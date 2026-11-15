# CashSense backend integration (provisional)

**Status:** proposed client contract only. Liam has not supplied or confirmed an API, endpoint, authentication scheme, or response format. No backend requests are made by this version. Confirm this document against the FastAPI implementation before connecting it.

## Data sent

The proposed forecast request is `BackendForecastRequest` in `src/lib/types.ts`:

- `records`: one item per imported week, oldest first. Each item contains `week`, `sales_walkin`, `invoices_collected`, `supplies`, `payroll`, `rent`, and `other`, plus derived `revenue`, `expenses`, and `netCashFlow` in dollars. Derived values are `sales_walkin + invoices_collected`, `supplies + payroll + rent + other`, and revenue minus expenses.
- `horizonWeeks`: 4, 8, or 12.
- `scenario`: `revenueChangePercent`, one-time `expenseChange` in dollars, and `paymentDelayDays` from the dashboard controls.
- `startingCashBalance`: optional current balance in dollars. It is omitted when the user has not provided one; CashSense never fills in a default.

`toBackendForecastRequest` in `src/lib/backend-adapter.ts` is the serialization boundary. It prepares a plain object and deliberately makes no network call. The confirmed API may rename fields or use a different wire format; adapt at this boundary rather than changing dashboard types.

## Expected response

The provisional `BackendForecastResponse` contains:

- `predictions`: `week`, `netCashFlow`, and optional `interval` with `lower`, `upper`, and optional `confidenceLevel`.
- `warnings`: `severity` (`info`, `warning`, `critical`), `title`, `detail`, and optional `code` and `week`.
- optional `baselineComparison`: baseline and selected model names, metric names, and numeric values.
- optional `evaluationMetrics`: metrics such as `mae`, `rmse`, `mapePercent`, and `sampleCount`. Metric definitions and units must be supplied by Liam.
- `modelName` and `generatedAt`.

`fromBackendForecast` maps prediction values to the current chart's forecast points. If intervals are absent, the chart's bounds equal the prediction, so the UI must not describe these as an uncertainty range. Warnings map to the existing alert shape. Baseline and evaluation values are retained in the response contract but need a UI presentation agreed with Liam; they are not currently rendered.

## Dashboard, simulator, and CashSense AI

The dashboard currently calculates the forecast and What if results locally using `buildForecast`. That behavior remains active with no backend. When an API is confirmed, the adapter can convert the imported rows, selected horizon, optional current balance, and scenario into the request; validated backend predictions can then feed the chart and simulator output while local results remain available as a fallback.

CashSense AI receives calculated dashboard context: up to 12 weeks of history, the current local forecast, spending-category totals, current balance (or `null`), and scenario assumptions. Its server route uses those calculated values and does not claim that the Python backend is connected. After integration, decide explicitly whether AI receives local results, backend results, or both, and label their source and model accordingly.

## CSV input

Required columns are `week`, `sales_walkin`, `invoices_collected`, `supplies`, `payroll`, `rent`, and `other`. Weeks must be unique, oldest to newest, and use `YYYY-MM-DD`, `MM/DD/YYYY`, `Month DD [YYYY]`, or sequential `Week N` labels. Amounts must be non-negative numbers; use zero for no activity. `starting_cash_balance` is optional; if present it must be consistent across populated rows. No balance is inferred from weekly flows.

## Liam's integration details needed

Please provide the confirmed route(s) and HTTP methods, request/response examples or OpenAPI schema, field names and units, date/week format and ordering, balance semantics, supported horizons and scenario controls, whether intervals are returned and their confidence level, warning codes/severity meanings, baseline metric definitions, evaluation metric units and validation window, error response shape, authentication/CORS expectations, timeout/rate limits, and whether the service is safe to call with business financial data. Also confirm how its output should be sourced and labeled in CashSense AI.
