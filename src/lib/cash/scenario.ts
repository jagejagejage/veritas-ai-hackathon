import { dollars, list } from "./format.ts";
import type { Business, CashItem, Category } from "./types.ts";

/**
 * A scenario is the ONLY thing the language step may produce. It contains no computed
 * results, just instructions the deterministic engine applies after validation.
 */
export interface Match { itemId?: string; counterparty?: string; category?: Category }
export type ScenarioOp =
  | { op: "shift"; match: Match; weeks: number }
  | { op: "add"; direction: "in" | "out"; cents: number; week: number; label: string; repeat?: boolean }
  | { op: "scale"; category: "sales" | "invoice"; percent: number; fromWeek: number }
  | { op: "remove"; match: Match };

export interface Scenario { ops: ScenarioOp[] }

export const LIMITS = { maxOps: 3, maxShiftWeeks: 6, maxPercent: 50, maxAddCents: 5_000_000, maxLabel: 60 } as const;
const CATEGORIES: Category[] = ["sales", "invoice", "payroll", "rent", "supplies", "repair", "other"];

export type ValidationResult = { ok: true; scenario: Scenario } | { ok: false; reason: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const isInt = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

function validMatch(value: unknown, business: Business): Match | string {
  if (!isObject(value)) return "match must be an object";
  const match: Match = {};
  if (value.itemId !== undefined) { if (typeof value.itemId !== "string") return "itemId must be text"; match.itemId = value.itemId; }
  if (value.counterparty !== undefined) { if (typeof value.counterparty !== "string") return "counterparty must be text"; match.counterparty = value.counterparty; }
  if (value.category !== undefined) { if (!CATEGORIES.includes(value.category as Category)) return "unknown category"; match.category = value.category as Category; }
  if (!match.itemId && !match.counterparty && !match.category) return "match needs an itemId, counterparty or category";
  if (matchItems(business.items, match).length === 0) return "that doesn't match anything on your schedule";
  return match;
}

/** Strict validator: anything unexpected is rejected rather than repaired. */
export function validateScenario(value: unknown, business: Business): ValidationResult {
  if (!isObject(value) || !Array.isArray(value.ops)) return { ok: false, reason: "Scenario must contain a list of changes." };
  if (value.ops.length === 0) return { ok: false, reason: "No supported change was found in the question." };
  if (value.ops.length > LIMITS.maxOps) return { ok: false, reason: `At most ${LIMITS.maxOps} changes at once.` };
  const ops: ScenarioOp[] = [];
  for (const raw of value.ops) {
    if (!isObject(raw)) return { ok: false, reason: "Each change must be an object." };
    if (raw.op === "shift") {
      const match = validMatch(raw.match, business);
      if (typeof match === "string") return { ok: false, reason: `Shift: ${match}.` };
      if (!isInt(raw.weeks) || raw.weeks === 0 || Math.abs(raw.weeks) > LIMITS.maxShiftWeeks) return { ok: false, reason: `Shift must be a whole number of weeks between −${LIMITS.maxShiftWeeks} and ${LIMITS.maxShiftWeeks}.` };
      ops.push({ op: "shift", match, weeks: raw.weeks });
    } else if (raw.op === "add") {
      if (raw.direction !== "in" && raw.direction !== "out") return { ok: false, reason: "Add: direction must be in or out." };
      if (!isInt(raw.cents) || raw.cents <= 0 || raw.cents > LIMITS.maxAddCents) return { ok: false, reason: `Add: amount must be between $0.01 and ${dollars(LIMITS.maxAddCents)}.` };
      if (!isInt(raw.week) || raw.week < 1 || raw.week > business.horizon) return { ok: false, reason: `Add: week must be 1–${business.horizon}.` };
      if (typeof raw.label !== "string" || !raw.label.trim() || raw.label.length > LIMITS.maxLabel) return { ok: false, reason: "Add: label must be short text." };
      if (raw.repeat !== undefined && typeof raw.repeat !== "boolean") return { ok: false, reason: "Add: repeat must be true or false." };
      ops.push({ op: "add", direction: raw.direction, cents: raw.cents, week: raw.week, label: raw.label.trim(), repeat: raw.repeat === true });
    } else if (raw.op === "scale") {
      if (raw.category !== "sales" && raw.category !== "invoice") return { ok: false, reason: "Scale: only sales or invoices can be scaled." };
      if (!isInt(raw.percent) || raw.percent === 0 || Math.abs(raw.percent) > LIMITS.maxPercent) return { ok: false, reason: `Scale: percent must be a whole number between −${LIMITS.maxPercent} and ${LIMITS.maxPercent}.` };
      if (!isInt(raw.fromWeek) || raw.fromWeek < 1 || raw.fromWeek > business.horizon) return { ok: false, reason: `Scale: starting week must be 1–${business.horizon}.` };
      ops.push({ op: "scale", category: raw.category, percent: raw.percent, fromWeek: raw.fromWeek });
    } else if (raw.op === "remove") {
      const match = validMatch(raw.match, business);
      if (typeof match === "string") return { ok: false, reason: `Remove: ${match}.` };
      ops.push({ op: "remove", match });
    } else return { ok: false, reason: "Unknown change type." };
  }
  return { ok: true, scenario: { ops } };
}

export function matchItems(items: CashItem[], match: Match): CashItem[] {
  return items.filter((item) =>
    (!match.itemId || item.id === match.itemId)
    && (!match.counterparty || item.counterparty.toLowerCase() === match.counterparty.toLowerCase())
    && (!match.category || item.category === match.category));
}

/** Applies a validated scenario. Pure: returns a new item list. */
export function applyScenario(business: Business, scenario: Scenario): CashItem[] {
  let items = business.items.map((item) => ({ ...item }));
  scenario.ops.forEach((op, index) => {
    if (op.op === "shift") {
      const ids = new Set(matchItems(items, op.match).map((item) => item.id));
      items = items.map((item) => ids.has(item.id) ? { ...item, week: Math.max(1, item.week + op.weeks) } : item);
    } else if (op.op === "remove") {
      const ids = new Set(matchItems(items, op.match).map((item) => item.id));
      items = items.filter((item) => !ids.has(item.id));
    } else if (op.op === "scale") {
      items = items.map((item) => item.category === op.category && item.week >= op.fromWeek
        ? { ...item, cents: Math.round(item.cents * (100 + op.percent) / 100) } : item);
    } else {
      const weeks = op.repeat ? Array.from({ length: business.horizon - op.week + 1 }, (_, i) => op.week + i) : [op.week];
      items = [...items, ...weeks.map((week) => ({
        id: `scenario-${index}-w${week}`, week, label: op.label, counterparty: "What-if", cents: op.cents,
        direction: op.direction, category: "other" as Category,
      }))];
    }
  });
  return items;
}

/** Code-written description of what the validated scenario does (the AI never writes this). */
export function describeScenario(business: Business, scenario: Scenario): string[] {
  return scenario.ops.map((op) => {
    if (op.op === "shift" || op.op === "remove") {
      const hits = matchItems(business.items, op.match);
      const name = matchName(hits, op.match);
      const total = hits.reduce((sum, item) => sum + item.cents, 0);
      if (op.op === "remove") return `Remove ${name} (${dollars(total)} total).`;
      const when = hits.length === 1 ? ` from week ${hits[0].week} to week ${hits[0].week + op.weeks}` : "";
      const amount = hits.length === 1 ? `${dollars(total)} ` : `${hits.length} payments, ${dollars(total)} total, `;
      return `Move ${name}: ${amount}${Math.abs(op.weeks)} week${Math.abs(op.weeks) === 1 ? "" : "s"} ${op.weeks > 0 ? "later" : "earlier"}${when}.`;
    }
    if (op.op === "scale") return `${op.category === "sales" ? "Walk-in sales" : "Customer invoices"} ${op.percent > 0 ? "up" : "down"} ${Math.abs(op.percent)}% from week ${op.fromWeek}.`;
    return `${op.direction === "out" ? "New cost" : "New income"}: ${op.label}, ${dollars(op.cents)}${op.repeat ? ` every week from week ${op.week}` : ` in week ${op.week}`}.`;
  });
}

function matchName(items: CashItem[], match: Match): string {
  if (items.length === 1) return `${items[0].counterparty} (${items[0].label.toLowerCase()})`;
  const parties = [...new Set(items.map((item) => item.counterparty))];
  if (parties.length === 1) return `all ${parties[0]} payments`;
  if (match.category) return `all ${match.category} items`;
  return list(parties);
}
