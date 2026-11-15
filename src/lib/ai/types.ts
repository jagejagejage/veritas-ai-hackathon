import type { ForecastPoint, WeeklyCashFlow } from "../types.ts";

export type ChatRole = "user" | "assistant";

export interface ChatApiMessage {
  role: ChatRole;
  content: string;
}

export interface ChatMessage extends ChatApiMessage {
  id: string;
  createdAt: string;
  mock?: boolean;
}

export interface SimulationAssumptions {
  revenueChangePercent: number;
  expenseChange: number;
  paymentDelayDays: number;
}

export interface FinancialContext {
  source: "demo" | "imported";
  history: WeeklyCashFlow[];
  forecast: ForecastPoint[];
  spendingCategories: Array<{ name: string; value: number }>;
  alerts: Array<{ title: string; detail: string }>;
  currentCashBalance: number | null;
  assumptions: SimulationAssumptions;
}

export interface ChatApiPayload {
  messages: ChatApiMessage[];
  context?: FinancialContext | null;
}

export interface ChatApiResponse {
  reply?: string;
  mock?: boolean;
  error?: string;
}
