import assert from "node:assert/strict";
import test from "node:test";
import { handleForecastProxy } from "../../src/lib/backend-integration.ts";

const rows = [
  { week: "Oct 1", sales_walkin: 100, invoices_collected: 50, supplies: 20, payroll: 30, rent: 10, other: 5 },
  { week: "Oct 8", sales_walkin: 110, invoices_collected: 40, supplies: 25, payroll: 30, rent: 0, other: 5 },
];
const input = (overrides: Record<string, unknown> = {}) => ({ rows, horizon: 4, openingCash: 500, assumptions: { revenueChangePercent: 0, expenseChange: 0, paymentDelayDays: 0 }, ...overrides });
const forecastResponse = {
  recommended: "model", warnings: ["Short history: selection and scoring overlap."],
  backtest: { available: true, selection_in_sample: true, net_flow: { model_mae: 12.5, baseline_mae: 20, model_rmse: 18, baseline_rmse: 25, skill_vs_baseline: 0.375 } },
  model: { weeks: [1, 2, 3, 4].map((net) => ({ net })) },
  baseline_forecast: { weeks: [11, 12, 13, 14].map((net) => ({ net })) },
};

async function call(body: unknown, options: Parameters<typeof handleForecastProxy>[1] = {}) {
  return handleForecastProxy(new Request("http://localhost/api/backend/forecast", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { backendToken: "test-only-secret", ...options });
}

test("maps dashboard records to the backend forecast contract and validates the response", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const response = await call(input(), {
    backendUrl: "http://127.0.0.1:8000",
    fetcher: async (url, init) => { assert.equal(new Headers(init?.headers).get("x-cashsense-backend-token"), "test-only-secret"); calls.push({ url: String(url), body: JSON.parse(String(init?.body)) }); return Response.json(forecastResponse); },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ url: "http://127.0.0.1:8000/forecast", body: { rows: [
    { week: 1, sales_walkin: 100, invoices_collected: 50, supplies: 20, payroll: 30, rent: 10, other: 5 },
    { week: 2, sales_walkin: 110, invoices_collected: 40, supplies: 25, payroll: 30, rent: 0, other: 5 },
  ], horizon: 4, opening_cash: 500 } }]);
  assert.deepEqual(await response.json(), { points: [1, 2, 3, 4].map((net) => ({ week: `Week ${net}`, netCashFlow: net })), recommended: "model", warnings: forecastResponse.warnings, backtest: { available: true, selectionInSample: true, net_flow: forecastResponse.backtest.net_flow } });
});

test("plots the backend baseline when it is the recommended forecast", async () => {
  const response = await call(input(), {
    backendUrl: "http://127.0.0.1:8000",
    fetcher: async () => Response.json({ ...forecastResponse, recommended: "baseline" }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json() as { points: unknown[] }).points, [11, 12, 13, 14].map((net, index) => ({ week: `Week ${index + 1}`, netCashFlow: net })));
});

test("maps revenue and one-time expense controls through the real what-if fields", async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const response = await call(input({ assumptions: { revenueChangePercent: -20, expenseChange: 750, paymentDelayDays: 0 } }), {
    backendUrl: "http://127.0.0.1:8000",
    fetcher: async (url, init) => {
      const parsed = JSON.parse(String(init?.body)); calls.push({ url: String(url), body: parsed });
      return String(url).endsWith("/forecast") ? Response.json(forecastResponse) : Response.json({ after: { weeks: [10, 20, 30, 40].map((net) => ({ net })) } });
    },
  });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, "http://127.0.0.1:8000/whatif");
  assert.deepEqual(calls[1].body, { rows: [
    { week: 1, sales_walkin: 100, invoices_collected: 50, supplies: 20, payroll: 30, rent: 10, other: 5 },
    { week: 2, sales_walkin: 110, invoices_collected: 40, supplies: 25, payroll: 30, rent: 0, other: 5 },
  ], horizon: 4, opening_cash: 500, basis: "forecast", forecast_source: "recommended", sales_change_pct: -20, ops: [{ op: "add", field: "other", week: 1, amount: 750 }] });
  assert.deepEqual((await response.json() as { points: unknown[] }).points, [10, 20, 30, 40].map((net, index) => ({ week: `Week ${index + 1}`, netCashFlow: net })));
});

test("keeps day-based payment delay on local fallback without calling Python", async () => {
  let called = false;
  const response = await call(input({ assumptions: { revenueChangePercent: 0, expenseChange: 0, paymentDelayDays: 3 } }), { backendUrl: "http://127.0.0.1:8000", fetcher: async () => { called = true; return Response.json(forecastResponse); } });
  assert.equal(response.status, 422);
  assert.equal(called, false);
});

test("reports missing, unavailable, malformed, and invalid backend results without inventing forecasts", async () => {
  const body = input();
  const missing = await call(body);
  assert.equal(missing.status, 503);
  const unavailable = await call(body, { backendUrl: "http://127.0.0.1:8000", fetcher: async () => { throw new Error("connection refused"); } });
  assert.equal(unavailable.status, 503);
  const malformed = await call(body, { backendUrl: "http://127.0.0.1:8000", fetcher: async () => new Response("not json", { status: 200 }) });
  assert.match((await malformed.json() as { error: string }).error, /invalid response/i);
  const wrongShape = await call(body, { backendUrl: "http://127.0.0.1:8000", fetcher: async () => Response.json({ ...forecastResponse, model: { weeks: [] } }) });
  assert.equal(wrongShape.status, 503);
  const badStatus = await call(body, { backendUrl: "http://127.0.0.1:8000", fetcher: async () => Response.json({ detail: "bad request" }, { status: 422 }) });
  assert.equal(badStatus.status, 503);
  const noToken = await call(body, { backendUrl: "http://127.0.0.1:8000", backendToken: "" });
  assert.equal(noToken.status, 503);
});

test("rejects oversized proxy requests", async () => {
  const response = await handleForecastProxy(new Request("http://localhost/api/backend/forecast", { method: "POST", headers: { "content-length": "300000" }, body: " ".repeat(300_000) }), { backendUrl: "http://127.0.0.1:8000", backendToken: "test-only-secret" });
  assert.equal(response.status, 413);
});

test("rejects malformed dashboard requests", async () => {
  const response = await call({ rows: [], horizon: 4, openingCash: null, assumptions: { revenueChangePercent: 0, expenseChange: 0, paymentDelayDays: 0 } }, { backendUrl: "http://127.0.0.1:8000" });
  assert.equal(response.status, 400);
});


test("times out upstream calls and returns no fabricated forecast", async () => {
  const response = await call(input(), {
    backendUrl: "http://127.0.0.1:8000",
    timeoutMs: 5,
    fetcher: (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }),
  });
  assert.equal(response.status, 503);
  assert.match((await response.json() as { error: string }).error, /timed out/i);
});
