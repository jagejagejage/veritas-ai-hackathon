import assert from "node:assert/strict";
import { test } from "node:test";
import { danaCafe } from "../../src/lib/cash/demo.ts";
import { allowedNumbers, checkDraft, templateDraft } from "../../src/lib/cash/drafts.ts";
import { findRescuePlans } from "../../src/lib/cash/rescue.ts";
import { handleAsk, handleDrafts, RateLimiter } from "../../src/lib/ai/cash-ai.ts";

const live = { CASHSENSE_AI_MODE: "live", ANTHROPIC_API_KEY: "test" };
const post = (path: string, body: unknown) => new Request(`http://localhost/api/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const fresh = () => ({ limiter: new RateLimiter(100) });
const northgate = findRescuePlans(danaCafe).plans[1];
const earlyPay = northgate.actions[0];

test("template drafts pass their own number check", () => {
  const plans = findRescuePlans(danaCafe).plans;
  for (const plan of plans) for (const action of plan.actions.filter((a) => a.control === "ask" && a.kind !== "topUp")) {
    const draft = templateDraft(danaCafe, action);
    const check = checkDraft(`${draft.subject}\n${draft.body}`, allowedNumbers(danaCafe, action));
    assert.ok(check.ok, `${action.key}: ${check.offending.join(", ")}`);
  }
});

test("number check catches invented digits, spelled-out amounts and pressure terms", () => {
  const allowed = allowedNumbers(danaCafe, earlyPay);
  assert.ok(checkDraft("Could you pay the $7,500 in week 5? I'll take $75 off, so $7,425.", allowed).ok);
  assert.ok(checkDraft("Could you pay 1% early, one week sooner?", allowed).ok);
  assert.equal(checkDraft("I'll take $150 off.", allowed).ok, false);
  assert.equal(checkDraft("I'll take 2% off.", allowed).ok, false);
  assert.equal(checkDraft("That's seven thousand five hundred dollars.", allowed).ok, false);
  assert.equal(checkDraft("Pay three weeks early.", allowed).ok, false);
  assert.equal(checkDraft("Otherwise interest will apply.", allowed).ok, false);
});

test("ask: rules mode translates without calling a model", async () => {
  let calls = 0;
  const res = await handleAsk(post("ask", { question: "What if my catering customer pays two weeks late?", business: danaCafe }), {}, { ...fresh(), callModel: async () => { calls += 1; return "{}"; } });
  const body = await res.json();
  assert.equal(calls, 0);
  assert.equal(body.source, "rules");
  assert.deepEqual(body.scenario.ops, [{ op: "shift", match: { counterparty: "Northgate Offices" }, weeks: 2 }]);
});

test("ask: live model output is normalized and validated", async () => {
  const model = JSON.stringify({ unsupported: null, ops: [{ op: "shift", itemId: null, counterparty: "Northgate Offices", category: null, weeks: 2, direction: null, cents: null, week: null, label: null, repeat: null, percent: null, fromWeek: null }] });
  const body = await (await handleAsk(post("ask", { question: "northgate two weeks late", business: danaCafe }), live, { ...fresh(), callModel: async () => model })).json();
  assert.equal(body.source, "claude");
  assert.equal(body.scenario.ops[0].weeks, 2);
});

test("ask: a model that invents a result field or a huge shift is blocked", async () => {
  const hostile = JSON.stringify({ unsupported: null, ops: [{ op: "shift", itemId: null, counterparty: "Northgate Offices", category: null, weeks: 40, direction: null, cents: null, week: null, label: null, repeat: null, percent: null, fromWeek: null }] });
  const body = await (await handleAsk(post("ask", { question: "x", business: danaCafe }), live, { ...fresh(), callModel: async () => hostile })).json();
  assert.equal(body.scenario, undefined);
  assert.match(body.rejected, /validator blocked/);
});

test("ask: model failure falls back to rules", async () => {
  const body = await (await handleAsk(post("ask", { question: "What if sales drop 10%?", business: danaCafe }), live, { ...fresh(), callModel: async () => { throw new Error("down"); } })).json();
  assert.equal(body.source, "rules");
  assert.equal(body.scenario.ops[0].percent, -10);
  assert.match(body.note, /unavailable/);
});

test("ask: bad requests are rejected", async () => {
  assert.equal((await handleAsk(new Request("http://x/api/ask", { method: "POST", headers: { "content-type": "text/plain" }, body: "hi" }), {}, fresh())).status, 415);
  assert.equal((await handleAsk(post("ask", { question: "", business: danaCafe }), {}, fresh())).status, 400);
  assert.equal((await handleAsk(post("ask", { question: "hi", business: { ...danaCafe, items: "nope" } }), {}, fresh())).status, 400);
  const limiter = new RateLimiter(1);
  await handleAsk(post("ask", { question: "hi", business: danaCafe }), {}, { limiter });
  assert.equal((await handleAsk(post("ask", { question: "hi", business: danaCafe }), {}, { limiter })).status, 429);
});

test("drafts: Claude's draft with an invented number is replaced by the template", async () => {
  const model = JSON.stringify({ subject: "Quick favour", body: "Hi! Could you pay the $7,500 early? I can knock $200 off. Thanks, Dana" });
  const body = await (await handleDrafts(post("drafts", { business: danaCafe, planId: northgate.id }), live, { ...fresh(), callModel: async () => model })).json();
  assert.equal(body.drafts.length, 1);
  assert.equal(body.drafts[0].source, "template");
  assert.deepEqual(body.drafts[0].blocked, ["200"]);
});

test("drafts: a clean Claude draft is kept", async () => {
  const model = JSON.stringify({ subject: "Invoice #1042", body: "Hi Northgate team, could you pay invoice #1042 ($7,500) in week 5 instead of week 6? I'm happy to take $75 off, so $7,425. Thanks, Dana, Dana's Corner Café" });
  const body = await (await handleDrafts(post("drafts", { business: danaCafe, planId: northgate.id }), live, { ...fresh(), callModel: async () => model })).json();
  assert.equal(body.drafts[0].source, "claude");
});

test("drafts: plan ids are re-derived on the server", async () => {
  const res = await handleDrafts(post("drafts", { business: danaCafe, planId: "made-up" }), {}, fresh());
  assert.equal(res.status, 409);
});


test("production never enables paid Claude calls, even with opt-in configuration", async () => {
  const body = await (await handleAsk(post("ask", { question: "What if sales drop 10%?", business: danaCafe }), { ...live, NODE_ENV: "production", CASHSENSE_ALLOW_PUBLIC_LIVE: "true" }, { ...fresh(), callModel: async () => { throw new Error("must not call Claude"); } })).json();
  assert.equal(body.source, "rules");
});
