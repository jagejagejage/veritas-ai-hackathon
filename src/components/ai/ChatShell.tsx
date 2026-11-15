"use client";

import type { ReactNode } from "react";
import { ChatProvider } from "./ChatProvider";
import { FloatingAssistant } from "./FloatingAssistant";

export function ChatShell({ children, mode }: { children: ReactNode; mode: "mock" | "live" | "invalid" }) {
  return <ChatProvider mode={mode}>{children}<FloatingAssistant/></ChatProvider>;
}
