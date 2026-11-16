import type { Business, CashItem } from "./types.ts";

/**
 * Dana's Corner Café: fictional demo data. Profitable over the 8 weeks (+$6,000),
 * yet the balance goes to −$1,300 in week 5 because rent and an espresso-machine repair
 * land a week before the big catering invoice is paid.
 * Mirrors backend/data/sample-cafe.csv with a $2,000 opening balance.
 */
const $ = (dollars: number) => Math.round(dollars * 100);

function weekly(prefix: string, weeks: number[], make: (week: number) => Omit<CashItem, "id" | "week">): CashItem[] {
  return weeks.map((week) => ({ id: `${prefix}-w${week}`, week, ...make(week) }));
}

const ALL = [1, 2, 3, 4, 5, 6, 7, 8];

export const danaCafe: Business = {
  name: "Dana's Corner Café",
  owner: "Dana",
  openingCents: $(2000),
  floorCents: $(1000),
  horizon: 8,
  startDate: "2026-11-16",
  items: [
    ...weekly("sales", ALL, () => ({ label: "Walk-in sales", counterparty: "Walk-in customers", cents: $(3000), direction: "in", category: "sales", pooled: true })),
    ...weekly("lunch", [1, 2, 3, 4, 7, 8], () => ({ label: "Weekly office lunch orders", counterparty: "Office lunch clients", cents: $(1500), direction: "in", category: "invoice", pooled: true })),
    {
      id: "northgate-1042", week: 6, label: "Catering invoice #1042", counterparty: "Northgate Offices", cents: $(7500), direction: "in", category: "invoice",
      reference: "invoice #1042 for the October event catering",
      levers: { payEarly: { maxWeeks: 2, discountPct: 1, risk: "low" } },
    },
    ...weekly("supplies", ALL, (week) => ({
      label: week === 3 ? "Holiday stock-up order" : "Food and supplies order",
      counterparty: "Bayside Foods",
      cents: week === 3 ? $(4300) : $(1800),
      direction: "out",
      category: "supplies",
      reference: week === 3 ? "the holiday stock-up order" : `the week-${week} supplies order`,
      levers: { split: { control: "you", risk: "none" } },
    })),
    ...weekly("payroll", [2, 4, 6, 8], () => ({ label: "Payroll", counterparty: "Staff", cents: $(2400), direction: "out", category: "payroll" })),
    { id: "rent-w1", week: 1, label: "Rent", counterparty: "Maple Property Co.", cents: $(3000), direction: "out", category: "rent" },
    {
      id: "rent-w5", week: 5, label: "Rent", counterparty: "Maple Property Co.", cents: $(3000), direction: "out", category: "rent",
      reference: "December rent", levers: { defer: { maxWeeks: 1, feeCents: $(150), control: "ask", risk: "high" } },
    },
    {
      id: "repair-w5", week: 5, label: "Espresso machine repair", counterparty: "Coastline Equipment", cents: $(2000), direction: "out", category: "repair",
      reference: "the espresso machine repair", levers: { defer: { maxWeeks: 2, feeCents: 0, control: "you", risk: "none" }, split: { control: "ask", risk: "low" } },
    },
  ],
};
