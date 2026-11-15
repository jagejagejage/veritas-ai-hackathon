import type { WeeklyCashFlow } from "@/lib/types";

const FIELDS = ["sales_walkin", "invoices_collected", "supplies", "payroll", "rent", "other"] as const;
const MAX_PROXY_BODY_BYTES = 256_000;
type ForecastInput = {
  rows: WeeklyCashFlow[];
  horizon: number;
  openingCash: number | null;
  assumptions: { revenueChangePercent: number; expenseChange: number; paymentDelayDays: number };
};
type BackendWeek = { net: number };
export type BackendForecastResult = {
  points: Array<{ week: string; netCashFlow: number }>;
  recommended: "model" | "baseline";
  warnings: string[];
  backtest: { available: boolean; selectionInSample?: boolean; net_flow?: { model_mae: number; baseline_mae: number; model_rmse: number; baseline_rmse: number; skill_vs_baseline: number | null } };
};

async function readJsonLimited(request: Request): Promise<unknown> {
  if (!request.body) throw new Error("invalid_request");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PROXY_BODY_BYTES) {
        await reader.cancel();
        throw new Error("request_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(body)) as unknown; }
  catch { throw new Error("invalid_request"); }
}

function validInput(value: unknown): value is ForecastInput {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<ForecastInput>;
  if (!Array.isArray(input.rows) || input.rows.length < 2 || input.rows.length > 156) return false;
  if (!Number.isInteger(input.horizon) || input.horizon! < 1 || input.horizon! > 26) return false;
  if (input.openingCash !== null && (typeof input.openingCash !== "number" || !Number.isFinite(input.openingCash) || input.openingCash < -100_000_000 || input.openingCash > 100_000_000)) return false;
  const a = input.assumptions;
  if (!a || !Number.isFinite(a.revenueChangePercent) || a.revenueChangePercent < -30 || a.revenueChangePercent > 30 || !Number.isFinite(a.expenseChange) || a.expenseChange < 0 || a.expenseChange > 10_000 || !Number.isInteger(a.paymentDelayDays) || a.paymentDelayDays < 0 || a.paymentDelayDays > 21) return false;
  return input.rows.every((row, index) => row && typeof row.week === "string" && row.week.length <= 64 && FIELDS.every((field) => Number.isFinite(row[field]) && row[field] >= 0 && row[field] <= 100_000_000) && Number.isInteger(index + 1));
}

function validForecast(value: unknown, horizon: number): value is {
  recommended: "model" | "baseline";
  warnings: string[];
  model: { weeks: BackendWeek[] };
  baseline_forecast: { weeks: BackendWeek[] };
  backtest: BackendForecastResult["backtest"] & { selection_in_sample?: boolean };
} {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  const model = result.model as { weeks?: unknown } | undefined;
  const baseline = result.baseline_forecast as { weeks?: unknown } | undefined;
  const backtest = result.backtest as Record<string, unknown> | undefined;
  if ((result.recommended !== "model" && result.recommended !== "baseline") || !Array.isArray(result.warnings) || !result.warnings.every((w) => typeof w === "string") || !model || !Array.isArray(model.weeks) || model.weeks.length !== horizon || !baseline || !Array.isArray(baseline.weeks) || baseline.weeks.length !== horizon || !backtest || typeof backtest.available !== "boolean") return false;
  const hasNetValues = (weeks: unknown[]) => weeks.every((week) => week && typeof week === "object" && typeof (week as BackendWeek).net === "number" && Number.isFinite((week as BackendWeek).net));
  if (!hasNetValues(model.weeks) || !hasNetValues(baseline.weeks)) return false;
  if (backtest.available) {
    const metrics = backtest.net_flow as Record<string, unknown> | undefined;
    if (!metrics || !["model_mae", "baseline_mae", "model_rmse", "baseline_rmse"].every((key) => typeof metrics[key] === "number" && Number.isFinite(metrics[key]))) return false;
    if (backtest.selection_in_sample !== undefined && typeof backtest.selection_in_sample !== "boolean") return false;
    if (metrics.skill_vs_baseline !== null && (typeof metrics.skill_vs_baseline !== "number" || !Number.isFinite(metrics.skill_vs_baseline))) return false;
  }
  return true;
}

function validWhatIf(value: unknown, horizon: number): value is { after: { weeks: BackendWeek[] } } {
  if (!value || typeof value !== "object") return false;
  const after = (value as { after?: { weeks?: unknown } }).after;
  return Boolean(after && Array.isArray(after.weeks) && after.weeks.length === horizon && after.weeks.every((week) => week && typeof week === "object" && typeof (week as BackendWeek).net === "number" && Number.isFinite((week as BackendWeek).net)));
}

function upstreamUrl(base: string, path: "forecast" | "whatif"): string {
  const url = new URL(base);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !["localhost", "127.0.0.1", "::1"].includes(url.hostname))) throw new Error("invalid_backend_url");
  url.pathname = `${url.pathname.replace(/\/$/, "")}/${path}`;
  return url.toString();
}

async function postJson(fetcher: typeof fetch, url: string, body: unknown, signal: AbortSignal, token: string): Promise<unknown> {
  const response = await fetcher(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json", "x-cashsense-backend-token": token }, body: JSON.stringify(body), cache: "no-store", signal });
  if (!response.ok) throw new Error("backend_unavailable");
  try { return await response.json(); } catch { throw new Error("backend_invalid_response"); }
}

export async function handleForecastProxy(request: Request, options: { backendUrl?: string; backendToken?: string; fetcher?: typeof fetch; timeoutMs?: number } = {}): Promise<Response> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_PROXY_BODY_BYTES)) {
    return Response.json({ error: "Forecast request exceeds the 256 KB limit." }, { status: 413 });
  }
  let input: unknown;
  try { input = await readJsonLimited(request); }
  catch (error) {
    if (error instanceof Error && error.message === "request_too_large") return Response.json({ error: "Forecast request exceeds the 256 KB limit." }, { status: 413 });
    return Response.json({ error: "Invalid forecast request." }, { status: 400 });
  }
  if (!validInput(input)) return Response.json({ error: "Invalid forecast request." }, { status: 400 });
  if (input.assumptions.paymentDelayDays > 0) return Response.json({ error: "The Python backend cannot represent payment delays in days. This estimate must use the local fallback." }, { status: 422 });
  if (!options.backendUrl) return Response.json({ error: "The Python forecasting service is not configured." }, { status: 503 });
  if (!options.backendToken) return Response.json({ error: "The Python forecasting service credential is not configured." }, { status: 503 });

  let forecastUrl: string;
  let whatIfUrl: string;
  try { forecastUrl = upstreamUrl(options.backendUrl, "forecast"); whatIfUrl = upstreamUrl(options.backendUrl, "whatif"); }
  catch { return Response.json({ error: "The Python forecasting service URL is invalid." }, { status: 503 }); }

  const rows = input.rows.map((row, index) => ({ week: index + 1, ...Object.fromEntries(FIELDS.map((field) => [field, row[field]])) }));
  const reference = { rows, ...(input.openingCash === null ? {} : { opening_cash: input.openingCash }) };
  const forecastRequest = { ...reference, horizon: input.horizon };
  const scenarioOps = input.assumptions.expenseChange > 0 ? [{ op: "add", field: "other", week: 1, amount: input.assumptions.expenseChange }] : [];
  const scenarioRequest = {
    ...forecastRequest,
    basis: "forecast",
    forecast_source: "recommended",
    ...(input.assumptions.revenueChangePercent === 0 ? {} : { sales_change_pct: input.assumptions.revenueChangePercent }),
    ops: scenarioOps,
  };
  const useWhatIf = input.assumptions.revenueChangePercent !== 0 || input.assumptions.expenseChange > 0;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
  try {
    const fetcher = options.fetcher ?? fetch;
    const rawForecast = await postJson(fetcher, forecastUrl, forecastRequest, controller.signal, options.backendToken);
    if (!validForecast(rawForecast, input.horizon)) throw new Error("backend_invalid_response");
    const recommendedWeeks = rawForecast.recommended === "baseline"
      ? rawForecast.baseline_forecast.weeks
      : rawForecast.model.weeks;
    let points = recommendedWeeks.map((week, index) => ({ week: `Week ${index + 1}`, netCashFlow: week.net }));
    if (useWhatIf) {
      const rawScenario = await postJson(fetcher, whatIfUrl, scenarioRequest, controller.signal, options.backendToken);
      if (!validWhatIf(rawScenario, input.horizon)) throw new Error("backend_invalid_response");
      points = rawScenario.after.weeks.map((week, index) => ({ week: `Week ${index + 1}`, netCashFlow: week.net }));
    }
    const rawBacktest = rawForecast.backtest as BackendForecastResult["backtest"] & { selection_in_sample?: boolean };
    const response: BackendForecastResult = {
      points,
      recommended: rawForecast.recommended,
      warnings: rawForecast.warnings,
      backtest: {
        available: rawBacktest.available,
        ...(rawBacktest.selection_in_sample === undefined ? {} : { selectionInSample: rawBacktest.selection_in_sample }),
        ...(rawBacktest.net_flow ? { net_flow: {
          model_mae: rawBacktest.net_flow.model_mae,
          baseline_mae: rawBacktest.net_flow.baseline_mae,
          model_rmse: rawBacktest.net_flow.model_rmse,
          baseline_rmse: rawBacktest.net_flow.baseline_rmse,
          skill_vs_baseline: rawBacktest.net_flow.skill_vs_baseline,
        } } : {}),
      },
    };
    return Response.json(response, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const timeoutError = error instanceof Error && error.name === "AbortError";
    const invalidResponse = error instanceof Error && error.message === "backend_invalid_response";
    return Response.json({ error: timeoutError ? "The Python forecasting service timed out." : invalidResponse ? "The Python forecasting service returned an invalid response." : "The Python forecasting service is unavailable." }, { status: 503 });
  } finally { clearTimeout(timeout); }
}
