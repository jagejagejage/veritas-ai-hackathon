import "server-only";
import { handleForecastProxy } from "@/lib/backend-integration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  console.info("CashSense auth diagnostics backend_token_configured=%s", Boolean(process.env.CASHSENSE_BACKEND_TOKEN));
  return handleForecastProxy(request, {
    backendUrl: process.env.CASHSENSE_BACKEND_URL,
    backendToken: process.env.CASHSENSE_BACKEND_TOKEN,
  });
}
