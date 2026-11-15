import assert from "node:assert/strict";
import { test } from "node:test";
import { demoRows, buildForecast, categoryTotals, toRecords } from "../../src/lib/demo-data.ts";
import { handleChatRequest, RateLimiter, parseScenario } from "../../src/lib/ai/server.ts";
import type { FinancialContext } from "../../src/lib/ai/types.ts";

const records = toRecords(demoRows);
const context: FinancialContext = {
  source: "demo",
  history: demoRows,
  forecast: buildForecast(demoRows, 8, 0, 0, 0).slice(demoRows.length),
  spendingCategories: categoryTotals(records).map(({ name, value }) => ({ name, value })),
  alerts: [{ title: "Invoice timing may be tight", detail: "A one-week delay could reduce next week’s net cash flow." }],
  currentCashBalance: null,
  assumptions: { revenueChangePercent: 0, expenseChange: 0, paymentDelayDays: 0 },
};

function request(messages: unknown, financialContext: unknown = context, ip = "test-client", contentType = "application/json") {
  return new Request("http://localhost/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": contentType, "x-forwarded-for": ip },
    body: JSON.stringify({ messages, context: financialContext }),
  });
}

test("default configuration returns a local mock without calling Anthropic", async () => {
  let calls = 0;
  let delay = 0;
  const response = await handleChatRequest(request([{ role: "user", content: "What is my biggest expense?" }]), {}, {
    callModel: async () => { calls += 1; return "unexpected"; },
    sleep: async (milliseconds) => { delay = milliseconds; },
    limiter: new RateLimiter(),
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.mock, true);
  assert.match(body.reply, /Example response · Mock mode/);
  assert.match(body.reply, /Payroll is the largest spending category/);
  assert.equal(calls, 0);
  assert.equal(delay, 620);
});

test("live mode without both server credentials fails closed", async () => {
  let calls = 0;
  const response = await handleChatRequest(request([{ role: "user", content: "Summarize my cash flow" }]), { CASHSENSE_AI_MODE: "live", ANTHROPIC_API_KEY: "key" }, {
    callModel: async () => { calls += 1; return "unexpected"; }, limiter: new RateLimiter(),
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /ANTHROPIC_API_KEY and ANTHROPIC_MODEL/);
  assert.equal(calls, 0);
});

test("live mode uses only the server-configured model", async () => {
  let usedModel = "";
  const response = await handleChatRequest(request([{ role: "user", content: "Summarize my cash flow" }]), {
    CASHSENSE_AI_MODE: "live", ANTHROPIC_API_KEY: "server-only-test-key", ANTHROPIC_MODEL: "claude-haiku-4-5-20251001",
  }, { callModel: async ({ model }) => { usedModel = model; return "A cautious summary."; }, limiter: new RateLimiter() });
  assert.equal(response.status, 200);
  assert.equal(usedModel, "claude-haiku-4-5-20251001");
  assert.equal((await response.json()).mock, false);
});

test("invalid requests and financial context are rejected", async () => {
  const badMessages = await handleChatRequest(request([{ role: "assistant", content: "I begin first" }]), {}, { callModel: async () => "", limiter: new RateLimiter() });
  assert.equal(badMessages.status, 400);
  const badContext = structuredClone(context) as FinancialContext;
  badContext.assumptions.expenseChange = 99_000;
  const badFinancialContext = await handleChatRequest(request([{ role: "user", content: "What is next?" }], badContext), {}, { callModel: async () => "", limiter: new RateLimiter() });
  assert.equal(badFinancialContext.status, 400);
});

test("chat API rejects form-style requests before using the model", async () => {
  let calls = 0;
  const response = await handleChatRequest(request([{ role: "user", content: "Summarize my cash flow" }], context, "test-client", "text/plain"), {}, {
    callModel: async () => { calls += 1; return "unexpected"; }, limiter: new RateLimiter(),
  });
  assert.equal(response.status, 415);
  assert.match((await response.json()).error, /application\/json/);
  assert.equal(calls, 0);
});

test("simulator scenarios stay within dashboard limits and calculate from existing rows", async () => {
  const assumptions = parseScenario("What happens if sales fall 20%?", context.assumptions);
  assert.deepEqual(assumptions, { revenueChangePercent: -20, expenseChange: 0, paymentDelayDays: 0 });
  assert.equal(parseScenario("What happens if sales fall 45%?", context.assumptions), null);
  let calls = 0;
  const response = await handleChatRequest(request([{ role: "user", content: "What happens if sales fall 20%?" }]), {}, {
    callModel: async () => { calls += 1; return "should not call"; }, sleep: async () => {}, limiter: new RateLimiter(),
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.mock, true);
  assert.match(body.reply, /CashSense simulator estimate/);
  assert.match(body.reply, /weekly net cash flow/);
  assert.equal(calls, 0);
  const latePayment = await handleChatRequest(request([{ role: "user", content: "What happens if a customer pays late?" }]), {}, {
    callModel: async () => { calls += 1; return "should not call"; }, sleep: async () => {}, limiter: new RateLimiter(),
  });
  assert.match((await latePayment.json()).reply, /payment delay 7 days/);
});

test("rate limiting is enforced without retrying requests", async () => {
  const limiter = new RateLimiter(2, 60_000);
  const dependencies = { callModel: async () => "ok", sleep: async () => {}, now: () => 1_000, limiter };
  for (let i = 0; i < 2; i += 1) {
    const response = await handleChatRequest(request([{ role: "user", content: `Question ${i}` }]), {}, dependencies);
    assert.equal(response.status, 200);
  }
  const limited = await handleChatRequest(request([{ role: "user", content: "Question 3" }]), {}, dependencies);
  assert.equal(limited.status, 429);
});

test("provider credit failures are clear and do not leak provider details", async () => {
  const response = await handleChatRequest(request([{ role: "user", content: "Summarize my cash flow" }]), {
    CASHSENSE_AI_MODE: "live", ANTHROPIC_API_KEY: "server-only-test-key", ANTHROPIC_MODEL: "claude-haiku-4-5-20251001",
  }, { callModel: async () => { throw Object.assign(new Error("private provider detail"), { status: 402 }); }, limiter: new RateLimiter() });
  assert.equal(response.status, 402);
  assert.match((await response.json()).error, /insufficient credits/);
});
