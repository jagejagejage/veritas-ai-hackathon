CashSense: a cash-flow early-warning app that tells a small shop owner which week they'll run short, and the cheapest way through it, in plain English. Track: AI + Finance, VERITAS AI International High School Hackathon 2026.

## Inspiration
Many small businesses don't fail for lack of profit. They run out of cash at the wrong moment: customers pay invoices weeks late while rent and payroll are due now. The JPMorgan Chase Institute found the typical small restaurant holds only about 16 days of cash ([source](https://www.jpmorganchase.com/corporate/institute/report-cash-flows-balances-and-buffer-days.htm)). [Check the figure against the report before submitting.] We built CashSense for people like Dana, a fictional café owner who caters for local offices. Her books show $6,000 of profit over the next two months, yet she can't see that she'll bounce rent in week 5.

## What it does
- **The warning.** An 8-week cash balance chart, red/yellow/green for every week, and one sentence: "You'll be $1,300 short in week 5. Rent ($3,000) and espresso machine repair ($2,000) land before $7,500 from Northgate Offices arrives in week 6." It's flagged four weeks ahead.
- **Rescue Plan.** One tap searches every realistic move on Dana's real bills and invoices, up to three moves at a time: book the repair a week later, split a supply order, ask a client to pay early for 1% off, ask the landlord for a week. It keeps only plans that stay above her safety cushion every week, then ranks them: moves she controls first, then free asks, then moves that cost money. Plan A costs $0 and needs no one's permission. Each plan also shows:
  - its cost as a yearly rate ("1% for one week is about 52% a year");
  - what happens if her biggest client pays late anyway;
  - a preview line on the chart.
- **Messages ready to send.** For plans that need someone's yes, the AI drafts a warm, specific email. Every number in it is highlighted and checked against the plan.
- **Ask CashSense.** Type "What if my catering customer pays two weeks late?" and see the baseline and new cash lines side by side. The change is spelled out by code ("Move Northgate Offices: $7,500 from week 6 to week 8"), and the new lowest point is shown in red.
- Runs on fictional demo data that loads instantly, or import a weekly CSV. [Screenshot or GIF here.]

## How we built it
Next.js, React, Tailwind and Recharts on the front end, with a deterministic engine in TypeScript. Our rule is "AI understands and writes; code does the math." All numbers come from pure functions using integer cents. Claude has exactly two jobs:
1. **Translate a question into a scenario object.** The schema allows shift, add, scale and remove. A strict validator checks it twice, on the server and in the browser, and anything invalid is shown as "Not run."
2. **Write the messages for a plan the engine already chose.** The server re-runs the search itself instead of trusting the browser. Any draft containing a number that isn't in the plan, even spelled out ("seven thousand"), or pressure words like "interest" or "deadline", is thrown away and replaced with a checked template.

Without an API key, built-in rules and templates do both jobs, so the demo never breaks. Tests use Node's built-in test runner against hand-calculated balances, including fake model replies that try to invent numbers.

## Challenges we ran into
- **Stopping the AI from inventing numbers.** We split translation from calculation, added a validator for scenarios, and a number checker for drafted emails, then tested both with hostile model outputs.
- **Making the rescue search honest.** Our first ranking always picked "ask the landlord," because deferring is free in cash but costly in goodwill. We added who-controls-it and goodwill cost, locked payroll, showed yearly rates, and added a stress test.
- **Making warnings understandable.** Every warning names the week, the dollar amount, the bills that cause it, and the payment that arrives too late. No finance jargon.

## Accomplishments we're proud of
- Hand-checked balances match across the engine, the tests and the backend's sample CSV: −$1,300 in week 5, +$6,000 profit overall.
- The demo shows a profitable café that runs out of cash in week 5. It's flagged four weeks early, with a $0 fix she controls, a backup plan, and the email already written.
- [Confirm: runs on a real phone from a live link.]

## What we learned
Profit and cash are different things. And for trust, the AI should do less: translate the question and write the message, never do the calculation.

## What's next
Read-only import from accounting tools, learning each customer's real payment habits so dates come from history, uncertain dates shown as ranges, text-message alerts, and testing with real shop owners.

## Honest limits
It uses made-up data. It assumes the owner knows roughly when customers will pay, although each plan shows what happens if the biggest one is late. It's a deterministic schedule, not a prediction model. Plans are options to discuss, not financial advice, and nothing is ever sent automatically.

## Links
Demo video: [link] · GitHub: [link] · Live demo: [link]
