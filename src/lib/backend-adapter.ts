import type { WeeklyCashFlow } from "@/lib/types";

/** Actual Python API rows use a sequential integer week and the six dollar fields only. */
export function toBackendRows(rows: WeeklyCashFlow[]) {
  return rows.map((row, index) => ({
    week: index + 1,
    sales_walkin: row.sales_walkin,
    invoices_collected: row.invoices_collected,
    supplies: row.supplies,
    payroll: row.payroll,
    rent: row.rent,
    other: row.other,
  }));
}

/** The Python API does not accept or infer a payment-delay-in-days control. */
export function supportsBackendScenario(paymentDelayDays: number): boolean {
  return paymentDelayDays === 0;
}
