# CashSense

**See a cash shortfall coming. Find a practical way through it.**

CashSense helps small businesses understand when scheduled income and expenses could leave them short of cash. Its dashboard projects the balance week by week, explains potential trouble, and lets owners explore possible responses.

**[Open the live demo](https://cashsense-five.vercel.app/)** · [View the deployed integration branch](https://github.com/jagejagejage/veritas-ai-hackathon/tree/integration/cashsense-liam)

> **For judges:** The live demo is deployed from `integration/cashsense-liam`. GitHub's default branch, `main`, currently contains an earlier implementation. Switch to the integration branch to review the code that matches the demo.

## What it does

- **Cash-flow dashboard:** Shows a projected weekly balance and highlights weeks below the business's cash cushion or below zero.
- **Plain-language warnings:** Explains when a low balance is expected and which scheduled items contribute to it.
- **Rescue planner:** Searches combinations of supported actions, such as deferring or splitting an expense, collecting an invoice early, or adding cash. Results are calculated by the app's TypeScript engine.
- **What-if scenarios:** Lets users explore how changing the timing or amount of cash items affects the projection.
- **CSV import:** Loads weekly business cash-flow data through a guided import flow. A sample CSV is included.

The dashboard uses a **fictional café dataset** for demonstration. It is not real business or customer information.

## Try it

Visit the [live demo](https://cashsense-five.vercel.app/) to explore the sample café. You can also download the sample CSV from the app.

## Run locally

The deployed version uses Next.js and runs its dashboard calculations in TypeScript. The main demo works without credentials or the Python service.

Requirements: Node.js with npm.

```bash
git clone https://github.com/jagejagejage/veritas-ai-hackathon.git
cd veritas-ai-hackathon
git switch integration/cashsense-liam
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Optional Python backend

The repository also includes a FastAPI backend for CSV handling, projections, forecasting, and what-if API endpoints. The dashboard's TypeScript engine remains the source of its displayed balance and rescue calculations; the Python backend is an optional service behind the existing server-side proxy.

To start the backend locally (Python 3.10+):

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export CASHSENSE_BACKEND_TOKEN="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
uvicorn app.main:app --reload
```

For the frontend proxy, set `CASHSENSE_BACKEND_URL=http://127.0.0.1:8000` and the same `CASHSENSE_BACKEND_TOKEN` in the Next.js server environment. See [backend setup](./docs/backend-integration.md) and the [backend README](./backend/README.md) for details.

## How it is built

- **Web app:** Next.js, React, TypeScript, and Recharts.
- **Cash calculations:** Deterministic TypeScript functions using integer cents for projected balances, warnings, scenario changes, and rescue-plan search.
- **Python service:** FastAPI backend with CSV validation and forecasting endpoints, available through the existing Next.js proxy when configured.
- **AI status:** Claude integration code is present, but Claude is disabled in the deployed configuration. The dashboard's cash and rescue calculations do not depend on Claude.

## Team and event

Built by **Jage and Liam** for the **VERITAS AI International High School Hackathon 2026**.

## Demo video

[Watch the CashSense demo](https://youtu.be/bFDbm4rw4gQ?is=oZRydmn9PsWKXPza)

---

CashSense is a hackathon demonstration. Its sample data is fictional, its projections depend on the information entered, and its scenarios are for educational purposes—not financial advice.
