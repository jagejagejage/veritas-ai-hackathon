import type { ChatApiMessage, ChatMessage } from "./types.ts";

export type ConversationAction = { type: "append"; messages: ChatMessage[] } | { type: "clear" };

export function conversationReducer(state: ChatMessage[], action: ConversationAction): ChatMessage[] {
  return action.type === "clear" ? [] : [...state, ...action.messages].slice(-100);
}

export function buildRequestMessages(history: ChatMessage[], next: ChatMessage): ChatApiMessage[] {
  const lastAnsweredMessage = history.findLastIndex((message) => message.role === "assistant");
  const completedHistory = history.slice(0, lastAnsweredMessage + 1);
  return [...completedHistory, next].slice(-12).map(({ role, content }) => ({ role, content }));
}

export async function readChatReply(response: Response): Promise<{ reply: string; mock?: boolean }> {
  let body: { reply?: string; mock?: boolean; error?: string } = {};
  try { body = await response.json() as typeof body; } catch { /* Use the safe generic message below. */ }
  if (!response.ok || !body.reply) throw new Error(body.error || "CashSense AI couldn’t answer that. Try a shorter question.");
  return { reply: body.reply, mock: body.mock };
}
