import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ModelRequest } from "./cash-ai";

/** One structured-output call. The schema constrains the reply to JSON; callers still validate it. */
export async function callClaude({ system, user, schema, maxTokens }: ModelRequest): Promise<string> {
  const client = new Anthropic({ maxRetries: 1, timeout: 20_000 });
  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { effort: "low", format: { type: "json_schema", schema } },
  } as unknown as Anthropic.MessageCreateParamsNonStreaming);
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") throw new Error(`Claude stopped: ${response.stop_reason}`);
  return response.content.filter((block) => block.type === "text").map((block) => block.text).join("");
}
