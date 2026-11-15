"use client";

import { createContext, useCallback, useContext, useMemo, useReducer, useState, type ReactNode } from "react";
import type { ChatApiMessage, ChatMessage, FinancialContext } from "@/lib/ai/types";
import { buildRequestMessages, conversationReducer, readChatReply } from "@/lib/ai/conversation";

type AiMode = "mock" | "live" | "invalid";
type ChatState = {
  messages: ChatMessage[];
  context: FinancialContext | null;
  setFinancialContext: (context: FinancialContext) => void;
  sendMessage: (content: string) => Promise<void>;
  clearConversation: () => void;
  isSending: boolean;
  error: string;
  mode: AiMode;
};

const ChatContext = createContext<ChatState | null>(null);

export function ChatProvider({ children, mode }: { children: ReactNode; mode: AiMode }) {
  const [messages, dispatchConversation] = useReducer(conversationReducer, []);
  const [context, setContext] = useState<FinancialContext | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  const setFinancialContext = useCallback((next: FinancialContext) => setContext(next), []);
  const clearConversation = useCallback(() => { dispatchConversation({ type: "clear" }); setError(""); }, []);

  const sendMessage = useCallback(async (raw: string) => {
    const content = raw.trim();
    if (!content || isSending) return;
    const nextMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content, createdAt: new Date().toISOString() };
    const payloadMessages: ChatApiMessage[] = buildRequestMessages(messages, nextMessage);
    dispatchConversation({ type: "append", messages: [nextMessage] });
    setIsSending(true);
    setError("");
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payloadMessages, context }),
        signal: AbortSignal.timeout(18_000),
      });
      const data = await readChatReply(response);
      dispatchConversation({ type: "append", messages: [{ id: crypto.randomUUID(), role: "assistant", content: data.reply, createdAt: new Date().toISOString(), mock: data.mock }] });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "CashSense AI couldn’t send your message. Check your connection and try again.");
    } finally {
      setIsSending(false);
    }
  }, [context, isSending, messages]);

  const value = useMemo(() => ({ messages, context, setFinancialContext, sendMessage, clearConversation, isSending, error, mode }), [messages, context, setFinancialContext, sendMessage, clearConversation, isSending, error, mode]);
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatState {
  const value = useContext(ChatContext);
  if (!value) throw new Error("useChat must be used inside ChatProvider");
  return value;
}
