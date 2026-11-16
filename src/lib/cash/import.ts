import type { WeeklyCashFlow } from "../types.ts";
import type { Business, CashItem } from "./types.ts";

/**
 * Turns the weekly CSV format (week, sales_walkin, invoices_collected, supplies, payroll, rent, other)
 * into a scheduled-items business. Each row is treated as one upcoming week, in order.
 * Levers are conservative defaults the owner can rely on: supplies can be split, rent and
 * "other" bills can be asked about, payroll is never moved.
 */
export function rowsToBusiness(rows: WeeklyCashFlow[], openingCents: number, startDate: string, name = "Your business"): Business {
  const weeks = rows.slice(0, 13);
  const items: CashItem[] = [];
  const cents = (dollars: number) => Math.round(dollars * 100);
  weeks.forEach((row, index) => {
    const week = index + 1;
    const push = (item: Omit<CashItem, "id" | "week">, key: string) => { if (item.cents > 0) items.push({ ...item, id: `${key}-w${week}`, week }); };
    push({ label: "Walk-in sales", counterparty: "Walk-in customers", cents: cents(row.sales_walkin), direction: "in", category: "sales", pooled: true }, "sales");
    push({ label: "Customer invoices", counterparty: "Invoice customers", cents: cents(row.invoices_collected), direction: "in", category: "invoice", reference: `the invoices due in week ${week}`, levers: { payEarly: { maxWeeks: 2, discountPct: 1, risk: "low" } } }, "invoices");
    push({ label: "Supplies", counterparty: "Suppliers", cents: cents(row.supplies), direction: "out", category: "supplies", reference: `the week-${week} supplies order`, levers: { split: { control: "you", risk: "none" } } }, "supplies");
    push({ label: "Payroll", counterparty: "Staff", cents: cents(row.payroll), direction: "out", category: "payroll" }, "payroll");
    push({ label: "Rent", counterparty: "Landlord", cents: cents(row.rent), direction: "out", category: "rent", reference: `the week-${week} rent`, levers: { defer: { maxWeeks: 1, feeCents: 0, control: "ask", risk: "high" } } }, "rent");
    push({ label: "Other bills", counterparty: "Other vendors", cents: cents(row.other), direction: "out", category: "other", reference: `the week-${week} bills`, levers: { defer: { maxWeeks: 1, feeCents: 0, control: "ask", risk: "low" } } }, "other");
  });
  return { name, owner: "Owner", openingCents, floorCents: 100_000, horizon: Math.max(4, weeks.length), startDate, items };
}

export function nextMonday(from = new Date()): string {
  const d = new Date(Date.UTC(from.getFullYear(), from.getMonth(), from.getDate()));
  const add = (8 - d.getUTCDay()) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}
