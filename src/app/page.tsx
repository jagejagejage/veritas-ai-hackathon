"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useChat } from "@/components/ai/ChatProvider";
import { CashChart } from "@/components/cash/CashChart";
import { RescuePanel } from "@/components/cash/Rescue";
import { AskPanel, type WhatIf } from "@/components/cash/Ask";
import { danaCafe } from "@/lib/cash/demo";
import { project, totals, warningFor } from "@/lib/cash/engine";
import { dollars } from "@/lib/cash/format";
import { nextMonday, rowsToBusiness } from "@/lib/cash/import";
import { findRescuePlans, type Plan, type RescueResult } from "@/lib/cash/rescue";
import type { Business, Status } from "@/lib/cash/types";
import { MAX_CSV_BYTES } from "@/lib/csv-import";
import { CsvImportWizard } from "@/components/CsvImportWizard";
import type { WeeklyCashFlow } from "@/lib/types";
import type { BackendForecastResult } from "@/lib/backend-integration";
import type { FinancialContext } from "@/lib/ai/types";

const STATUS_WORD: Record<Status, string> = { red: "Short", yellow: "Tight", green: "OK" };

export default function Home() {
  const [business, setBusiness] = useState<Business>(danaCafe);
  const [source, setSource] = useState<"demo" | "import">("demo");
  const [rescue, setRescue] = useState<{ result: RescueResult; ms: number } | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [whatIf, setWhatIf] = useState<WhatIf | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [backendState, setBackendState] = useState<{ data: BackendForecastResult | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: false });
  const [pendingCsv, setPendingCsv] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rescueRef = useRef<HTMLElement>(null);
  const { setFinancialContext } = useChat();

  const base = useMemo(() => project(business), [business]);
  const warning = useMemo(() => warningFor(business, base), [business, base]);
  const sum = useMemo(() => totals(base), [base]);
  const shownWeek = week ?? warning.week ?? base.lowest.week;
  const backendRows = useMemo(() => Array.from({ length: business.horizon }, (_, index) => {
    const row: WeeklyCashFlow = { week: `Week ${index + 1}`, sales_walkin: 0, invoices_collected: 0, supplies: 0, payroll: 0, rent: 0, other: 0 };
    for (const item of business.items) {
      if (item.week !== index + 1) continue;
      const amount = item.cents / 100;
      if (item.direction === "in") row[item.category === "invoice" ? "invoices_collected" : "sales_walkin"] += amount;
      else if (item.category === "supplies" || item.category === "payroll" || item.category === "rent") row[item.category] += amount;
      else row.other += amount;
    }
    return row;
  }), [business]);
  const backendProjection = useMemo(() => {
    if (!backendState.data) return null;
    const weeks = base.weeks.map((item, index, all) => {
      const point = backendState.data?.points[index];
      if (!point) return item;
      const netCents = Math.round(point.netCashFlow * 100);
      const endCents = (index === 0 ? business.openingCents : all[index - 1].endCents) + netCents;
      return { ...item, netCents, endCents, status: endCents < 0 ? "red" as const : endCents < business.floorCents ? "yellow" as const : "green" as const };
    });
    const lowest = weeks.reduce((current, item) => item.endCents < current.endCents ? item : current, weeks[0]);
    return { ...base, weeks, lowest, status: lowest.status };
  }, [backendState.data, base, business.floorCents, business.openingCents]);
  const alt = plan
    ? { projection: plan.projection, label: "With rescue plan" }
    : whatIf ? { projection: whatIf.projection, label: "With your what-if" }
      : backendProjection ? { projection: backendProjection, label: `Python ${backendState.data?.recommended ?? "forecast"}` } : null;

  useEffect(() => {
    const controller = new AbortController();
    setBackendState({ data: null, error: null, loading: true });
    fetch("/api/backend/forecast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rows: backendRows, horizon: Math.min(12, business.horizon), openingCash: business.openingCents / 100, assumptions: { revenueChangePercent: 0, expenseChange: 0, paymentDelayDays: 0 } }),
      signal: controller.signal,
    }).then(async (response) => {
      const body = await response.json() as BackendForecastResult | { error?: string };
      if (!response.ok) throw new Error("error" in body && body.error ? body.error : "The Python forecasting service is unavailable.");
      setBackendState({ data: body as BackendForecastResult, error: null, loading: false });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setBackendState({ data: null, error: error instanceof Error ? error.message : "The Python forecasting service is unavailable.", loading: false });
    });
    return () => controller.abort();
  }, [backendRows, business.horizon, business.openingCents]);

  const financialContext = useMemo<FinancialContext>(() => ({
    source: source === "demo" ? "demo" : "imported",
    history: backendRows,
    forecast: base.weeks.map((item) => ({ week: item.label, netCashFlow: item.netCents / 100, low: item.netCents / 100, high: item.netCents / 100, kind: "forecast" as const })),
    spendingCategories: Object.entries(business.items.filter((item) => item.direction === "out").reduce<Record<string, number>>((totals, item) => {
      const name = item.category === "repair" ? "Repairs" : item.category[0].toUpperCase() + item.category.slice(1);
      totals[name] = (totals[name] ?? 0) + item.cents / 100;
      return totals;
    }, {})).map(([name, value]) => ({ name, value })),
    alerts: [{ title: warning.headline, detail: warning.detail }],
    currentCashBalance: business.openingCents / 100,
    assumptions: { revenueChangePercent: 0, expenseChange: 0, paymentDelayDays: 0 },
  }), [base.weeks, backendRows, business.items, business.openingCents, source, warning.detail, warning.headline]);

  useEffect(() => setFinancialContext(financialContext), [financialContext, setFinancialContext]);

  function update(next: Business, from: "demo" | "import" = source) {
    setBusiness(next);
    setSource(from);
    setRescue(null);
    setPlan(null);
    setWhatIf(null);
    setWeek(null);
  }

  function runRescue() {
    const started = performance.now();
    const result = findRescuePlans(business);
    setRescue({ result, ms: performance.now() - started });
    setWhatIf(null);
    setPlan(result.plans[0] ?? null);
    requestAnimationFrame(() => rescueRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > MAX_CSV_BYTES) throw new Error("CSV files must be 1 MB or smaller.");
      setPendingCsv(file);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "That file couldn't be read." });
    }
  }

  function completeCsvImport(rows: WeeklyCashFlow[], startingCashBalance: number | null) {
    try {
      const opening = startingCashBalance ?? Number(window.prompt("What's in the bank today? (dollars)", "0")?.replace(/[$,]/g, ""));
      if (!Number.isFinite(opening)) throw new Error("Enter today's bank balance as a number.");
      const next = rowsToBusiness(rows, Math.round(opening * 100), nextMonday(), pendingCsv?.name.replace(/\.csv$/i, ""));
      update(next, "import");
      setNotice({ tone: "ok", text: `Loaded ${Math.min(rows.length, 13)} upcoming weeks from ${pendingCsv?.name ?? "your CSV"}.` });
      setPendingCsv(null);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "That file couldn't be read." });
    }
  }

  const selected = base.weeks.find((w) => w.week === shownWeek);
  const altSelected = alt?.projection.weeks.find((w) => w.week === shownWeek);

  return <>
    {pendingCsv && <CsvImportWizard file={pendingCsv} onCancel={() => setPendingCsv(null)} onImport={completeCsvImport} />}
    <a href="#main" className="skip-link">Skip to content</a>
    <div className="backdrop" aria-hidden />

    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6 sm:pt-4" style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}>
      <nav className="glass glass-pill mx-auto flex h-14 max-w-[1120px] items-center justify-between gap-3 pl-5 pr-2" aria-label="Main">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-[-.02em]" translate="no">
          <Mark /> CashSense
        </Link>
        <div className="flex items-center gap-1">
          <Link href="/how-it-works" className="btn btn-quiet btn-sm hidden sm:inline-flex">How it works</Link>
          <Link href="/ai" className="btn btn-quiet btn-sm hidden sm:inline-flex">CashSense AI</Link>
          <button type="button" className="btn btn-glass btn-sm" onClick={() => fileRef.current?.click()}>Import CSV</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={onFile} aria-label="Choose a CSV file" />
        </div>
      </nav>
    </header>

    <main id="main" className="mx-auto max-w-[1120px] px-4 pb-16 sm:px-6">
      {/* Hero: the warning, in plain English */}
      <section className="pb-8 pt-12 sm:pb-12 sm:pt-20" aria-labelledby="headline">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="eyebrow">{business.name} · Next {business.horizon} weeks</p>
          {source === "demo" && <span className="eyebrow rounded-full border border-[var(--hair-strong)] px-2.5 py-1 !text-[11px]">Fictional demo data</span>}
        </div>
        <h1 id="headline" className="display mt-4 max-w-[17ch]" style={{ color: warning.status === "green" ? "var(--ink)" : undefined }}>
          {warning.headline}
        </h1>
        <p className="mt-5 max-w-[56ch] text-[17px] leading-relaxed muted sm:text-[19px]">{warning.detail}</p>
        <dl className="mt-7 flex flex-wrap gap-x-8 gap-y-4 text-[14px]">
          {warning.weeksAhead !== null && <Stat label="Warning lead time" value={`${warning.weeksAhead} weeks ahead`} />}
          <Stat label={`Profit over ${business.horizon} weeks`} value={dollars(sum.netCents)} />
          <Stat label="In the bank today" value={dollars(business.openingCents)} />
          <Stat label="Your cushion" value={dollars(business.floorCents)} />
        </dl>
        <div className="mt-8 flex flex-wrap gap-3">
          {base.status !== "green" && <button type="button" className="btn btn-primary" onClick={runRescue}>Find a rescue plan</button>}
          <a href="#ask" className="btn btn-glass">Ask a what-if</a>
        </div>
        {notice && <p role="status" className="mt-5 text-[14px]" style={{ color: notice.tone === "error" ? "var(--warn)" : "var(--good)" }}>{notice.text} <button type="button" className="underline decoration-white/30 underline-offset-4" onClick={() => setNotice(null)}>Dismiss</button></p>}
      </section>

      {/* Chart + week strip */}
      <section className="glass p-4 sm:p-7" aria-labelledby="chart-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="chart-title" className="title">Cash in the bank, week by week</h2>
            <p className="mt-1 text-[14px] muted">Every dot is a real balance from your scheduled sales, bills and invoices. No averages.</p>
          </div>
          {alt && <button type="button" className="btn btn-quiet btn-sm" onClick={() => { setPlan(null); setWhatIf(null); }}>Show schedule only</button>}
        </div>
        <div className="mt-5">
          <CashChart business={business} base={base} alt={alt} selectedWeek={shownWeek} onSelectWeek={setWeek} />
        </div>
        <p className="mt-3 text-[12px] faint" role="status">{backendState.loading ? "Connecting to the Python forecasting service…" : backendState.data ? `Python ${backendState.data.recommended} forecast shown for comparison.` : backendState.error ? `Local cash engine active · Python service unavailable: ${backendState.error}` : "Local cash engine forecast."}</p>
        <ol className="mt-6 grid grid-cols-4 gap-2 sm:grid-cols-8" aria-label="Weeks">
          {base.weeks.map((w) => {
            const a = alt?.projection.weeks[w.week - 1];
            const active = w.week === shownWeek;
            return <li key={w.week}>
              <button type="button" onClick={() => setWeek(w.week)} aria-pressed={active}
                className={`w-full rounded-2xl border px-2.5 py-2.5 text-left transition-colors ${active ? "border-[var(--hair-strong)] bg-[var(--fill-strong)]" : "border-transparent hover:bg-[var(--fill)]"}`}>
                <span className="block text-[12px] faint">Wk {w.week}<span className="hidden sm:inline"> · {w.label}</span></span>
                <span className="figure mt-0.5 block whitespace-nowrap text-[14px] sm:text-[15px]" style={{ color: w.status === "red" ? "var(--bad)" : undefined }}>{dollars(w.endCents)}</span>
                <span className={`status status-${w.status} mt-1 !text-[12px]`}>{STATUS_WORD[w.status]}</span>
                {a && a.endCents !== w.endCents && <span className="figure mt-1 block whitespace-nowrap text-[12px]" style={{ color: "var(--accent)" }}>{dollars(a.endCents)}</span>}
              </button>
            </li>;
          })}
        </ol>
        {selected && <div className="well mt-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold">Week {selected.week} <span className="faint font-normal">· starts {selected.label}</span></h3>
            <p className="text-[14px]"><span className="faint">Ends at </span><span className="figure">{dollars(selected.endCents)}</span>{altSelected && altSelected.endCents !== selected.endCents && <span className="figure" style={{ color: "var(--accent)" }}> → {dollars(altSelected.endCents)}</span>}</p>
          </div>
          <ul className="mt-3 grid gap-x-8 gap-y-1.5 text-[14px] sm:grid-cols-2">
            {[...selected.items].sort((x, y) => (x.direction === y.direction ? y.cents - x.cents : x.direction === "in" ? -1 : 1)).map((item) => <li key={item.id} className="flex justify-between gap-4 border-b border-[var(--hair)] py-1.5">
              <span className="muted">{item.label}<span className="faint"> · {item.counterparty}</span></span>
              <span className="figure whitespace-nowrap" style={{ color: item.direction === "in" ? "var(--good)" : "var(--ink)" }}>{item.direction === "in" ? "+" : "−"}{dollars(item.cents)}</span>
            </li>)}
          </ul>
        </div>}
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <section ref={rescueRef} id="rescue" className="glass scroll-mt-24 p-5 sm:p-7" aria-labelledby="rescue-title">
          <p className="eyebrow">Rescue plan</p>
          <h2 id="rescue-title" className="title mt-1">{base.status === "green" ? "You're covered" : "The cheapest way through"}</h2>
          <div className="mt-4">
            <RescuePanel business={business} result={rescue?.result ?? null} ms={rescue?.ms ?? 0} selectedId={plan?.id ?? null} onSelect={(p) => { setPlan(p); if (p) setWhatIf(null); }} onRun={runRescue} />
          </div>
        </section>

        <section id="ask" className="glass scroll-mt-24 p-5 sm:p-7" aria-labelledby="ask-title">
          <p className="eyebrow">Ask CashSense</p>
          <h2 id="ask-title" className="title mt-1">Test a what-if</h2>
          <p className="mt-2 text-[14px] muted">Type it the way you&apos;d say it. AI turns the question into a change to your schedule; the engine does every calculation.</p>
          <div className="mt-4">
            <AskPanel business={business} base={base} result={whatIf} onResult={(r) => { setWhatIf(r); if (r) setPlan(null); }} />
          </div>
        </section>
      </div>

      <section className="glass mt-5 p-5 sm:p-7" aria-labelledby="settings-title">
        <h2 id="settings-title" className="title">Your numbers</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <MoneyInput label="In the bank today" cents={business.openingCents} onCommit={(cents) => update({ ...business, openingCents: cents })} />
          <MoneyInput label="Cushion to keep" hint="Warn me when the balance goes under this." cents={business.floorCents} min={0} onCommit={(cents) => update({ ...business, floorCents: cents })} />
          <div className="flex flex-col justify-end gap-2">
            {source === "import" && <button type="button" className="btn btn-glass" onClick={() => update(danaCafe, "demo")}>Back to the demo café</button>}
            <a className="btn btn-quiet" href="/sample-cafe.csv" download>Download sample CSV</a>
          </div>
        </div>
      </section>

      <footer className="mt-12 grid gap-2 text-[13px] faint sm:grid-cols-2">
        <p>CashSense is a planning tool, not financial advice. It uses the dates you give it; it doesn&apos;t predict whether customers will actually pay on time.</p>
        <p className="sm:text-right"><Link href="/how-it-works" className="underline decoration-white/20 underline-offset-4 hover:text-[var(--ink)]">How the math and the AI are kept apart</Link></p>
      </footer>
    </main>
  </>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[12px] faint">{label}</dt><dd className="figure m-0 mt-0.5 text-[17px]">{value}</dd></div>;
}

function MoneyInput({ label, hint, cents, min, onCommit }: { label: string; hint?: string; cents: number; min?: number; onCommit: (cents: number) => void }) {
  const [text, setText] = useState(String(cents / 100));
  const [last, setLast] = useState(cents);
  if (cents !== last) { setLast(cents); setText(String(cents / 100)); }
  const commit = () => {
    const value = Number(text.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(value) || (min !== undefined && value < min)) { setText(String(cents / 100)); return; }
    const next = Math.round(value * 100);
    if (next !== cents) onCommit(next);
  };
  const id = label.toLowerCase().replace(/\W+/g, "-");
  return <div>
    <label htmlFor={id} className="text-[13px] muted">{label}</label>
    <div className="relative mt-1.5">
      <span className="faint pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">$</span>
      <input id={id} className="field figure pl-8" inputMode="decimal" value={text} onChange={(event) => setText(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") (event.target as HTMLInputElement).blur(); }} />
    </div>
    {hint && <p className="mt-1.5 text-[12px] faint">{hint}</p>}
  </div>;
}

function Mark() {
  return <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
    <circle cx="11" cy="11" r="10" fill="none" stroke="currentColor" strokeOpacity=".9" strokeWidth="1.5" />
    <path d="M4.5 12.5h3.2l2.1-5 2.6 8 1.9-3.6h3.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
