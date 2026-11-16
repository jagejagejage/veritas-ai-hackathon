import type { Business, CashItem } from "./types.ts";

/**
 * Rules-based translator used when no AI key is configured, and as the fallback when the
 * AI is unavailable. It returns an UNVALIDATED scenario object; callers must run
 * validateScenario() before applying it, exactly as they do with AI output.
 */
export type TranslateOutput = { ops: unknown[] } | { unsupported: string };

const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, couple: 2 };

function parseAmount(text: string): number | null {
  const match = text.match(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)\s*(k|thousand)?|(\d[\d,]*(?:\.\d{1,2})?)\s*(k|thousand|dollars|bucks)/i);
  if (!match) return null;
  const raw = (match[1] ?? match[3]).replaceAll(",", "");
  const scale = /k|thousand/i.test(match[2] ?? match[4] ?? "") ? 1000 : 1;
  const value = Number(raw) * scale;
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

function parseWeeks(text: string): number | null {
  const weeks = text.match(/(\d+|a|an|one|two|three|four|five|six|couple of)\s+weeks?/i);
  if (weeks) {
    const word = weeks[1].toLowerCase().replace(" of", "");
    return NUMBER_WORDS[word] ?? Number(word);
  }
  const days = text.match(/(\d+)\s+days?/i);
  if (days) return Math.max(1, Math.round(Number(days[1]) / 7));
  if (/\ba week\b|next week/i.test(text)) return 1;
  if (/\ba month\b/i.test(text)) return 4;
  return null;
}

function parseWeekNumber(text: string): number | null {
  const match = text.match(/\bweek\s+(\d{1,2})\b/i);
  return match ? Number(match[1]) : null;
}

/** Find which scheduled item(s) the question is about, by name first, then by kind. */
export function findTarget(question: string, business: Business): { counterparty?: string; category?: CashItem["category"]; itemId?: string } | null {
  const q = question.toLowerCase();
  const parties = [...new Set(business.items.map((item) => item.counterparty))];
  for (const party of parties) {
    const first = party.toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, "");
    if (first.length >= 4 && q.includes(first) && !["walk", "office", "staff"].includes(first)) return { counterparty: party };
  }
  if (/\brent|landlord/.test(q)) {
    const rent = business.items.filter((item) => item.category === "rent").sort((a, b) => b.week - a.week);
    return rent.length > 1 ? { category: "rent" } : rent[0] ? { itemId: rent[0].id } : null;
  }
  if (/repair|espresso|machine|contractor/.test(q)) return business.items.some((item) => item.category === "repair") ? { category: "repair" } : null;
  if (/payroll|wages|staff/.test(q)) return { category: "payroll" };
  if (/supplier|supplies|stock|order|ingredients/.test(q)) return { category: "supplies" };
  if (/catering|customer|client|invoice|gets? paid|pays?\b/.test(q)) {
    const biggest = business.items.filter((item) => item.direction === "in" && !item.pooled).sort((a, b) => b.cents - a.cents)[0];
    return biggest ? { counterparty: biggest.counterparty } : null;
  }
  return null;
}

export function ruleTranslate(question: string, business: Business): TranslateOutput {
  const q = question.toLowerCase().trim();
  if (!q) return { unsupported: "Type a question first." };

  // Sales up or down by a percentage.
  const pct = q.match(/(-?\d{1,3})\s*(%|percent)/);
  if (pct && /sales|revenue|business|customers|foot traffic|walk-?in/.test(q)) {
    const n = Math.abs(Number(pct[1]));
    const down = /drop|fall|down|lose|lower|decreas|slow|less|fewer|cut|-/.test(q);
    return { ops: [{ op: "scale", category: "sales", percent: down ? -n : n, fromWeek: parseWeekNumber(q) ?? 1 }] };
  }

  // Skip or cancel something on the schedule.
  if (/\b(skip|cancel|drop|don't|do not|never)\b/.test(q) && !/late|early/.test(q)) {
    const target = findTarget(q, business);
    if (target) return { ops: [{ op: "remove", match: target }] };
  }

  // Paid late / early.
  if (/\b(late|later|delay\w*|slip\w*|early|earlier|sooner|push\w* back|postpone\w*)\b/.test(q)) {
    const target = findTarget(q, business);
    if (!target) return { unsupported: "I couldn't tell which payment you mean. Try naming the customer or bill, like \"What if Northgate pays two weeks late?\"" };
    const weeks = parseWeeks(q) ?? 1;
    const earlier = /\b(early|earlier|sooner)\b/.test(q);
    return { ops: [{ op: "shift", match: target, weeks: earlier ? -weeks : weeks }] };
  }

  // A new cost or new income.
  const cents = parseAmount(q);
  if (cents) {
    const income = /\b(win|land|new (catering|client|order|contract)|extra (sales|income|order)|earn|get paid|grant|deposit)\b/.test(q);
    const repeat = /\b(every|per|a|each)\s+week\b|weekly/.test(q);
    const week = parseWeekNumber(q) ?? 1;
    const broken = q.match(/(?:the |my |our )?([a-z]+(?: [a-z]+)?) (?:dies|breaks|fails|goes out|needs fixing)/)?.[1];
    const hire = q.match(/\bhire (?:a |an )?([a-z]+(?: [a-z]+)?) (?:for|at|costing)\b/)?.[1];
    const label = hire ? `Hire ${hire}` : broken ? `Replace ${broken.replace(/^(the|my|our) /, "")}` : (q.match(/(?:buy|replace|fix|hire|pay for|spend on|new)\s+(?:a |an |the )?([a-z][a-z \-]{2,30}?)(?:\s+(?:for|costing|at|in|that|which)\b|[,?.$]|$)/)?.[1] ?? (income ? "New income" : "New cost")).trim();
    return { ops: [{ op: "add", direction: income ? "in" : "out", cents, week, label: label.charAt(0).toUpperCase() + label.slice(1), repeat }] };
  }

  return { unsupported: "CashSense can test: a payment arriving late or early, a bill moving, a new one-time or weekly cost, a sales change by %, or skipping a bill. Try one of the examples." };
}
