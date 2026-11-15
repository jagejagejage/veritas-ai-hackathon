import type { CashFlowRecord, ForecastPoint, WeeklyCashFlow } from "@/lib/types";

// The repository did not include the referenced historical CSV. These values are
// visibly identified as illustrative demo data until a business imports its own.
export const demoRows: WeeklyCashFlow[] = [
  { week: "Sep 22", sales_walkin: 6840, invoices_collected: 9250, supplies: 3180, payroll: 7200, rent: 1650, other: 940 },
  { week: "Sep 29", sales_walkin: 7320, invoices_collected: 6100, supplies: 2840, payroll: 7200, rent: 0, other: 1280 },
  { week: "Oct 06", sales_walkin: 6980, invoices_collected: 10800, supplies: 3560, payroll: 7350, rent: 1650, other: 860 },
  { week: "Oct 13", sales_walkin: 7810, invoices_collected: 7400, supplies: 3210, payroll: 7350, rent: 0, other: 1470 },
  { week: "Oct 20", sales_walkin: 7540, invoices_collected: 12600, supplies: 3890, payroll: 7500, rent: 1650, other: 920 },
  { week: "Oct 27", sales_walkin: 8120, invoices_collected: 5600, supplies: 3420, payroll: 7500, rent: 0, other: 1690 },
  { week: "Nov 03", sales_walkin: 7920, invoices_collected: 11300, supplies: 4160, payroll: 7650, rent: 1650, other: 990 },
  { week: "Nov 10", sales_walkin: 8650, invoices_collected: 8200, supplies: 3780, payroll: 7650, rent: 0, other: 1420 },
];

export function toRecords(rows: WeeklyCashFlow[], source: CashFlowRecord["source"] = "demo"): CashFlowRecord[] {
  return rows.map((row) => {
    const revenue = row.sales_walkin + row.invoices_collected;
    const expenses = row.supplies + row.payroll + row.rent + row.other;
    return { ...row, revenue, expenses, netCashFlow: revenue - expenses, source };
  });
}

export function buildForecast(
  rows: WeeklyCashFlow[],
  weeks: number,
  revenueChangePercent: number,
  expenseChange: number,
  paymentDelayDays: number,
): ForecastPoint[] {
  const records = toRecords(rows);
  const history = records.map((row) => ({ week: row.week, netCashFlow: row.netCashFlow, low: row.netCashFlow, high: row.netCashFlow, kind: "actual" as const }));
  const baselineRevenue = records.slice(-4).reduce((sum, row) => sum + row.revenue, 0) / Math.min(4, records.length);
  const baselineExpenses = records.slice(-4).reduce((sum, row) => sum + row.expenses, 0) / Math.min(4, records.length);
  const projectedNet = baselineRevenue * (1 + revenueChangePercent / 100) - baselineExpenses - (paymentDelayDays / 7) * baselineRevenue * 0.36;
  const forecast = Array.from({ length: weeks }, (_, index) => {
    const netCashFlow = Math.round(projectedNet - (index === 0 ? expenseChange : 0));
    const spread = Math.round(baselineRevenue * (0.075 + index * 0.012));
    return { week: `Week ${index + 1}`, netCashFlow, low: netCashFlow - spread, high: netCashFlow + spread, kind: "forecast" as const };
  });
  return [...history, ...forecast];
}

export const categoryTotals = (rows: CashFlowRecord[]) => [
  { name: "Payroll", value: rows.reduce((sum, row) => sum + row.payroll, 0), color: "#244c55" },
  { name: "Supplies", value: rows.reduce((sum, row) => sum + row.supplies, 0), color: "#5e9a91" },
  { name: "Rent", value: rows.reduce((sum, row) => sum + row.rent, 0), color: "#9ac7b8" },
  { name: "Other", value: rows.reduce((sum, row) => sum + row.other, 0), color: "#d5e6df" },
];
