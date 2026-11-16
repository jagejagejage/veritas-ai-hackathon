"use client";

import { useState, type FormEvent } from "react";
import { ArrowUp } from "lucide-react";
import { project } from "@/lib/cash/engine";
import { dollars } from "@/lib/cash/format";
import { applyScenario, validateScenario, type Scenario } from "@/lib/cash/scenario";
import type { Business, Projection } from "@/lib/cash/types";

export interface WhatIf { question: string; projection: Projection; description: string[]; source: "claude" | "rules"; note?: string }

const EXAMPLES = [
  "What if my catering customer pays two weeks late?",
  "What if sales drop 15% from week 3?",
  "What if the fridge dies and costs $2,500 in week 4?",
  "What if I hire help for $600 a week from week 2?",
];

export function AskPanel({ business, base, result, onResult }: {
  business: Business;
  base: Projection;
  result: WhatIf | null;
  onResult: (result: WhatIf | null) => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [rejected, setRejected] = useState<{ text: string; source: string } | null>(null);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setDraft(q);
    setBusy(true);
    setRejected(null);
    try {
      const response = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q, business }), signal: AbortSignal.timeout(25_000) });
      const body = await response.json() as { source?: "claude" | "rules"; scenario?: Scenario; description?: string[]; rejected?: string; note?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Couldn't read that question.");
      if (!body.scenario) { onResult(null); setRejected({ text: body.rejected ?? "That question isn't supported yet.", source: body.source ?? "rules" }); return; }
      // Validate again in the browser before the engine touches it.
      const checked = validateScenario(body.scenario, business);
      if (!checked.ok) { onResult(null); setRejected({ text: checked.reason, source: body.source ?? "rules" }); return; }
      onResult({ question: q, projection: project(business, applyScenario(business, checked.scenario)), description: body.description ?? [], source: body.source ?? "rules", note: body.note });
    } catch (error) {
      setRejected({ text: error instanceof Error && error.name !== "TimeoutError" ? error.message : "That took too long. Try again.", source: "network" });
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(draft);
  }

  const after = result?.projection;
  const firstShort = (p: Projection) => p.weeks.find((week) => week.endCents < 0);
  const beforeShort = firstShort(base);
  const afterShort = after ? firstShort(after) : undefined;

  return <div>
    <form onSubmit={submit} className="relative">
      <label htmlFor="ask" className="sr-only">Ask a what-if question</label>
      <input id="ask" className="field pr-14" value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 400))} placeholder="What if…" autoComplete="off" enterKeyHint="go" />
      <button type="submit" disabled={!draft.trim() || busy} aria-label="Run what-if" className="btn btn-primary absolute right-1.5 top-1/2 !min-h-9 !w-9 -translate-y-1/2 !p-0"><ArrowUp size={18} /></button>
    </form>
    <div className="mt-3 flex flex-wrap gap-2">
      {EXAMPLES.map((example) => <button key={example} type="button" className="chip" onClick={() => void ask(example)} disabled={busy}>{example.replace(/^What if /, "").replace(/\?$/, "")}</button>)}
    </div>

    <div aria-live="polite" className="mt-5">
      {busy && <p className="muted text-[14px]">Reading your question…</p>}
      {!busy && rejected && <div className="well rise p-4">
        <p className="eyebrow">Not run</p>
        <p className="mt-1 text-[14px]">{rejected.text}</p>
        <p className="mt-2 text-[12px] faint">Nothing was calculated. CashSense only runs changes that pass its validator.</p>
      </div>}
      {!busy && result && after && <div className="well rise p-4 sm:p-5">
        <p className="eyebrow">Understood as</p>
        <ul className="mt-1.5 grid gap-1 text-[14px]">{result.description.map((line) => <li key={line}>{line}</li>)}</ul>
        <p className="mt-2 text-[12px] faint">{result.source === "claude" ? "Translated by Claude, checked by the validator, calculated by the engine." : "Translated by built-in rules, checked by the validator, calculated by the engine."}{result.note ? ` ${result.note}` : ""}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div><p className="text-[12px] faint">Lowest point now</p><p className="figure text-[20px]">{dollars(base.lowest.endCents)}</p><p className="text-[12px] faint">week {base.lowest.week}</p></div>
          <div><p className="text-[12px] faint">With this change</p><p className="figure text-[20px]" style={{ color: after.lowest.endCents < 0 ? "var(--bad)" : after.lowest.endCents < business.floorCents ? "var(--warn)" : "var(--good)" }}>{dollars(after.lowest.endCents)}</p><p className="text-[12px] faint">week {after.lowest.week}</p></div>
        </div>
        <p className="mt-3 text-[14px] muted">{verdict(beforeShort?.week, afterShort?.week, after, business)}</p>
        <button type="button" className="btn btn-quiet btn-sm mt-2 !px-0" onClick={() => { onResult(null); setDraft(""); }}>Clear what-if</button>
      </div>}
    </div>
  </div>;
}

function verdict(before: number | undefined, after: number | undefined, projection: Projection, business: Business): string {
  const weeksShort = projection.weeks.filter((week) => week.endCents < 0).length;
  if (after === undefined) return projection.lowest.endCents >= business.floorCents ? "You'd stay above your cushion every week." : `You'd stay above zero, but dip under your ${dollars(business.floorCents)} cushion.`;
  const span = weeksShort > 1 ? ` and stay short for ${weeksShort} weeks` : "";
  if (before === undefined) return `This would create a shortfall in week ${after}${span}.`;
  if (after < before) return `The shortfall would come earlier, in week ${after}${span}.`;
  return `You'd first run short in week ${after}${span}.`;
}
