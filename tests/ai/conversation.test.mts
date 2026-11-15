import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRequestMessages, conversationReducer, readChatReply } from "../../src/lib/ai/conversation.ts";
import type { ChatMessage } from "../../src/lib/ai/types.ts";

const message = (role: "user" | "assistant", content: string): ChatMessage => ({ id: content, role, content, createdAt: "2026-11-14T12:00:00.000Z" });

test("the shared conversation reducer appends, bounds, and confirms a clear state transition", () => {
  const first = message("user", "First question");
  const withFirst = conversationReducer([], { type: "append", messages: [first] });
  const withReply = conversationReducer(withFirst, { type: "append", messages: [message("assistant", "Answer")] });
  assert.equal(withReply.length, 2);
  assert.deepEqual(conversationReducer(withReply, { type: "clear" }), []);
  assert.equal(conversationReducer([], { type: "append", messages: Array.from({ length: 102 }, (_, index) => message("user", String(index))) }).length, 100);
});

test("subsequent messages omit a previously failed, unanswered user turn", () => {
  const history = [message("user", "Answered question"), message("assistant", "Answer"), message("user", "Failed question")];
  const outgoing = buildRequestMessages(history, message("user", "Next question"));
  assert.deepEqual(outgoing.map(({ role, content }) => [role, content]), [
    ["user", "Answered question"], ["assistant", "Answer"], ["user", "Next question"],
  ]);
});

test("chat API errors become user-visible messages", async () => {
  await assert.rejects(() => readChatReply(new Response(JSON.stringify({ error: "Mocked server error" }), { status: 503 })), /Mocked server error/);
  await assert.rejects(() => readChatReply(new Response("not-json", { status: 502 })), /couldn’t answer/);
  assert.deepEqual(await readChatReply(new Response(JSON.stringify({ reply: "Ready", mock: true }))), { reply: "Ready", mock: true });
});
