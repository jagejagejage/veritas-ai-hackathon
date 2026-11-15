"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, Bell, CalendarDays, Check,
  CircleAlert, Clock3, FileDown, FileUp, Gauge, HelpCircle, LoaderCircle,
  LayoutDashboard, Lightbulb, Menu, Search, Settings2,
  ShieldCheck, SlidersHorizontal, Sparkles, TrendingDown, Wallet, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildForecast, categoryTotals, demoRows, toRecords } from "@/lib/demo-data";
import type { WeeklyCashFlow } from "@/lib/types";

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const NAV = [
  { href: "#overview", label: "Overview", icon: LayoutDashboard },
  { href: "#forecast", label: "Cash flow", icon: Gauge },
  { href: "#simulator", label: "What if?", icon: SlidersHorizontal },
  { href: "#activity", label: "Transactions", icon: Wallet },
];
const REQUIRED = ["week", "sales_walkin", "invoices_collected", "supplies", "payroll", "rent", "other"] as const;
const AMOUNTS = ["sales_walkin", "invoices_collected", "supplies", "payroll", "rent", "other"] as const;

function parseCsv(text: string): WeeklyCashFlow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("Add a header row and at least one week of data.");
  const headers = lines[0].split(",").map((value) => value.trim().replace(/^\"|\"$/g, ""));
  const missing = REQUIRED.filter((column) => !headers.includes(column));
  if (missing.length) throw new Error(`Missing columns: ${missing.join(", " )}.`);
  return lines.slice(1).filter((line) => line.trim()).map((line, index) => {
    const values = line.split(",").map((value) => value.trim().replace(/^\"|\"$/g, ""));
    const read = (column: typeof REQUIRED[number]) => values[headers.indexOf(column)];
    const row: WeeklyCashFlow = {
      week: read("week"), sales_walkin: Number(read("sales_walkin")), invoices_collected: Number(read("invoices_collected")),
      supplies: Number(read("supplies")), payroll: Number(read("payroll")), rent: Number(read("rent")), other: Number(read("other")),
    };
    if (!row.week || AMOUNTS.some((key) => !Number.isFinite(row[key]) || row[key] < 0)) {
      throw new Error(`Row ${index + 2} needs a week and non-negative numbers for every amount.`);
    }
    return row;
  });
}

function StatCard({ title, value, detail, icon: Icon, trend, tone = "teal" }: {
  title: string; value: string; detail: string; icon: typeof Wallet; trend?: "up" | "down"; tone?: "teal" | "slate" | "amber";
}) {
  const colors = { teal: "#168677", slate: "#526c75", amber: "#bd8745" };
  return <article className="panel px-5 py-5 sm:px-6">
    <div className="flex items-start justify-between">
      <p className="text-[13px] font-medium text-[#788b90]">{title}</p>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f1f5f4]" style={{ color: colors[tone] }}><Icon size={16} strokeWidth={1.8} /></span>
    </div>
    <p className="mt-3 text-[27px] font-semibold tracking-[-1.3px] text-[#172e37]">{value}</p>
    <p className="mt-1 flex items-center gap-1.5 text-[12px] text-[#788b90]">
      {trend === "up" ? <ArrowUpRight size={14} className="text-[#168677]" /> : trend === "down" ? <ArrowDownRight size={14} className="text-[#bc7a47]" /> : null}{detail}
    </p>
  </article>;
}

function PanelTitle({ title, note, action }: { title: string; note?: string; action?: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-4"><div><h2 className="text-[15px] font-semibold tracking-[-.2px] text-[#1a343d]">{title}</h2>{note && <p className="mt-1 text-[12px] leading-5 text-[#839398]">{note}</p>}</div>{action}</div>;
}

export default function Dashboard() {
  const [rows, setRows] = useState<WeeklyCashFlow[]>(demoRows);
  const [source, setSource] = useState<"demo" | "import">("demo");
  const [period, setPeriod] = useState<4 | 8 | 12>(8);
  const [revenueChange, setRevenueChange] = useState(0);
  const [expenseChange, setExpenseChange] = useState(0);
  const [delay, setDelay] = useState(0);
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [search, setSearch] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cashBalance, setCashBalance] = useState<number | null>(null);
  const [balanceDraft, setBalanceDraft] = useState("");
  const [editingBalance, setEditingBalance] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const records = useMemo(() => toRecords(rows, source), [rows, source]);
  const totals = useMemo(() => records.reduce((sum, row) => ({ revenue: sum.revenue + row.revenue, expenses: sum.expenses + row.expenses, net: sum.net + row.netCashFlow }), { revenue: 0, expenses: 0, net: 0 }), [records]);
  const average = Math.round(totals.net / Math.max(1, records.length));
  const forecast = useMemo(() => buildForecast(rows, period, revenueChange, expenseChange, delay), [rows, period, revenueChange, expenseChange, delay]);
  const chartData = useMemo(() => forecast.map((point, index) => ({
    ...point,
    actual: point.kind === "actual" ? point.netCashFlow : undefined,
    estimate: point.kind === "forecast" || index === rows.length - 1 ? point.netCashFlow : undefined,
    bandHigh: point.kind === "forecast" ? point.high : undefined,
    bandLow: point.kind === "forecast" ? point.low : undefined,
  })), [forecast, rows.length]);
  const categories = useMemo(() => categoryTotals(records), [records]);
  const filtered = records.filter((row) => row.week.toLowerCase().includes(search.toLowerCase())).slice(-5).reverse();
  const demo = source === "demo";

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportError(""); setImportSuccess(""); setIsImporting(true);
    try {
      const parsed = parseCsv(await file.text());
      setRows(parsed); setSource("import"); setImportSuccess(`${parsed.length} weeks imported from ${file.name}.`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "We couldn't read that file. Check the CSV and try again.");
    } finally {
      setIsImporting(false);
    }
    event.target.value = "";
  }

  return <div className="min-h-screen">
    <a href="#overview" className="skip-link">Skip to main content</a>
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-[#e6ecea] bg-[#fbfcfc] px-4 py-5 lg:flex">
      <a href="#overview" className="focus-ring mb-9 flex items-center gap-2.5 rounded-lg px-2" aria-label="CashSense home">
        <span className="brand-mark flex h-8 w-8 items-center justify-center rounded-[10px] text-white"><svg viewBox="0 0 32 32" aria-hidden="true" className="h-6 w-6"><path d="M23.7 8.2a11 11 0 1 0 0 15.6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"/><path d="M8.5 18.4h5l2.2-5 3.2 9.1 2.1-4.1h3" fill="none" stroke="#9de3c9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
        <span translate="no" className="text-[17px] font-semibold tracking-[-.8px]">cash<span className="font-normal">sense</span></span>
      </a>
      <div className="mb-3 flex items-center px-2"><span className="text-[11px] font-semibold text-[#9aa8ab]">WORKSPACE</span></div>
      <div className="mb-5 flex w-full items-center justify-between rounded-lg border border-[#e7edeb] bg-white px-3 py-2.5 text-left shadow-[0_1px_2px_rgba(20,45,50,.03)]">
        <span className="flex items-center gap-2.5 text-[13px] font-medium"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#e4f1ed] text-[10px] font-bold text-[#287666]">N</span> Northstar Studio</span>
      </div>
      <nav aria-label="Main navigation" className="space-y-1">
        {NAV.map(({ href, label, icon: Icon }, index) => <a key={href} href={href} onClick={() => setMobileOpen(false)} className={`nav-link focus-ring flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] ${index === 0 ? "bg-[#e9f3f0] font-semibold text-[#286e63]" : "font-medium text-[#708287]"}`}><Icon size={17} strokeWidth={1.8}/>{label}{label === "What if?" && <span className="ml-auto rounded bg-white px-1.5 py-0.5 text-[10px] text-[#729087]">New</span>}</a>)}
      </nav>
      <div className="mt-8 px-2"><span className="text-[11px] font-semibold text-[#9aa8ab]">YOUR BUSINESS</span><div className="mt-3 space-y-1"><a href="#insights" className="nav-link focus-ring flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#708287]"><TrendingDown size={17} strokeWidth={1.8}/>Spending</a><a href="#activity" className="nav-link focus-ring flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#708287]"><CalendarDays size={17} strokeWidth={1.8}/>Cash calendar</a></div></div>
      <div className="mt-auto">
        <div className="mb-4 rounded-xl bg-[#f0f5f3] p-3.5"><div className="flex items-center gap-2 text-[12px] font-semibold text-[#315e58]"><ShieldCheck size={15}/> Your data stays yours</div><p className="mt-1.5 text-[11px] leading-[1.6] text-[#738983]">Secure by design. Your financial data is never used to train AI.</p></div>
        <a href="#simulator" className="nav-link focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#708287]"><Settings2 size={17}/>Forecast settings</a>
        <a href="#help" className="nav-link focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#708287]"><HelpCircle size={17}/>How it works</a>
        <div className="mt-4 flex items-center gap-2.5 border-t border-[#e6ecea] px-2 pt-4"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#dceae5] text-[11px] font-semibold text-[#315e58]">JD</div><div className="min-w-0 flex-1"><p className="truncate text-[12px] font-semibold">Jordan Davis</p><p className="text-[10px] text-[#88989c]">Owner</p></div></div>
      </div>
    </aside>

    <div className="lg:pl-[232px]">
      <header className="sticky top-0 z-20 flex h-[62px] items-center justify-between border-b border-[#e6ecea] bg-[#f8faf9]/95 px-4 backdrop-blur sm:px-7 lg:px-9">
        <div className="flex items-center gap-3"><button className="focus-ring min-h-11 min-w-11 rounded-md p-1.5 text-[#60767c] lg:hidden" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle navigation" aria-expanded={mobileOpen}><Menu size={19}/></button><div className="hidden items-center gap-2 text-[12px] text-[#88989c] sm:flex">Northstar Studio <span className="text-[#bdc8c6]">/</span> <span className="font-medium text-[#405960]">Overview</span></div><span translate="no" className="text-[13px] font-semibold lg:hidden">CashSense</span></div>
        <div className="flex items-center gap-2 sm:gap-3"><span className="hidden text-[11px] text-[#85969a] md:block">Last updated just now</span><button onClick={() => document.getElementById("alerts")?.scrollIntoView({ behavior: "smooth" })} className="focus-ring relative rounded-lg border border-[#e4ebe8] bg-white p-2 text-[#64797d] hover:bg-[#f2f6f4]" aria-label="View alerts"><Bell size={16}/><span className="absolute right-[7px] top-[6px] h-[5px] w-[5px] rounded-full bg-[#cf9855] ring-2 ring-white"/></button><Button onClick={() => uploadRef.current?.click()} size="sm" className="action-button" disabled={isImporting}>{isImporting ? <LoaderCircle size={15} className="animate-spin"/> : <FileUp size={15}/>}<span className="hidden sm:inline">{isImporting ? "Reading…" : "Import data"}</span></Button></div>
      </header>
      {mobileOpen && <nav aria-label="Mobile navigation" className="absolute z-20 w-full border-b border-[#e6ecea] bg-white p-3 shadow-lg lg:hidden">{NAV.map((item) => <a key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className="focus-ring flex min-h-11 items-center gap-3 rounded-lg px-3 py-3 text-sm text-[#405960]"><item.icon size={17}/>{item.label}</a>)}</nav>}
      <input ref={uploadRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={handleUpload} aria-label="Choose a CSV file to import"/>

      <main id="overview" className="mx-auto max-w-[1450px] px-4 pb-12 pt-7 sm:px-7 sm:pt-9 lg:px-9">
        <div className="mb-6 flex flex-col justify-between gap-4 sm:mb-7 sm:flex-row sm:items-end">
          <div><div className="flex items-center gap-2"><h1 className="text-[25px] font-semibold tracking-[-1.1px] text-[#17313a] sm:text-[29px]">Your cash, in context.</h1></div><p className="mt-1.5 text-[13px] text-[#829297]">A clearer view of what&apos;s moving and what&apos;s next.</p></div>
          <div className="flex items-center gap-2 self-start sm:self-auto"><Button variant="outline" size="sm" onClick={() => uploadRef.current?.click()}><FileUp size={14}/>Import CSV</Button></div>
        </div>

        {(demo || importError || importSuccess || isImporting) && <div className={`mb-5 flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-[12px] ${importError ? "border-[#f0d5c8] bg-[#fff8f4] text-[#9d5e38]" : importSuccess ? "border-[#cfe7dd] bg-[#f3faf7] text-[#317566]" : "border-[#dcebe6] bg-[#f4faf8] text-[#63817a]"}`} role="status" aria-live="polite">
          {isImporting ? <LoaderCircle size={15} className="mt-0.5 shrink-0 animate-spin"/> : importError ? <CircleAlert size={15} className="mt-0.5 shrink-0"/> : importSuccess ? <Check size={15} className="mt-0.5 shrink-0"/> : <Sparkles size={15} className="mt-0.5 shrink-0"/>}
          <span className="flex-1">{isImporting ? "Reading your CSV…" : importError || importSuccess || "You’re viewing illustrative demo data. Import a CSV to see your business’s numbers."}{!isImporting && !importError && !importSuccess && <span className="hidden sm:inline"> Forecasts are estimates, not AI predictions.</span>}</span>
          {(importError || importSuccess) && <button onClick={() => { setImportError(""); setImportSuccess(""); }} className="focus-ring rounded p-0.5" aria-label="Dismiss message"><X size={14}/></button>}
        </div>}

        <section aria-label="Cash flow summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Money in" value={money(totals.revenue)} detail={`Across ${records.length} weeks`} icon={ArrowDownRight} trend="up"/>
          <StatCard title="Money out" value={money(totals.expenses)} detail={`${Math.round(totals.expenses / totals.revenue * 100)}% of money in`} icon={ArrowUpRight} tone="slate"/>
          <StatCard title="Net cash flow" value={money(totals.net)} detail={`${money(average)} average per week`} icon={Wallet} trend={totals.net >= 0 ? "up" : "down"}/>
          <article className="panel relative overflow-hidden px-5 py-5 sm:px-6"><div className="flex items-start justify-between"><p className="text-[13px] font-medium text-[#788b90]">Cash balance</p><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${cashBalance === null ? "bg-[#fbf4e9] text-[#b17a38]" : "bg-[#edf7f2] text-[#348474]"}`}>{cashBalance === null ? <CircleAlert size={16}/> : <Wallet size={16}/>}</span></div>{cashBalance === null ? <><p className="mt-3 text-[20px] font-semibold tracking-[-.7px]">Add your current balance</p><p className="mt-1 text-[12px] text-[#788b90]">We won&apos;t guess at your starting point.</p>{editingBalance ? <form className="mt-2 flex gap-2" onSubmit={(event) => { event.preventDefault(); const value = Number(balanceDraft); if (balanceDraft.trim() && Number.isFinite(value) && value >= 0) { setCashBalance(value); setEditingBalance(false); } }}><label className="sr-only" htmlFor="balance-input">Current cash balance in dollars</label><input id="balance-input" autoFocus type="number" min="0" step="100" required value={balanceDraft} onChange={(event) => setBalanceDraft(event.target.value)} placeholder="$ 0" className="focus-ring w-28 rounded-md border border-[#dfe8e4] px-2 py-1 text-[12px]"/><button className="focus-ring rounded-md bg-[#176f65] px-2.5 text-[11px] font-semibold text-white">Save</button></form> : <button onClick={() => { setBalanceDraft(""); setEditingBalance(true); }} className="focus-ring mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#16776b]">Add balance <ArrowRight size={12}/></button>}</> : <><p className="mt-3 text-[27px] font-semibold tracking-[-1.3px]">{money(cashBalance)}</p><p className="mt-1 text-[12px] text-[#788b90]">Your current cash balance</p><p className="mt-2 text-[10px] text-[#748b85]">Next 4 weeks, at this pace: {money(cashBalance + forecast.slice(rows.length).slice(0, 4).reduce((sum, point) => sum + point.netCashFlow, 0))}</p><button onClick={() => { setBalanceDraft(String(cashBalance)); setCashBalance(null); setEditingBalance(true); }} className="focus-ring mt-1 text-[10px] font-medium text-[#608078] underline decoration-[#c9d9d3] underline-offset-2">Update balance</button></>}</article>
        </section>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.72fr)_minmax(295px,.86fr)]">
          <section id="forecast" className="panel min-w-0 px-4 py-5 sm:px-6 sm:py-6">
            <PanelTitle title="Cash flow" note="Weekly money in minus money out" action={<div className="flex rounded-lg bg-[#f3f6f5] p-0.5" role="group" aria-label="Forecast period">{([4, 8, 12] as const).map((n) => <button key={n} onClick={() => setPeriod(n)} aria-pressed={period === n} className={`focus-ring rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors ${period === n ? "bg-white text-[#244a4e] shadow-sm" : "text-[#849397] hover:text-[#405960]"}`}>{n}w</button>)}</div>}/>
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-[#829297]"><span className="flex items-center gap-1.5"><i className="h-[3px] w-4 rounded bg-[#3c9c8a]"/>Past weeks</span><span className="flex items-center gap-1.5"><i className="h-[3px] w-4 border-t-2 border-dashed border-[#72b5a7]"/>Estimate</span><span className="flex items-center gap-1.5"><i className="h-2 w-4 rounded-sm bg-[#eaf5f1]"/>Possible range</span><span className="ml-auto text-[10px] text-[#9aa7aa]">{demo ? "Illustrative demo estimate" : "Planning estimate"}</span></div>
            <div className="mt-2 h-[280px] w-full sm:h-[320px]" role="img" aria-label="Chart showing actual weekly net cash flow followed by projected weekly cash flow. Adjust assumptions in What if to update this estimate."><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 12, right: 5, left: 0, bottom: 0 }}>
              <defs><linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5cae9e" stopOpacity={.2}/><stop offset="95%" stopColor="#5cae9e" stopOpacity={0}/></linearGradient><linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b4ddd2" stopOpacity={.48}/><stop offset="95%" stopColor="#b4ddd2" stopOpacity={.04}/></linearGradient></defs>
              <CartesianGrid stroke="#edf1ef" vertical={false}/><XAxis dataKey="week" tick={{ fill: "#8b999c", fontSize: 10 }} axisLine={false} tickLine={false} tickMargin={10} interval="preserveStartEnd"/><YAxis tickFormatter={(v: number) => `${v < 0 ? "−" : ""}$${Math.abs(v / 1000).toFixed(0)}k`} tick={{ fill: "#93a0a2", fontSize: 10 }} axisLine={false} tickLine={false} width={47}/><ReferenceLine y={0} stroke="#cbd6d2" strokeDasharray="3 4"/><Tooltip content={<ChartTooltip/>}/>
              <Area type="monotone" dataKey="bandHigh" stroke="none" fill="url(#forecastFill)" connectNulls name="high"/>
              <Area type="monotone" dataKey="bandLow" stroke="none" fill="#fff" connectNulls name="low"/>
              <Area type="monotone" dataKey="actual" stroke="#399989" strokeWidth={2.6} fill="url(#actualFill)" dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: "#2d8375" }} connectNulls/>
              <Area type="monotone" dataKey="estimate" stroke="#399989" strokeWidth={2.4} strokeDasharray="6 5" fill="url(#forecastFill)" dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: "#2d8375" }} connectNulls/>
            </AreaChart></ResponsiveContainer></div>
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-[#f5f8f7] px-3 py-2.5"><Lightbulb size={14} className="shrink-0 text-[#75968b]"/><p className="text-[11px] leading-5 text-[#71858a]">Based on your recent weeks, your average net cash flow is <strong className="font-semibold text-[#315c57]">{money(average)} per week</strong>.</p></div>
          </section>

          <section id="alerts" className="panel px-5 py-5 sm:px-6 sm:py-6">
            <PanelTitle title="Worth a look" note="A few things to keep on your radar" action={<span className="rounded-full bg-[#f7f1e7] px-2 py-1 text-[10px] font-semibold text-[#a57538]">2 items</span>}/>
            <div className="mt-5 space-y-3">
              <article className="rounded-lg border border-[#efe9df] bg-[#fdfbf7] p-3.5"><div className="flex gap-2.5"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f7eddb] text-[#ae7e40]"><Clock3 size={14}/></span><div><p className="text-[12px] font-semibold text-[#495b5e]">Invoice timing may be tight</p><p className="mt-1 text-[11px] leading-[1.65] text-[#7c8989]">A one-week delay in customer payments could reduce next week&apos;s net cash flow.</p><button onClick={() => { setDelay(Math.min(21, delay + 7)); document.getElementById("simulator")?.scrollIntoView({ behavior: "smooth" }); }} className="focus-ring mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#9a7039]">Try a delay <ArrowRight size={12}/></button></div></div></article>
              <article className="rounded-lg border border-[#e7eeeb] bg-[#fbfdfc] p-3.5"><div className="flex gap-2.5"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#eaf3ef] text-[#508577]"><TrendingDown size={14}/></span><div><p className="text-[12px] font-semibold text-[#495b5e]">Supplies are your biggest variable</p><p className="mt-1 text-[11px] leading-[1.65] text-[#7c8989]">You spent {money(categories.find((item) => item.name === "Supplies")?.value ?? 0)} on supplies in the period shown.</p><a href="#insights" className="focus-ring mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#367a6e]">See spending <ArrowRight size={12}/></a></div></div></article>
            </div>
            <div className="mt-4 flex items-center gap-2 border-t border-[#edf1ef] pt-3 text-[10px] text-[#97a3a4]"><Sparkles size={12}/> Suggestions are based on {demo ? "illustrative demo" : "your imported"} data.</div>
          </section>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(330px,1fr)]">
          <section id="simulator" className="panel overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1ef] px-5 py-4 sm:px-6"><div className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e8f4f0] text-[#277f70]"><SlidersHorizontal size={15}/></span><div><h2 className="text-[14px] font-semibold">What if things change?</h2><p className="text-[11px] text-[#879599]">See how your next few weeks could look</p></div></div><span className="inline-flex items-center gap-1 rounded-full border border-[#e2ece8] px-2 py-1 text-[9px] font-medium text-[#81918f]"><Sparkles size={10}/>{demo ? "Demo estimate" : "Planning estimate"}</span></div>
            <div className="grid gap-5 p-5 sm:grid-cols-[1.03fr_.97fr] sm:px-6 sm:py-5">
              <div className="space-y-4">
                <RangeControl label="Customer payments arrive later" value={delay} min={0} max={21} step={1} suffix="days" onChange={setDelay} help="A longer wait means money arrives later."/>
                <RangeControl label="Unexpected expense" value={expenseChange} min={0} max={10000} step={250} prefix="$" onChange={setExpenseChange} help="Add a one-time cost to your first forecast week."/>
                <RangeControl label="Revenue changes" value={revenueChange} min={-30} max={30} step={1} suffix="%" onChange={setRevenueChange} help="Adjust expected sales and invoice payments."/>
                <button onClick={() => { setDelay(0); setExpenseChange(0); setRevenueChange(0); }} className="focus-ring rounded-md py-1 text-[11px] font-medium text-[#67817f] hover:text-[#176f65]">Reset assumptions</button>
              </div>
              <div className="scenario-output flex flex-col justify-between rounded-xl p-4 sm:p-5" aria-live="polite"><div><p className="text-[11px] font-medium text-[#7b8d8c]">Estimated weekly net cash flow</p><p className="mt-2 text-[30px] font-semibold tracking-[-1.3px] text-[#214a46]">{money(forecast[rows.length]?.netCashFlow ?? 0)}</p><p className="mt-1 text-[11px] text-[#768987]">With these assumptions applied</p><div className="mt-4 border-t border-[#dde9e4] pt-3"><p className="text-[10px] text-[#879693]">Compared with your recent average</p><p className={`mt-1 text-[13px] font-semibold ${(forecast[rows.length]?.netCashFlow ?? 0) >= average ? "text-[#36816f]" : "text-[#a46c45]"}`}>{(forecast[rows.length]?.netCashFlow ?? 0) - average >= 0 ? "+" : "−"}{money(Math.abs((forecast[rows.length]?.netCashFlow ?? 0) - average))}<span className="ml-1 font-normal text-[#859391]">per week</span></p><div className="scenario-meter mt-4" aria-hidden="true"><span style={{ width: `${Math.max(5, Math.min(100, 50 + ((forecast[rows.length]?.netCashFlow ?? 0) - average) / Math.max(Math.abs(average), 1) * 35))}%` }}/></div><p className="mt-2 text-[10px] text-[#768987]">Your forecast above updates as you adjust these assumptions.</p></div></div><p className="mt-5 flex items-start gap-1.5 text-[10px] leading-[1.6] text-[#8a9895]"><CircleAlert size={12} className="mt-0.5 shrink-0"/>A planning estimate, not a guarantee. No starting balance assumed.</p></div>
            </div>
          </section>

          <section id="insights" className="panel px-5 py-5 sm:px-6 sm:py-6"><PanelTitle title="Where money goes" note={`Spending across ${records.length} weeks`}/><div className="mt-3 flex items-center gap-3"><div className="h-[145px] w-[145px] shrink-0" role="img" aria-label="Breakdown of spending by category"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categories} dataKey="value" nameKey="name" innerRadius={46} outerRadius={65} paddingAngle={3} stroke="none">{categories.map((item) => <Cell key={item.name} fill={item.color}/>)}</Pie><Tooltip formatter={(value) => money(Number(value))}/></PieChart></ResponsiveContainer></div><div className="min-w-0 flex-1 space-y-2.5">{categories.map((item) => <div key={item.name} className="flex items-center gap-2 text-[11px]"><span className="h-2 w-2 rounded-sm" style={{ backgroundColor: item.color }}/><span className="flex-1 text-[#718387]">{item.name}</span><span className="font-medium text-[#405a60]">{money(item.value)}</span></div>)}</div></div><div className="mt-3 flex items-center gap-1.5 border-t border-[#edf1ef] pt-3 text-[10px] text-[#879598]"><Lightbulb size={12} className="text-[#8aa79e]"/>Payroll is your largest expense.</div></section>
        </div>

        <section id="activity" className="panel mt-4 overflow-hidden">
          <div className="flex flex-col justify-between gap-3 border-b border-[#edf1ef] px-5 py-4 sm:flex-row sm:items-center sm:px-6"><div><h2 className="text-[14px] font-semibold">Recent weeks</h2><p className="mt-1 text-[11px] text-[#879599]">A clear look at money in and money out</p></div><label className="flex h-8 items-center gap-2 rounded-lg border border-[#e6ecea] px-2.5 text-[#8a999c] focus-within:border-[#69a89b]"><Search size={14}/><input name="week-search" autoComplete="off" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search weeks" className="w-[120px] bg-transparent text-[11px] text-[#3d555b] outline-none placeholder:text-[#a1adaf]" aria-label="Search weeks"/><kbd className="hidden rounded border border-[#e6ecea] px-1 text-[9px] sm:inline">⌘&nbsp;K</kbd></label></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left"><thead><tr className="bg-[#fafcfb] text-[10px] font-medium text-[#94a1a2]"><th className="px-5 py-2.5 sm:px-6">Week</th><th className="px-4 py-2.5">Money in</th><th className="px-4 py-2.5">Money out</th><th className="px-4 py-2.5">Net cash flow</th><th className="px-5 py-2.5 text-right sm:px-6">Status</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.week} className="border-t border-[#f0f3f2] text-[11px] hover:bg-[#fbfdfc]"><td className="px-5 py-3 font-medium text-[#486067] sm:px-6">{row.week}, 2026</td><td className="px-4 py-3 text-[#5f777c]">{money(row.revenue)}</td><td className="px-4 py-3 text-[#5f777c]">{money(row.expenses)}</td><td className={`px-4 py-3 font-semibold ${row.netCashFlow >= 0 ? "text-[#348474]" : "text-[#b36d48]"}`}>{row.netCashFlow >= 0 ? "+" : "−"}{money(Math.abs(row.netCashFlow))}</td><td className="px-5 py-3 text-right sm:px-6"><span className={`rounded-full px-2 py-1 text-[9px] font-medium ${row.netCashFlow >= 0 ? "bg-[#edf7f2] text-[#458171]" : "bg-[#fbf0ea] text-[#ad7451]"}`}>{row.netCashFlow >= 0 ? "Positive" : "Needs a look"}</span></td></tr>)}{filtered.length === 0 && <tr><td colSpan={5} className="px-6 py-10 text-center text-[12px] text-[#829297]">No weeks match “{search}”. Try another search.</td></tr>}</tbody></table></div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#edf1ef] px-5 py-3 text-[10px] text-[#8a999c] sm:px-6"><span>{demo ? "Illustrative demo weeks" : "Imported from your CSV"}</span><button onClick={() => uploadRef.current?.click()} className="focus-ring inline-flex items-center gap-1.5 font-semibold text-[#397b70] hover:text-[#176f65]"><FileDown size={13}/>Import more data</button></div>
        </section>
        <footer id="help" className="flex flex-wrap items-center justify-between gap-2 px-1 py-6 text-[10px] text-[#9aa6a7]"><span>CashSense helps you plan ahead. It doesn&apos;t move money or replace accounting advice.</span><span>Estimates use the recent weekly average and your assumptions.</span></footer>
      </main>
    </div>
  </div>;
}

function RangeControl({ label, value, min, max, step, onChange, help, suffix = "", prefix = "" }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void; help: string; suffix?: string; prefix?: string }) {
  return <label className="block"><span className="flex items-center justify-between gap-2 text-[11px] font-medium text-[#4d666c]"><span>{label}</span><span className="min-w-[48px] text-right font-semibold text-[#376c64]">{prefix}{value.toLocaleString()}{suffix && ` ${suffix}`}</span></span><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="range-input mt-2 h-1.5 w-full cursor-pointer" aria-label={label}/><span className="mt-1 block text-[10px] leading-4 text-[#93a0a1]">{help}</span></label>;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: { kind: string; netCashFlow: number; low: number; high: number }; dataKey?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return <div className="rounded-lg border border-[#e6ecea] bg-white px-3 py-2 shadow-[0_4px_16px_rgba(23,46,55,.08)]"><p className="mb-1 text-[10px] text-[#879599]">{label} · {point.kind === "actual" ? "Past week" : "Estimate"}</p><p className="text-[12px] font-semibold text-[#315c57]">Net {money(point.netCashFlow)}</p>{point.kind === "forecast" && <p className="mt-0.5 text-[10px] text-[#91a09d]">Possible range: {money(point.low)} to {money(point.high)}</p>}</div>;
}
