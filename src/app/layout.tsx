import type { Metadata } from "next";
import { ChatShell } from "@/components/ai/ChatShell";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CashSense — Understand your cash flow",
  description: "See what’s changing, explore what could happen, and plan your next move.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const configuredMode = process.env.CASHSENSE_AI_MODE;
  const mode = configuredMode === undefined || configuredMode === "mock"
    ? "mock"
    : configuredMode === "live"
      ? process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_MODEL ? "live" : "invalid"
      : "invalid";
  return <html lang="en"><body><ChatShell mode={mode}>{children}</ChatShell></body></html>;
}
