import Link from "next/link";

export const metadata = { title: "How it works · CashSense" };

const STEPS = [
  {
    n: "01",
    title: "A schedule, not a guess",
    body: "CashSense starts from what is already on the calendar: walk-in sales, each customer invoice and the week it should arrive, rent, payroll, supplier orders. The engine adds them up week by week in whole cents. It never averages, smooths or predicts.",
  },
  {
    n: "02",
    title: "A warning that names the week",
    body: "When the balance drops below zero, or below the cushion you set, CashSense says which week, by how much, which bills cause it, and which incoming payment arrives too late. Dana sees “$1,300 short in week 5” four weeks before it happens.",
  },
  {
    n: "03",
    title: "A rescue plan, searched exhaustively",
    body: "Each bill and invoice carries the moves that are realistic for it: reschedule a repair you booked, split a supply order, ask a client to pay early for a small discount, ask the landlord for a week. The engine tries every combination of up to three moves, keeps only plans that stay above the cushion every week, and ranks them: moves you control, then free asks, then moves that cost money. Each cost is also shown as a yearly rate, so a “small” 1% discount for one week reads honestly as about 52% a year.",
  },
  {
    n: "04",
    title: "AI that translates and writes, but never calculates",
    body: "Claude has two narrow jobs. It turns a typed question (“what if my catering customer pays two weeks late?”) into a small scenario object, which a strict validator checks before the engine runs it. And it drafts the actual messages for a plan the engine already chose. Every number in a draft is checked against the plan; one invented figure and the draft is replaced by a template. With no API key, built-in rules and templates do the same jobs.",
  },
];

export default function HowItWorks() {
  return <>
    <div className="backdrop" aria-hidden />
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6 sm:pt-4">
      <nav className="glass glass-pill mx-auto flex h-14 max-w-[1120px] items-center justify-between pl-5 pr-2" aria-label="Main">
        <Link href="/" className="font-semibold tracking-[-.02em]" translate="no">CashSense</Link>
        <Link href="/" className="btn btn-glass btn-sm">Open the demo</Link>
      </nav>
    </header>
    <main className="mx-auto max-w-[1120px] px-4 pb-20 sm:px-6">
      <section className="pb-10 pt-14 sm:pt-24">
        <p className="eyebrow">How it works</p>
        <h1 className="display mt-4 max-w-[16ch]">Profit and cash are not the same thing.</h1>
        <p className="mt-6 max-w-[58ch] text-[18px] leading-relaxed muted">A café can earn $6,000 over two months and still bounce rent in week five, because the money it is owed lands a week after the bills. CashSense shows that gap early and finds the cheapest way across it.</p>
      </section>
      <ol className="grid gap-4 sm:grid-cols-2">
        {STEPS.map((step) => <li key={step.n} className="glass p-6 sm:p-8">
          <p className="mono faint">{step.n}</p>
          <h2 className="title mt-3">{step.title}</h2>
          <p className="mt-3 muted leading-relaxed">{step.body}</p>
        </li>)}
      </ol>
      <section className="glass mt-4 p-6 sm:p-8" aria-labelledby="limits">
        <h2 id="limits" className="title">Honest limits</h2>
        <ul className="mt-3 grid gap-2 muted sm:grid-cols-2">
          <li>The demo uses made-up data for a fictional café.</li>
          <li>It assumes the owner knows roughly when customers will pay. Each plan shows what happens if the biggest one pays a week late.</li>
          <li>It is a deterministic schedule, not a prediction model.</li>
          <li>Plans are options to talk through, not financial advice. Nothing is ever sent automatically.</li>
        </ul>
      </section>
    </main>
  </>;
}
