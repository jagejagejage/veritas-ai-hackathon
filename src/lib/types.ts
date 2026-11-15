export interface WeeklyCashFlow {
  week: string;
  sales_walkin: number;
  invoices_collected: number;
  supplies: number;
  payroll: number;
  rent: number;
  other: number;
}

export interface CashFlowRecord extends WeeklyCashFlow {
  revenue: number;
  expenses: number;
  netCashFlow: number;
  source: "demo" | "import";
}

export interface ForecastRequest {
  history: WeeklyCashFlow[];
  weeks: 4 | 8 | 12;
  assumptions: {
    revenueChangePercent: number;
    expenseChange: number;
    paymentDelayDays: number;
  };
}

export interface ForecastPoint {
  week: string;
  netCashFlow: number;
  low: number;
  high: number;
  kind: "actual" | "forecast";
}

export interface ForecastResponse {
  points: ForecastPoint[];
  modelLabel: string;
  generatedAt: string;
}

export interface ImportResponse {
  rows: WeeklyCashFlow[];
  errors: Array<{ row: number; message: string }>;
}
