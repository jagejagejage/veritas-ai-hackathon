import Anthropic from "@anthropic-ai/sdk";
import { handleChatRequest, MAX_OUTPUT_TOKENS } from "@/lib/ai/server";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function POST(request: Request) {
  return handleChatRequest(request, process.env, { callModel: async ({ model, system, messages }) => {
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      maxRetries: 0,
      timeout: 15_000,
    });
    const response = await client.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system,
      messages,
    });
    return response.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
  } });
}
