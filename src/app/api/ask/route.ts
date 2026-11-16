import { handleAsk } from "@/lib/ai/cash-ai";
import { callClaude } from "@/lib/ai/anthropic";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  return handleAsk(request, process.env, { callModel: callClaude });
}
