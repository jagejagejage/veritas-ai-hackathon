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

/** Provisional API contract. Confirm field names and semantics with Liam before wiring HTTP. */
export interface BackendFinancialRecord extends WeeklyCashFlow {
  revenue: number;
  expenses: number;
  netCashFlow: number;
}

export interface PredictionInterval {
  lower: number;
  upper: number;
  confidenceLevel?: number;
}

export interface BackendPrediction {
  week: string;
  netCashFlow: number;
  interval?: PredictionInterval;
}

export interface FinancialWarning {
  code?: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  week?: string;
}

export interface WhatIfScenario {
  revenueChangePercent: number;
  expenseChange: number;
  paymentDelayDays: number;
}

export interface BaselineComparison {
  baselineModel: string;
  baselineMetric: string;
  baselineValue: number;
  selectedModel: string;
  selectedMetric: string;
  selectedValue: number;
}

export interface ModelEvaluationMetrics {
  mae?: number;
  rmse?: number;
  mapePercent?: number;
  sampleCount?: number;
  [metric: string]: number | undefined;
}

export interface BackendForecastRequest {
  records: BackendFinancialRecord[];
  horizonWeeks: 4 | 8 | 12;
  startingCashBalance?: number;
  scenario: WhatIfScenario;
}

export interface BackendForecastResponse {
  predictions: BackendPrediction[];
  warnings: FinancialWarning[];
  baselineComparison?: BaselineComparison;
  evaluationMetrics?: ModelEvaluationMetrics;
  modelName: string;
  generatedAt: string;
}
