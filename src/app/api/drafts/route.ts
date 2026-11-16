import { handleDrafts } from "@/lib/ai/cash-ai";
import { callClaude } from "@/lib/ai/anthropic";

export const runtime = "nodejs";
export const maxDuration = 45;

export async function POST(request: Request) {
  return handleDrafts(request, process.env, { callModel: callClaude });
}
