# CashSense backend (FastAPI)

Takes weekly cash-flow CSV data, predicts future weeks, compares the prediction to a simple baseline,
and calculates what happens if sales or costs change. Includes endpoints and tool definitions for a
frontend and an AI chatbot. Education tool, not financial advice.

## Run

Use Python 3.10 or newer. `requirements.txt` currently specifies minimum versions rather than a locked set and includes the pytest/httpx test dependencies; resolve and pin a reproducible runtime set before a hosted release.

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload          # http://127.0.0.1:8000  (interactive docs at /docs)
python3 -m pytest -q                   # 46 tests
```

Run the chronological holdout comparison for the included fictional sample with:

```bash
python scripts/evaluate_holdout.py
```

This separates method selection (first five weeks) from evaluation (last three weeks). Its output is preserved in [`docs/forecast-holdout-sample.json`](../docs/forecast-holdout-sample.json). The small illustrative sample is not evidence of accuracy on real businesses. The API's own backtest is selection-in-sample and must not be presented as a holdout evaluation.

Required for API access: set a strong `CASHSENSE_BACKEND_TOKEN` in the server environment. Every route except `GET /health` and CORS preflight requires it in the `X-CashSense-Backend-Token` header. The service fails closed when the token is unset.

Optional env var: `CASHSENSE_CORS_ORIGINS` (comma-separated, default empty, which denies browser origins). The dashboard calls FastAPI through its same-origin Next.js server proxy, so direct browser CORS access is not needed. CORS is not authentication. See [`../docs/backend-integration.md`](../docs/backend-integration.md) for deployment configuration.

## CSV format

```
week,sales_walkin,invoices_collected,supplies,payroll,rent,other
1,3000,1500,1800,0,3000,0
```

Weeks run 1..N with no gaps. Amounts are dollars, zero or more, at most 2 decimals. The header must match exactly (any column order). Errors come back as `422` with `code`, `row` and `column`. See `data/sample-cafe.csv`.

## Endpoints

| Method | Path | What it does |
| --- | --- | --- |
| POST | `/datasets` | Upload a CSV (multipart: `file`, `opening_cash`, `buffer`). Returns a `dataset_id`. |
| POST | `/datasets/json` | Same, from JSON rows. |
| POST | `/datasets/sample` | Load the fictional sample café (opening cash $2,000). |
| GET | `/datasets/{id}` | Read a dataset back. |
| POST | `/projection` | Cash week by week for the rows exactly as given (the plan), plus a plain-English warning. |
| POST | `/forecast` | Predict the next `horizon` weeks, with a baseline comparison, backtest accuracy and a rough uncertainty band. |
| POST | `/backtest` | Only the model-vs-baseline accuracy. |
| POST | `/whatif` | Change sales or costs and get cash before and after, a diff, and a plain-English summary. |
| GET | `/scenario/schema` | JSON Schema for scenario ops. |
| GET | `/chat/tools?format=anthropic\|openai` | Tool definitions to hand to an LLM. |
| GET | `/chat/system-prompt` | A matching system prompt. |
| POST | `/chat/execute` | Run a tool call chosen by the LLM. |
| GET | `/health` | Liveness check. |

Every analysis endpoint accepts either `dataset_id` or inline `rows` (not both), plus optional `opening_cash` and `buffer` overrides.

### Quick tour

```bash
curl -s -X POST localhost:8000/datasets/sample \
  -H "x-cashsense-backend-token: $CASHSENSE_BACKEND_TOKEN"          # -> {"dataset_id": "abc123...", ...}

curl -s -X POST localhost:8000/forecast -H 'content-type: application/json' \
  -H "x-cashsense-backend-token: $CASHSENSE_BACKEND_TOKEN" \
  -d '{"dataset_id":"abc123","horizon":8}'

# "What if sales drop 20% and costs rise 10%?" applied to the predicted weeks
curl -s -X POST localhost:8000/whatif -H 'content-type: application/json' \
  -H "x-cashsense-backend-token: $CASHSENSE_BACKEND_TOKEN" \
  -d '{"dataset_id":"abc123","sales_change_pct":-20,"expense_change_pct":10}'

# "What if my catering customer pays 2 weeks late?" applied to the uploaded weeks as given
curl -s -X POST localhost:8000/whatif -H 'content-type: application/json' \
  -H "x-cashsense-backend-token: $CASHSENSE_BACKEND_TOKEN" \
  -d '{"dataset_id":"abc123","basis":"plan","ops":[{"op":"shift","field":"invoices_collected","from_week":6,"by_weeks":2,"amount":"all"}]}'
```

### What-if

- `sales_change_pct` scales `sales_walkin` and `invoices_collected`. `expense_change_pct` scales `supplies`, `payroll`, `rent` and `other`. Range -100 to 200.
- `ops` (max 5, applied in order): `shift` (move money between weeks), `add` (one-off amount), `scale` (multiply a range).
- `basis: "forecast"` (default) changes the predicted weeks. `basis: "plan"` changes the uploaded weeks as given.
- Invalid scenarios return `422` listing every problem with a JSON-pointer path, such as `/ops/1/week`.

## Forecasting and the baseline

- **Baseline:** trailing 4-week average per field (`baseline: "naive"` repeats last week instead).
- **Model:** for each field, the best of naive, moving average, exponential smoothing, damped trend, and seasonal naive/mean for periods 2 to 4 (catches biweekly payroll and monthly rent), chosen by a walk-forward backtest.
- **Comparison:** model vs baseline on net weekly cash flow (MAE, RMSE, `skill_vs_baseline` = 1 - model MAE / baseline MAE). `recommended` says which one to trust.
- **Uncertainty:** an 80% band and a rough chance of going below $0, from backtest errors. Treat as a guide only.

### Known limits (read before the demo)

- **Short history is optimistic.** Methods are picked and scored on the same few test points (`selection_in_sample: true`). With under 12 weeks the response carries a warning.
- **One-offs can look recurring.** With about 8 weeks, a seasonal method can read a one-time repair or big job as a repeating event. Use `basis: "plan"` when you already know the upcoming weeks.
- Fewer than 5 weeks means no backtest; the baseline is used.
- The dataset store is in memory and resets on restart.
- Dataset IDs are not shared between instances. A multi-instance/serverless deployment needs stateless request bodies or shared durable storage before using IDs across requests.
- The API requires a shared token and has a process-local 120 requests/minute limit. The limit is not shared across instances.
- No Anthropic key is used by this Python service. CashSense's existing Claude route is separate and remains in mock mode unless deliberately configured server-side.

## Connecting a chatbot

The model only picks a tool and its arguments. Every number comes from the engine, so the bot quotes figures instead of computing them.

1. `GET /chat/tools?format=anthropic` (or `openai`) and pass the result as the model's tools. Use `GET /chat/system-prompt` as the system prompt.
2. When the model returns a tool call, send `{"tool": "...", "arguments": {...}}` to `POST /chat/execute`.
3. Give the result back to the model. It contains `ok`, a ready-to-quote `summary`, and full `data`. On `ok: false` it contains `error` and `details` the model can explain or fix.
4. Put the `dataset_id` in the conversation context so the model can pass it in each call.

Tools: `get_forecast`, `run_what_if`, `get_backtest`.

## Layout

```
app/engine.py       deterministic cash projection, status rules, plain-English warnings
app/forecasting.py  candidate models, backtest, baseline comparison, uncertainty
app/whatif.py       scenario ops (shift / add / scale) on integer cents
app/csv_io.py       strict CSV parsing
app/schemas.py      request models and validation
app/service.py      use-cases shared by REST and chat tools
app/chat.py         tool definitions and executor
app/main.py         FastAPI app
tests/              46 tests incl. the hand-checked golden numbers
```
