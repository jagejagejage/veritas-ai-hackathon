"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowDown, ArrowRight, ArrowUpRight, BarChart3, Check, ChevronRight,
  CircleHelp, FileUp, MessageCircle, ShieldCheck, Sparkles, Wallet,
} from "lucide-react";
import { buildForecast, demoRows, toRecords } from "@/lib/demo-data";

const money = (value: number) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 0,
}).format(value);

function Brand() {
  return <Link href="/" className="focus-ring inline-flex min-h-11 items-center gap-2.5 rounded-lg" aria-label="CashSense dashboard">
    <span className="brand-mark flex h-9 w-9 items-center justify-center rounded-xl text-white"><Wallet size={18}/></span>
    <span translate="no" className="text-[17px] font-semibold tracking-[-.8px] text-[#18333a]">cash<span className="font-normal">sense</span></span>
  </Link>;
}

function SectionIntro({ number, title, description }: { number: string; title: string; description: string }) {
  return <div className="max-w-[440px]">
    <p className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-[#39796d]"><span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#cfe2da] bg-white text-[11px]">{number}</span> The workflow</p>
    <h2 className="text-balance text-[28px] font-semibold leading-[1.12] tracking-[-1.1px] text-[#1b383e] sm:text-[35px]">{title}</h2>
    <p className="mt-4 text-[14px] leading-7 text-[#647b7c]">{description}</p>
  </div>;
}

function ChartPreview() {
  const records = toRecords(demoRows);
  const forecast = buildForecast(demoRows, 4, 0, 0, 0);
  const line = [...records.map((row) => row.netCashFlow), ...forecast.slice(records.length).map((row) => row.netCashFlow)];
  const pastPoints = line.slice(0, records.length).map((value, index) => `${24 + index * 37},${124 - (value + 4000) / 105}`).join(" ");
  return <div className="relative overflow-hidden rounded-[22px] border border-[#dce8e3] bg-white p-4 shadow-[0_20px_60px_rgba(32,75,66,.08)] sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-[13px] font-semibold text-[#27474a]">Cash flow</p><p className="mt-1 text-[11px] text-[#869798]">Weekly money in minus money out</p></div>
      <span className="rounded-full bg-[#f8f2e8] px-2.5 py-1 text-[10px] font-medium text-[#957243]">Illustrative demo</span>
    </div>
    <div className="mt-5 grid grid-cols-3 gap-2">
      <div className="rounded-xl bg-[#f7faf8] p-3"><p className="text-[10px] text-[#849596]">Revenue</p><p className="mt-1 text-[15px] font-semibold text-[#28494a]">{money(records.reduce((sum, row) => sum + row.revenue, 0))}</p></div>
      <div className="rounded-xl bg-[#f7faf8] p-3"><p className="text-[10px] text-[#849596]">Expenses</p><p className="mt-1 text-[15px] font-semibold text-[#28494a]">{money(records.reduce((sum, row) => sum + row.expenses, 0))}</p></div>
      <div className="rounded-xl bg-[#f7faf8] p-3"><p className="text-[10px] text-[#849596]">Weeks shown</p><p className="mt-1 text-[15px] font-semibold text-[#28494a]">{records.length}</p></div>
    </div>
    <div className="mt-4 rounded-xl border border-[#edf2ef] bg-[#fcfdfc] px-2 py-3">
      <svg viewBox="0 0 320 145" className="h-[168px] w-full" role="img" aria-label="Illustrative weekly net cash flow history and estimate">
        <title>Illustrative cash flow trend and estimate</title>
        {[30, 65, 100, 135].map((y) => <line key={y} x1="12" x2="308" y1={y} y2={y} stroke="#edf2ef"/>)}
        <polyline points={pastPoints} fill="none" stroke="#318c7d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        <polyline points={line.slice(records.length - 1).map((value, index) => `${24 + (index + records.length - 1) * 37},${124 - (value + 4000) / 105}`).join(" ")} fill="none" stroke="#6cac9d" strokeWidth="2.5" strokeDasharray="5 5" strokeLinecap="round"/>
        {line.slice(0, records.length).map((value, index) => <circle key={index} cx={24 + index * 37} cy={124 - (value + 4000) / 105} r="3.5" fill="#318c7d"/>)}
      </svg>
      <div className="flex items-center gap-4 px-2 text-[10px] text-[#768b8a]"><span className="flex items-center gap-1.5"><i className="h-[3px] w-4 rounded bg-[#318c7d]"/>History</span><span className="flex items-center gap-1.5"><i className="w-4 border-t-2 border-dashed border-[#6cac9d]"/>Estimate</span></div>
    </div>
    <div className="mt-3 flex items-start gap-2 rounded-lg bg-[#f6f9f7] px-3 py-2.5 text-[10px] leading-5 text-[#738887]"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-[#478779]"/>Cash balance is shown only when you provide one. A forecast estimate is not a prediction.</div>
  </div>;
}

function CsvPreview() {
  const rows = [
    ["week", "sales_walkin", "invoices_collected", "supplies", "payroll", "rent", "other"],
    ["2026-10-05", "6840", "9250", "3180", "7200", "1650", "940"],
    ["2026-10-12", "7320", "6100", "2840", "7200", "0", "1280"],
  ];
  return <div className="overflow-hidden rounded-[22px] border border-[#dce8e3] bg-[#173d3d] shadow-[0_20px_60px_rgba(32,75,66,.12)]">
    <div className="flex items-center justify-between border-b border-white/10 px-4 py-3.5 sm:px-5"><div className="flex items-center gap-2 text-[12px] font-medium text-white"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10"><FileUp size={14}/></span>weekly-cash-flow.csv</div><span className="rounded-full bg-[#b8e5d4]/15 px-2.5 py-1 text-[10px] text-[#b9e2d4]">CSV format</span></div>
    <div className="overflow-x-auto p-3 sm:p-5"><table className="w-full min-w-[650px] text-left font-mono text-[10px] leading-6 text-[#d4e7df]"><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className={rowIndex === 0 ? "text-[#a8d5c6]" : "border-t border-white/5"}>{row.map((cell, index) => <td key={index} className="px-2 py-1.5">{cell}</td>)}</tr>)}</tbody></table></div>
    <div className="mx-4 mb-4 flex items-start gap-2 border-t border-white/10 pt-3 text-[10px] leading-5 text-[#b9ceca] sm:mx-5"><Check size={13} className="mt-1 shrink-0 text-[#9fe0c7]"/>Optional column: <code className="text-[#d7eadf]">starting_cash_balance</code>. Without it, CashSense leaves the opening cash balance unknown.</div>
  </div>;
}

export default function HowItWorksPage() {
  const [salesChange, setSalesChange] = useState(-20);
  const baseline = useMemo(() => buildForecast(demoRows, 4, 0, 0, 0)[demoRows.length]?.netCashFlow ?? 0, []);
  const changed = useMemo(() => buildForecast(demoRows, 4, salesChange, 0, 0)[demoRows.length]?.netCashFlow ?? 0, [salesChange]);
  const examples = ["Why is my cash flow dropping?", "What is my biggest expense?", "What happens if expenses increase?", "How can I prepare for a difficult month?"];
  return <div className="min-h-screen overflow-hidden bg-[#f3f7f5]">
    <a href="#main" className="skip-link">Skip to main content</a>
    <header className="relative z-10 border-b border-[#e3ebe7] bg-[#f8faf9]/90 backdrop-blur">
      <div className="mx-auto flex min-h-[68px] max-w-[1180px] items-center justify-between gap-4 px-4 sm:px-7 lg:px-10">
        <Brand/>
        <nav aria-label="Main navigation" className="flex items-center gap-1 sm:gap-2">
          <Link href="/#overview" className="focus-ring hidden min-h-11 items-center rounded-lg px-3 text-[12px] font-medium text-[#587173] hover:bg-white sm:inline-flex">Dashboard</Link>
          <Link href="/#import" className="focus-ring hidden min-h-11 items-center rounded-lg px-3 text-[12px] font-medium text-[#587173] hover:bg-white sm:inline-flex">Import CSV</Link>
          <Link href="/ai" className="focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium text-[#587173] hover:bg-white sm:px-3"><Sparkles size={15}/>CashSense AI</Link>
          <Link href="/#import" className="focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-[#176f65] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#105e56] sm:px-4">Try CashSense <ArrowRight size={14}/></Link>
        </nav>
      </div>
    </header>

    <main id="main" className="mx-auto max-w-[1180px] px-4 pb-14 sm:px-7 lg:px-10">
      <section className="relative grid gap-8 pb-16 pt-14 sm:pb-20 sm:pt-20 lg:grid-cols-[1.06fr_.94fr] lg:items-center lg:gap-16 lg:pb-24 lg:pt-24">
        <div className="absolute -right-40 -top-20 -z-0 h-[420px] w-[420px] rounded-full border border-[#dce9e3] opacity-70" aria-hidden="true"/><div className="absolute -right-20 -top-0 -z-0 h-[320px] w-[320px] rounded-full border border-[#e3ece7] opacity-70" aria-hidden="true"/>
        <div className="relative z-[1]">
          <p className="mb-5 flex items-center gap-2 text-[12px] font-semibold text-[#427a70]"><span className="h-2 w-2 rounded-full bg-[#52a88f]"/> Cash-flow clarity for small businesses</p>
          <h1 className="max-w-[620px] text-balance text-[42px] font-semibold leading-[1.04] tracking-[-2px] text-[#19383c] sm:text-[58px] lg:text-[66px]">Understand your cash flow. Plan what&apos;s next.</h1>
          <p className="mt-6 max-w-[570px] text-[15px] leading-7 text-[#617979]">CashSense helps small businesses understand their money, spot potential cash-flow problems, and explore what could happen next. Import your financial data, review your forecasts, and test financial decisions before making them.</p>
          <div className="mt-7 flex flex-wrap gap-3"><Link href="/#import" className="focus-ring inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#176f65] px-5 text-[13px] font-semibold text-white shadow-[0_8px_22px_rgba(23,111,101,.16)] transition-colors hover:bg-[#105e56]">Try CashSense <ArrowRight size={16}/></Link><Link href="/ai" className="focus-ring inline-flex min-h-12 items-center gap-2 rounded-xl border border-[#d5e3dd] bg-white px-5 text-[13px] font-semibold text-[#315b57] transition-colors hover:bg-[#f8fbf9]"><Sparkles size={15}/>Explore CashSense AI</Link></div>
          <p className="mt-5 max-w-[480px] text-[11px] leading-5 text-[#829392]">Built for owners who want a clearer weekly view of money coming in, money going out, and the assumptions behind an estimate.</p>
        </div>
        <div className="relative z-[1] lg:pl-2"><ChartPreview/></div>
      </section>

      <div className="mb-10 flex items-center gap-3 border-y border-[#dfe9e4] py-4 text-[11px] text-[#728783] sm:gap-8 sm:py-5"><span className="font-semibold text-[#315c57]">Four steps to a clearer view</span><span className="hidden h-px flex-1 bg-[#dfe9e4] sm:block"/><a className="focus-ring rounded px-1 hover:text-[#176f65]" href="#import-data">Import</a><ChevronRight size={13}/><a className="focus-ring rounded px-1 hover:text-[#176f65]" href="#understand">Understand</a><ChevronRight size={13}/><a className="focus-ring rounded px-1 hover:text-[#176f65]" href="#scenarios">Explore</a><ChevronRight size={13}/><a className="focus-ring rounded px-1 hover:text-[#176f65]" href="#ask-ai">Ask AI</a></div>

      <section id="import-data" className="grid scroll-mt-24 gap-8 border-b border-[#dfe9e4] py-12 sm:py-16 lg:grid-cols-[.85fr_1.15fr] lg:items-center lg:gap-16">
        <SectionIntro number="1" title="Import your financial data" description="Upload a CSV with weekly revenue and expenses. CashSense checks the required columns and dates, then uses the rows to populate the dashboard, spending categories, and planning estimate."/>
        <div><CsvPreview/><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="max-w-[390px] text-[11px] leading-5 text-[#7b8d8b]">The dashboard opens with illustrative demo data, so you can explore before importing your own file.</p><Link href="/#import" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-[12px] font-semibold text-[#267568] hover:bg-white">Go to CSV import <ArrowUpRight size={15}/></Link></div></div>
      </section>

      <section id="understand" className="grid scroll-mt-24 gap-8 border-b border-[#dfe9e4] py-12 sm:py-16 lg:grid-cols-[.85fr_1.15fr] lg:items-center lg:gap-16">
        <SectionIntro number="2" title="Understand your financial position" description="The dashboard brings weekly revenue and expenses together with historical net cash flow, an estimate based on recent weeks, spending categories, and alerts to review. Imported figures remain distinguishable from the sample data."/>
        <div><ChartPreview/><div className="mt-4 grid gap-2 sm:grid-cols-2">{[
          { icon: BarChart3, label: "Revenue & expenses" },
          { icon: ArrowDown, label: "Historical cash-flow trends" },
          { icon: Wallet, label: "Forecast estimates" },
          { icon: CircleHelp, label: "Categories & alerts" },
        ].map(({ icon: ItemIcon, label }) => <div key={label} className="flex min-h-11 items-center gap-2.5 rounded-lg border border-[#e2ebe7] bg-white/70 px-3 text-[11px] font-medium text-[#536d6c]"><ItemIcon size={15} className="text-[#438778}"/>{label}</div>)}</div></div>
      </section>

      <section id="scenarios" className="scroll-mt-24 border-b border-[#dfe9e4] py-12 sm:py-16">
        <div className="grid gap-8 lg:grid-cols-[.78fr_1.22fr] lg:items-start lg:gap-16"><SectionIntro number="3" title="Explore what-if scenarios" description="Change sales or expenses to see how the dashboard estimate responds. This interactive example uses the same current simulator formula and illustrative demo rows; it is a planning calculation, not a forecast from a connected Python model."/>
          <div className="overflow-hidden rounded-[24px] border border-[#d6e5de] bg-white shadow-[0_20px_60px_rgba(32,75,66,.08)]">
            <div className="flex items-center justify-between gap-3 border-b border-[#edf2ef] px-5 py-4 sm:px-7"><div><p className="text-[13px] font-semibold text-[#27474a]">A quick scenario</p><p className="mt-1 text-[11px] text-[#849594]">What happens if sales drop 20%?</p></div><span className="rounded-full bg-[#edf6f1] px-2.5 py-1 text-[10px] font-medium text-[#427c6e]">Live estimate</span></div>
            <div className="grid gap-6 p-5 sm:p-7 md:grid-cols-[.9fr_1.1fr]">
              <label className="block"><span className="flex justify-between gap-3 text-[12px] font-medium text-[#4f6869]"><span>Change in sales</span><span className="font-semibold text-[#267568]">{salesChange}%</span></span><input aria-label="Change in sales percentage" type="range" min="-30" max="30" step="1" value={salesChange} onChange={(event) => setSalesChange(Number(event.target.value))} className="range-input mt-5 w-full cursor-pointer"/><span className="mt-2 flex justify-between text-[10px] text-[#91a09d]"><span>−30%</span><span>0%</span><span>+30%</span></span><p className="mt-5 text-[11px] leading-5 text-[#82918f]">The estimate applies this percentage to recent average revenue. Try moving the slider to see the weekly estimate recalculate.</p></label>
              <div className="rounded-2xl bg-[#eff6f2] p-4 sm:p-5" aria-live="polite"><p className="text-[10px] font-medium text-[#758b85]">Estimated weekly net cash flow</p><div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2"><div><p className="text-[10px] text-[#82928f]">No change</p><p className="mt-1 text-[18px] font-semibold tracking-[-.5px] text-[#355653]">{money(baseline)}</p></div><ArrowRight size={16} className="text-[#7a9a8d]"/><div><p className="text-[10px] text-[#82928f]">At {salesChange}% sales</p><p className="mt-1 text-[18px] font-semibold tracking-[-.5px] text-[#236c5f]">{money(changed)}</p></div></div><p className="mt-4 border-t border-[#dbe8e1] pt-3 text-[10px] leading-5 text-[#788b85]">Illustrative estimate from demo rows. Results change with your data and assumptions. The calculation does not infer a starting balance.</p></div>
            </div>
          </div>
        </div>
      </section>

      <section id="ask-ai" className="grid scroll-mt-24 gap-8 py-12 sm:py-16 lg:grid-cols-[.85fr_1.15fr] lg:items-center lg:gap-16">
        <SectionIntro number="4" title="Ask CashSense AI" description="Open the dedicated AI page or use the floating assistant from the dashboard. Ask questions about the numbers, spending categories, or a supported what-if change. Replies depend on the financial context currently loaded."/>
        <div className="rounded-[24px] border border-[#d6e5de] bg-white p-5 shadow-[0_20px_60px_rgba(32,75,66,.07)] sm:p-7">
          <div className="flex items-center gap-3 border-b border-[#edf2ef] pb-4"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eaf4ef] text-[#347b6d]"><MessageCircle size={18}/></span><div><p className="text-[13px] font-semibold text-[#29484a]">Questions to get started</p><p className="mt-1 text-[10px] text-[#859592]">Dedicated chat + floating dashboard assistant</p></div></div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">{examples.map((example) => <li key={example} className="flex min-h-12 items-center gap-2 rounded-xl bg-[#f6f9f7] px-3 text-[11px] leading-5 text-[#536d6b]"><Sparkles size={13} className="shrink-0 text-[#579484]"/>{example}</li>)}</ul>
          <div className="mt-4 rounded-xl border border-[#eadcbe] bg-[#fcf8ee] p-4"><p className="text-[11px] font-semibold text-[#82653a]">Prototype disclosure</p><p className="mt-1 text-[11px] leading-5 text-[#887b61]">The deployed demo currently uses mock AI responses. They are local example replies, not live Anthropic analysis. The Python forecasting backend is not connected to the dashboard; estimates use the current frontend simulator.</p></div>
          <Link href="/ai" className="focus-ring mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#176f65] px-4 text-[12px] font-semibold text-white transition-colors hover:bg-[#105e56]">Explore CashSense AI <ArrowRight size={15}/></Link>
        </div>
      </section>

      <footer className="flex flex-col gap-3 border-t border-[#dfe9e4] py-6 text-[11px] text-[#798d89] sm:flex-row sm:items-center sm:justify-between"><p>This project is a prototype and is not financial advice.</p><div className="flex flex-wrap gap-x-4 gap-y-2"><Link href="/" className="focus-ring rounded hover:text-[#176f65]">Dashboard</Link><Link href="/#import" className="focus-ring rounded hover:text-[#176f65]">CSV import</Link><Link href="/ai" className="focus-ring rounded hover:text-[#176f65]">CashSense AI</Link></div></footer>
    </main>
  </div>;
}
