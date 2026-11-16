import type { Business, CashItem, Category, Control, Levers, Risk } from "./types.ts";

const CATEGORIES: Category[] = ["sales", "invoice", "payroll", "rent", "supplies", "repair", "other"];
const RISKS: Risk[] = ["none", "low", "high"];
const CONTROLS: Control[] = ["you", "ask"];
const MAX_CENTS = 10_000_000_000;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;

function levers(value: unknown): Levers | undefined | null {
  if (value === undefined) return undefined;
  if (!isObject(value)) return null;
  const out: Levers = {};
  if (value.payEarly !== undefined) {
    const p = value.payEarly;
    if (!isObject(p) || !isInt(p.maxWeeks, 1, 4) || typeof p.discountPct !== "number" || p.discountPct < 0 || p.discountPct > 5 || !RISKS.includes(p.risk as Risk)) return null;
    out.payEarly = { maxWeeks: p.maxWeeks, discountPct: p.discountPct, risk: p.risk as Risk };
  }
  if (value.defer !== undefined) {
    const d = value.defer;
    if (!isObject(d) || !isInt(d.maxWeeks, 1, 4) || !isInt(d.feeCents, 0, MAX_CENTS) || !CONTROLS.includes(d.control as Control) || !RISKS.includes(d.risk as Risk)) return null;
    out.defer = { maxWeeks: d.maxWeeks, feeCents: d.feeCents, control: d.control as Control, risk: d.risk as Risk };
  }
  if (value.split !== undefined) {
    const s = value.split;
    if (!isObject(s) || !CONTROLS.includes(s.control as Control) || !RISKS.includes(s.risk as Risk)) return null;
    out.split = { control: s.control as Control, risk: s.risk as Risk };
  }
  return out;
}

/** Strict shape check for a business sent from the browser. Returns null when anything is off. */
export function validateBusiness(value: unknown): Business | null {
  if (!isObject(value)) return null;
  if (!isText(value.name, 80) || !isText(value.owner, 60) || !isInt(value.horizon, 4, 13)) return null;
  if (!isInt(value.openingCents, -MAX_CENTS, MAX_CENTS) || !isInt(value.floorCents, 0, MAX_CENTS)) return null;
  if (typeof value.startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.startDate)) return null;
  if (!Array.isArray(value.items) || value.items.length > 400) return null;
  const horizon = value.horizon;
  const ids = new Set<string>();
  const items: CashItem[] = [];
  for (const raw of value.items) {
    if (!isObject(raw) || !isText(raw.id, 80) || ids.has(raw.id)) return null;
    if (!isText(raw.label, 80) || !isText(raw.counterparty, 80) || !isInt(raw.week, 1, horizon) || !isInt(raw.cents, 1, MAX_CENTS)) return null;
    if (raw.direction !== "in" && raw.direction !== "out") return null;
    if (!CATEGORIES.includes(raw.category as Category)) return null;
    if (raw.reference !== undefined && !isText(raw.reference, 120)) return null;
    if (raw.pooled !== undefined && typeof raw.pooled !== "boolean") return null;
    const lever = levers(raw.levers);
    if (lever === null) return null;
    ids.add(raw.id);
    items.push({
      id: raw.id, label: raw.label, counterparty: raw.counterparty, week: raw.week, cents: raw.cents,
      direction: raw.direction, category: raw.category as Category,
      ...(raw.reference !== undefined ? { reference: raw.reference as string } : {}),
      ...(raw.pooled ? { pooled: true } : {}),
      ...(lever ? { levers: lever } : {}),
    });
  }
  return { name: value.name, owner: value.owner, horizon, openingCents: value.openingCents, floorCents: value.floorCents, startDate: value.startDate, items };
}
