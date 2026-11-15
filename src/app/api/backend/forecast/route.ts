import "server-only";
import { handleForecastProxy } from "@/lib/backend-integration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleForecastProxy(request, { backendUrl: process.env.CASHSENSE_BACKEND_URL });
}
