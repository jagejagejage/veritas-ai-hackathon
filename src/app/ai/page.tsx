"use client";

import Link from "next/link";
import { ArrowLeft, ChartNoAxesCombined, ShieldCheck, Sparkles } from "lucide-react";
import { ChatInterface } from "@/components/ai/ChatInterface";
import { useChat } from "@/components/ai/ChatProvider";

export default function CashSenseAiPage() {
  const { context, mode } = useChat();
  const latest = context?.forecast[0];
  return <main className="mx-auto min-h-screen max-w-[1380px] px-3 pb-6 pt-4 sm:px-6 sm:pb-10 sm:pt-6 lg:px-10">
    <header className="mb-5 flex items-center justify-between gap-3 sm:mb-7">
      <Link href="/" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-[12px] font-semibold text-[#567174] hover:bg-white"><ArrowLeft size={15}/>Back to dashboard</Link>
      <span className="hidden items-center gap-1.5 text-[11px] text-[#788c8d] sm:flex"><ShieldCheck size={14} className="text-[#448478]"/>Your chat stays in this browser session</span>
    </header>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,1.05fr)] lg:items-stretch">
      <aside className="flex flex-col justify-between rounded-2xl border border-[#dce8e3] bg-[#eaf3ef] p-5 sm:p-7 lg:min-h-[760px] lg:p-9">
        <div>
          <div className="mb-5 flex items-center gap-2 text-[12px] font-semibold text-[#39796d]"><Sparkles size={15}/> CashSense AI</div>
          <h1 className="max-w-[540px] text-[30px] font-semibold leading-[1.12] tracking-[-1.2px] text-[#1d4041] text-pretty sm:text-[42px]">Make sense of what your cash flow is telling you.</h1>
          <p className="mt-4 max-w-[470px] text-[14px] leading-6 text-[#607c7b]">Ask a grounded question about the numbers, test a change, or find the parts of your forecast that need attention.</p>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <article className="rounded-xl border border-[#d7e6df] bg-white/80 p-4"><div className="flex items-center gap-2 text-[11px] font-semibold text-[#587875]"><ChartNoAxesCombined size={15}/> Dashboard context</div><p className="mt-2 text-[15px] font-semibold text-[#284748]">{context ? context.source === "demo" ? "Illustrative demo data" : "Imported cash-flow data" : "No dashboard data yet"}</p><p className="mt-1 text-[11px] leading-5 text-[#7e9290]">{context ? `${context.history.length} weeks available · ${context.spendingCategories.length} spending categories` : "Visit the dashboard to load current metrics, your forecast, and simulation assumptions."}</p></article>
          <article className="rounded-xl border border-[#d7e6df] bg-white/80 p-4"><div className="flex items-center gap-2 text-[11px] font-semibold text-[#587875]"><Sparkles size={14}/> Next-week estimate</div><p className="mt-2 text-[21px] font-semibold tracking-[-.6px] text-[#284748]">{latest ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(latest.netCashFlow) : "—"}</p><p className="mt-1 text-[11px] leading-5 text-[#7e9290]">{latest ? "Calculated by the CashSense dashboard simulator" : "An estimate will appear after dashboard data is available."}</p></article>
          <div className={`rounded-xl p-4 ${mode === "mock" ? "border border-[#efdfbd] bg-[#fcf7ed]" : "border border-[#d7e6df] bg-white/70"}`}><p className="text-[11px] font-semibold text-[#695c43]">{mode === "mock" ? "Mock mode · no paid requests" : mode === "live" ? "Claude is server-configured" : "Live setup needs attention"}</p><p className="mt-1 text-[10px] leading-5 text-[#827a68]">{mode === "mock" ? "Replies are local examples with a simulated delay. Anthropic is never called." : mode === "live" ? "Your messages are sent to the single server-configured Claude model only when you press send." : "Check CASHSENSE_AI_MODE and the server credentials. No fallback paid request is made."}</p></div>
        </div>
      </aside>
      <div className="min-h-[680px] lg:min-h-[760px]"><ChatInterface/></div>
    </div>
  </main>;
}
