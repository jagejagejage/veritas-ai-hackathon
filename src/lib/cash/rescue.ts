import { project } from "./engine.ts";
import { dollars } from "./format.ts";
import type { Business, CashItem, Cents, Control, Projection, Risk } from "./types.ts";

/**
 * Rescue Plan search. Deterministic and exhaustive over a small, bounded space:
 * every allowed move on the real scheduled items, in combinations of up to three.
 * The AI never chooses or ranks plans; it only writes the messages afterwards.
 */
export type ActionKind = "payEarly" | "defer" | "split" | "topUp";

export interface Action {
  key: string;
  kind: ActionKind;
  itemId: string;
  counterparty: string;
  fromWeek: number;
  toWeek: number;
  /** Cash moved by the action (the item amount, half of it for a split, or the top-up). */
  amountCents: Cents;
  costCents: Cents;
  control: Control;
  risk: Risk;
  /** Yearly rate implied by the cost, for money-costing moves. Null when free. */
  annualRatePct: number | null;
  title: string;
  why: string;
  reference?: string;
}

export interface Plan {
  id: string;
  actions: Action[];
  costCents: Cents;
  asks: number;
  riskScore: number;
  projection: Projection;
  lowestCents: Cents;
  /** Re-run of the plan if the largest expected invoice arrives one week later than scheduled. */
  stress: { counterparty: string; holds: boolean; lowestCents: Cents; week: number } | null;
  tier: "You control" | "Free, needs a yes" | "Costs money";
}

export interface RescueResult {
  needed: boolean;
  plans: Plan[];
  tested: number;
  candidates: number;
  /** Largest single payer as a share of incoming money, if any payer is 20% or more. */
  concentration: { counterparty: string; sharePct: number } | null;
}

const RISK_SCORE: Record<Risk, number> = { none: 0, low: 1, high: 3 };
/** Owner top-up / line of credit is priced at a stated, labelled assumption. */
export const TOP_UP_APR_PCT = 12;

function annualRate(costCents: number, amountCents: number, weeks: number): number | null {
  if (costCents <= 0 || amountCents <= 0 || weeks <= 0) return null;
  const net = amountCents - costCents;
  return Math.round((costCents / net) * (52 / weeks) * 1000) / 10;
}

export function candidateActions(business: Business, base: Projection): Action[] {
  const failing = base.weeks.filter((week) => week.endCents < business.floorCents).map((week) => week.week);
  if (!failing.length) return [];
  const lastFail = Math.max(...failing);
  const actions: Action[] = [];
  for (const item of business.items) {
    const levers = item.levers;
    if (!levers) continue;
    if (item.direction === "in" && levers.payEarly) {
      for (let k = 1; k <= levers.payEarly.maxWeeks; k += 1) {
        const toWeek = item.week - k;
        if (toWeek < 1 || toWeek > lastFail) continue;
        const cost = Math.round(item.cents * levers.payEarly.discountPct / 100);
        actions.push({
          key: `${item.id}:early:${k}`, kind: "payEarly", itemId: item.id, counterparty: item.counterparty,
          fromWeek: item.week, toWeek, amountCents: item.cents, costCents: cost, control: "ask", risk: levers.payEarly.risk,
          annualRatePct: annualRate(cost, item.cents, k),
          title: `Ask ${item.counterparty} to pay ${dollars(item.cents)} ${k === 1 ? "a week" : `${k} weeks`} early`,
          why: `Offer ${levers.payEarly.discountPct}% off (${dollars(cost)}) to move the money from week ${item.week} to week ${toWeek}.`,
          reference: item.reference,
        });
      }
    }
    if (item.direction === "out" && item.week <= lastFail) {
      if (levers.defer) {
        for (let k = 1; k <= levers.defer.maxWeeks; k += 1) {
          const toWeek = item.week + k;
          if (toWeek > business.horizon) continue;
          const fee = levers.defer.feeCents;
          actions.push({
            key: `${item.id}:defer:${k}`, kind: "defer", itemId: item.id, counterparty: item.counterparty,
            fromWeek: item.week, toWeek, amountCents: item.cents, costCents: fee, control: levers.defer.control, risk: levers.defer.risk,
            annualRatePct: annualRate(fee, item.cents, k),
            title: levers.defer.control === "you"
              ? `Book the ${item.label.toLowerCase()} for week ${toWeek}`
              : `Ask ${item.counterparty} to take ${item.label.toLowerCase()} in week ${toWeek}`,
            why: `${dollars(item.cents)} moves from week ${item.week} to week ${toWeek}${fee ? ` with a ${dollars(fee)} late fee` : " at no cost"}.`,
            reference: item.reference,
          });
        }
      }
      if (levers.split && item.week + 1 <= business.horizon) {
        const half = Math.floor(item.cents / 2);
        actions.push({
          key: `${item.id}:split`, kind: "split", itemId: item.id, counterparty: item.counterparty,
          fromWeek: item.week, toWeek: item.week + 1, amountCents: half, costCents: 0, control: levers.split.control, risk: levers.split.risk,
          annualRatePct: null,
          title: levers.split.control === "you"
            ? `Split the week-${item.week} ${item.counterparty} order in two`
            : `Ask ${item.counterparty} to split the ${item.label.toLowerCase()} payment`,
          why: `Pay ${dollars(item.cents - half)} in week ${item.week} and ${dollars(half)} in week ${item.week + 1}.`,
          reference: item.reference,
        });
      }
    }
  }
  return actions;
}

export function applyActions(items: CashItem[], actions: Action[]): CashItem[] {
  let next = items.map((item) => ({ ...item }));
  for (const action of actions) {
    if (action.kind === "topUp") {
      next.push({ id: `${action.key}:in`, week: action.fromWeek, label: "Owner top-up or credit line", counterparty: "Top-up", cents: action.amountCents, direction: "in", category: "other" });
      next.push({ id: `${action.key}:out`, week: action.toWeek, label: "Repay top-up with interest", counterparty: "Top-up", cents: action.amountCents + action.costCents, direction: "out", category: "other" });
      continue;
    }
    const item = next.find((entry) => entry.id === action.itemId);
    if (!item) continue;
    if (action.kind === "split") {
      next = next.map((entry) => entry.id === item.id ? { ...entry, cents: entry.cents - action.amountCents } : entry);
      next.push({ ...item, id: `${item.id}:second-half`, week: action.toWeek, cents: action.amountCents, levers: undefined });
    } else {
      next = next.map((entry) => entry.id === item.id ? { ...entry, week: action.toWeek } : entry);
      if (action.costCents > 0) {
        next.push({
          id: `${action.key}:cost`, week: action.kind === "payEarly" ? action.toWeek : action.toWeek,
          label: action.kind === "payEarly" ? `Early-pay discount to ${item.counterparty}` : `Late fee to ${item.counterparty}`,
          counterparty: item.counterparty, cents: action.costCents, direction: "out", category: "other",
        });
      }
    }
  }
  return next;
}

function topUpFor(business: Business, items: CashItem[]): Action | null {
  const projection = project(business, items);
  const failing = projection.weeks.filter((week) => week.endCents < business.floorCents);
  if (!failing.length) return null;
  const first = failing[0].week;
  const gap = business.floorCents - Math.min(...failing.map((week) => week.endCents));
  const amount = Math.ceil(gap / 10_000) * 10_000;
  // Repay in the first later week that can absorb it while staying above the floor.
  for (let repay = Math.max(...failing.map((week) => week.week)) + 1; repay <= business.horizon; repay += 1) {
    const weeks = repay - first;
    const cost = Math.max(100, Math.round(amount * TOP_UP_APR_PCT / 100 * weeks / 52));
    const action: Action = {
      key: `topup:${first}:${repay}`, kind: "topUp", itemId: "", counterparty: "Owner top-up or bank credit line",
      fromWeek: first, toWeek: repay, amountCents: amount, costCents: cost, control: "ask", risk: "low", annualRatePct: TOP_UP_APR_PCT,
      title: `Cover ${dollars(amount)} for ${weeks} week${weeks === 1 ? "" : "s"} from savings or a credit line`,
      why: `Put in ${dollars(amount)} in week ${first} and pay it back in week ${repay}. Assumes ${TOP_UP_APR_PCT}% a year (about ${dollars(cost)}).`,
    };
    const check = project(business, applyActions(items, [action]));
    if (check.weeks.every((week) => week.endCents >= business.floorCents)) return action;
  }
  return null;
}

function stressTest(business: Business, items: CashItem[]): Plan["stress"] {
  const biggest = items
    .filter((item) => item.direction === "in" && !item.pooled && item.week < business.horizon)
    .sort((a, b) => b.cents - a.cents)[0];
  if (!biggest) return null;
  const late = items.map((item) => item.id === biggest.id ? { ...item, week: item.week + 1 } : item);
  const projection = project(business, late);
  return { counterparty: biggest.counterparty, holds: projection.weeks.every((week) => week.endCents >= 0), lowestCents: projection.lowest.endCents, week: projection.lowest.week };
}

function makePlan(business: Business, actions: Action[]): Plan {
  const items = applyActions(business.items, actions);
  const projection = project(business, items);
  const costCents = actions.reduce((sum, action) => sum + action.costCents, 0);
  const asks = new Set(actions.filter((action) => action.control === "ask").map((action) => action.counterparty)).size;
  return {
    id: actions.map((action) => action.key).sort().join("+"),
    actions,
    costCents,
    asks,
    riskScore: actions.reduce((sum, action) => sum + RISK_SCORE[action.risk], 0),
    projection,
    lowestCents: projection.lowest.endCents,
    stress: stressTest(business, items),
    tier: costCents > 0 ? "Costs money" : asks > 0 ? "Free, needs a yes" : "You control",
  };
}

const feasible = (business: Business, projection: Projection) => projection.weeks.every((week) => week.endCents >= business.floorCents);

/** Tiers first (you control → free ask → costs money), then fewer asks, less goodwill spent, lower cost, more cushion. */
export function comparePlans(a: Plan, b: Plan): number {
  const tier = { "You control": 0, "Free, needs a yes": 1, "Costs money": 2 } as const;
  return tier[a.tier] - tier[b.tier] || a.asks - b.asks || a.riskScore - b.riskScore || a.costCents - b.costCents
    || a.actions.length - b.actions.length || b.lowestCents - a.lowestCents;
}

export function findRescuePlans(business: Business, maxActions = 3, limit = 3): RescueResult {
  const base = project(business);
  const concentration = concentrationOf(business);
  if (feasible(business, base)) return { needed: false, plans: [], tested: 0, candidates: 0, concentration };
  const candidates = candidateActions(business, base);
  const found: Plan[] = [];
  let tested = 0;

  const walk = (start: number, chosen: Action[]) => {
    if (chosen.length) {
      tested += 1;
      const plan = makePlan(business, chosen);
      if (feasible(business, plan.projection)) {
        // Minimal plans only: every action must be needed.
        const minimal = chosen.every((_, index) => !feasible(business, project(business, applyActions(business.items, chosen.filter((__, j) => j !== index)))));
        if (minimal) found.push(plan);
        return;
      }
    }
    if (chosen.length >= maxActions) return;
    for (let i = start; i < candidates.length; i += 1) {
      const action = candidates[i];
      // One move per item, and never ask the same person for two things.
      if (chosen.some((other) => other.itemId === action.itemId || (other.control === "ask" && action.control === "ask" && other.counterparty === action.counterparty))) continue;
      walk(i + 1, [...chosen, action]);
    }
  };
  walk(0, []);

  found.sort(comparePlans);
  const plans: Plan[] = [];
  for (const plan of found) {
    // Keep the shortlist varied: skip a plan whose moves are all already shown.
    const shown = new Set(plans.flatMap((p) => p.actions.map((action) => action.itemId)));
    if (plans.length && plan.actions.every((action) => shown.has(action.itemId))) continue;
    plans.push(plan);
    if (plans.length === limit) break;
  }
  if (plans.length < limit) {
    const topUp = topUpFor(business, business.items);
    if (topUp) { tested += 1; plans.push(makePlan(business, [topUp])); }
  }
  return { needed: true, plans, tested, candidates: candidates.length, concentration };
}

export function concentrationOf(business: Business): RescueResult["concentration"] {
  const incoming = business.items.filter((item) => item.direction === "in");
  const total = incoming.reduce((sum, item) => sum + item.cents, 0);
  if (!total) return null;
  const byParty = new Map<string, number>();
  for (const item of incoming) if (!item.pooled) byParty.set(item.counterparty, (byParty.get(item.counterparty) ?? 0) + item.cents);
  const [counterparty, cents] = [...byParty.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  const sharePct = Math.round(cents / total * 100);
  return sharePct >= 15 ? { counterparty, sharePct } : null;
}
