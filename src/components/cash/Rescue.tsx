"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, X } from "lucide-react";
import { dollars } from "@/lib/cash/format";
import type { Plan, RescueResult } from "@/lib/cash/rescue";
import type { Business } from "@/lib/cash/types";

interface DraftView { actionKey: string; to: string; subject: string; body: string; source: "claude" | "template"; allowed: string[]; blocked?: string[] }

const RISK_LABEL = { none: "No goodwill spent", low: "Small ask", high: "Big ask" } as const;

function planName(plan: Plan): string {
  if (plan.actions.some((action) => action.kind === "topUp")) return "Cover the gap for a week";
  if (plan.tier === "You control") return plan.actions.length === 1 ? "One move you control" : `${plan.actions.length === 2 ? "Two" : "Three"} moves you control`;
  const ask = plan.actions.find((action) => action.control === "ask");
  return ask ? `One ask: ${ask.counterparty}` : "Rescue plan";
}

export function RescuePanel({ business, result, ms, selectedId, onSelect, onRun }: {
  business: Business;
  result: RescueResult | null;
  ms: number;
  selectedId: string | null;
  onSelect: (plan: Plan | null) => void;
  onRun: () => void;
}) {
  const [draftsFor, setDraftsFor] = useState<Plan | null>(null);
  const closeDrafts = useCallback(() => setDraftsFor(null), []);

  if (!result) {
    return <div className="flex flex-col items-start gap-5">
      <p className="max-w-[46ch] muted">CashSense tries every allowed move on the bills and invoices you already have, in combinations of up to three. It keeps only the plans that stay above your cushion every week, then ranks them: moves you control first, then free asks, then moves that cost money.</p>
      <button type="button" className="btn btn-primary" onClick={onRun}>Find a rescue plan</button>
    </div>;
  }
  if (!result.needed) return <p className="muted">You stay above your {dollars(business.floorCents)} cushion every week. No rescue needed.</p>;
  if (!result.plans.length) return <p className="muted">No combination of the allowed moves keeps you above the cushion. Lower the cushion or add more flexibility to your bills.</p>;

  return <div>
    <p className="text-[13px] faint">Tested {result.tested.toLocaleString()} combinations of {result.candidates} real moves in {ms < 1 ? "under 1" : Math.round(ms)} ms. Exact math, no AI guessing.</p>
    <ol className="mt-4 grid gap-3">
      {result.plans.map((plan, index) => {
        const selected = plan.id === selectedId;
        const asks = plan.actions.filter((action) => action.control === "ask" && action.kind !== "topUp");
        return <li key={plan.id} className={`rise well p-4 transition-colors sm:p-5 ${selected ? "!border-[rgb(126_166_255_/_55%)] !bg-[rgb(126_166_255_/_7%)]" : ""}`} style={{ animationDelay: `${index * 70}ms` }}>
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <div>
              <p className="eyebrow">Plan {String.fromCharCode(65 + index)} · {plan.tier}</p>
              <h3 className="title mt-1">{planName(plan)}</h3>
            </div>
            <div className="text-right">
              <p className="figure text-[22px]">{plan.costCents === 0 ? "$0" : dollars(plan.costCents)}</p>
              <p className="text-[12px] faint">{plan.asks === 0 ? "No one to ask" : `${plan.asks} ${plan.asks === 1 ? "person" : "people"} to ask`}</p>
            </div>
          </div>
          <ul className="mt-3 grid gap-2.5">
            {plan.actions.map((action) => <li key={action.key} className="text-[14px]">
              <p className="font-medium">{action.title}</p>
              <p className="muted text-[13px]">{action.why}{" "}
                {action.annualRatePct !== null && <span style={{ color: action.annualRatePct > 36 ? "var(--warn)" : "var(--ink-2)" }}>Works out to about {Math.round(action.annualRatePct)}% a year{action.annualRatePct > 36 ? ", which is expensive money" : ""}.</span>}
                {" "}<span className="faint">{action.control === "you" ? "You control this." : RISK_LABEL[action.risk] + "."}</span>
              </p>
            </li>)}
          </ul>
          <div className="mt-3 grid gap-1 text-[13px]">
            <p><span className="faint">Lowest balance with this plan</span> <span className="figure">{dollars(plan.lowestCents)}</span> <span className="faint">in week {plan.projection.lowest.week}</span></p>
            {plan.stress && <p style={{ color: plan.stress.holds ? "var(--good)" : "var(--warn)" }}>
              {plan.stress.holds
                ? `Still holds if ${plan.stress.counterparty} pays a week late.`
                : `If ${plan.stress.counterparty} pays a week late, you'd still dip to ${dollars(plan.stress.lowestCents)} in week ${plan.stress.week}.`}
            </p>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className={`btn btn-sm ${selected ? "btn-primary" : "btn-glass"}`} aria-pressed={selected} onClick={() => onSelect(selected ? null : plan)}>{selected ? "Showing on chart" : "Preview on chart"}</button>
            {asks.length > 0 && <button type="button" className="btn btn-sm btn-glass" onClick={() => setDraftsFor(plan)}>Draft {asks.length === 1 ? "the message" : `${asks.length} messages`}</button>}
          </div>
        </li>;
      })}
    </ol>
    {result.concentration && <p className="mt-4 text-[13px] muted">{result.concentration.counterparty} is {result.concentration.sharePct}% of the money coming in. Every plan above works better once that payment is confirmed. A quick check-in with them this week is worth more than any forecast.</p>}
    <p className="mt-3 text-[12px] faint">Options to talk through, not financial advice. CashSense never sends anything for you.</p>
    {draftsFor && <DraftSheet business={business} plan={draftsFor} onClose={closeDrafts} />}
  </div>;
}

function highlight(text: string, allowed: string[]) {
  const parts = text.split(/(\$?\d[\d,]*(?:\.\d+)?%?)/g);
  return parts.map((part, index) => {
    const n = part.replace(/[$,%]/g, "");
    if (/\d/.test(part) && (allowed.includes(n) || allowed.includes(String(Number(n))))) return <mark key={index} className="checked">{part}</mark>;
    return <span key={index}>{part}</span>;
  });
}

function DraftSheet({ business, plan, onClose }: { business: Business; plan: Plan; onClose: () => void }) {
  const [drafts, setDrafts] = useState<DraftView[] | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const controller = new AbortController();
    fetch("/api/drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ business, planId: plan.id }), signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { drafts?: DraftView[]; error?: string };
        if (!response.ok || !body.drafts) throw new Error(body.error ?? "Couldn't write the messages.");
        setDrafts(body.drafts);
      })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Couldn't write the messages."); });
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { controller.abort(); window.removeEventListener("keydown", onKey); };
  }, [business, plan.id, onClose]);

  async function copy(draft: DraftView) {
    try {
      await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
      setCopied(draft.actionKey);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setError("Copy isn't available here. Select the text and copy it instead.");
    }
  }

  return createPortal(<div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby="draft-title">
    <button type="button" aria-label="Close" className="scrim absolute inset-0 cursor-default" onClick={onClose} />
    <div className="glass sheet sheet-in relative max-h-[88dvh] w-full max-w-[640px] overflow-y-auto rounded-b-none p-5 sm:rounded-b-[28px] sm:p-7" style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
      <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-white/20 sm:hidden" aria-hidden />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Ready to send yourself</p>
          <h2 id="draft-title" className="title mt-1">{planName(plan)}</h2>
        </div>
        <button ref={closeRef} type="button" className="btn btn-quiet btn-sm !px-2" onClick={onClose} aria-label="Close messages"><X size={18} /></button>
      </div>
      <p className="mt-2 text-[13px] muted">Highlighted numbers came from the engine. Any message with a number the plan doesn&apos;t contain is thrown out and replaced with the checked template.</p>
      {!drafts && !error && <p className="mt-6 muted" role="status">Writing…</p>}
      {error && <p className="mt-6" role="alert" style={{ color: "var(--warn)" }}>{error}</p>}
      <div className="mt-5 grid gap-4">
        {drafts?.map((draft) => <article key={draft.actionKey} className="well p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] faint">To {draft.to}</p>
            <p className="text-[12px] faint">{draft.source === "claude" ? "Written by Claude · numbers checked" : "Template · numbers checked"}</p>
          </div>
          <p className="mt-2 font-semibold">{highlight(draft.subject, draft.allowed)}</p>
          <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed muted">{highlight(draft.body, draft.allowed)}</p>
          {draft.blocked && <p className="mt-3 text-[12px]" style={{ color: "var(--warn)" }}>Claude&apos;s version mentioned {draft.blocked.join(", ")}, which isn&apos;t in the plan, so it was replaced.</p>}
          <button type="button" className="btn btn-sm btn-glass mt-4" onClick={() => void copy(draft)}>{copied === draft.actionKey ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy message</>}</button>
        </article>)}
      </div>
    </div>
  </div>, document.body);
}
