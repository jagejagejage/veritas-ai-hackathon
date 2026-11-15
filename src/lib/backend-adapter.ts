import type {
  BackendFinancialRecord,
  BackendForecastRequest,
  BackendForecastResponse,
  CashFlowRecord,
  ForecastPoint,
  FinancialWarning,
  WeeklyCashFlow,
} from "@/lib/types";

/** Converts the dashboard's canonical rows to the provisional backend request shape. */
export function toBackendRecords(rows: WeeklyCashFlow[]): BackendFinancialRecord[] {
  return rows.map((row) => {
    const revenue = row.sales_walkin + row.invoices_collected;
    const expenses = row.supplies + row.payroll + row.rent + row.other;
    return { ...row, revenue, expenses, netCashFlow: revenue - expenses };
  });
}

export function toBackendForecastRequest(
  rows: WeeklyCashFlow[],
  horizonWeeks: 4 | 8 | 12,
  scenario: BackendForecastRequest["scenario"],
  startingCashBalance: number | null,
): BackendForecastRequest {
  return {
    records: toBackendRecords(rows),
    horizonWeeks,
    ...(startingCashBalance === null ? {} : { startingCashBalance }),
    scenario,
  };
}

/** Maps backend-shaped predictions into the chart's existing display model. */
export function fromBackendForecast(response: BackendForecastResponse): ForecastPoint[] {
  return response.predictions.map(({ week, netCashFlow, interval }) => ({
    week,
    netCashFlow,
    low: interval?.lower ?? netCashFlow,
    high: interval?.upper ?? netCashFlow,
    kind: "forecast",
  }));
}

export function backendWarningsToAlerts(warnings: FinancialWarning[]) {
  return warnings.map(({ title, detail }) => ({ title, detail }));
}

export function recordsFromRows(rows: WeeklyCashFlow[], source: CashFlowRecord["source"]): CashFlowRecord[] {
  return toBackendRecords(rows).map((record) => ({ ...record, source }));
}
