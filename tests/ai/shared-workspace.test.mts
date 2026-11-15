import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");

test("dashboard assistant and dedicated AI page share one provider and chat component", () => {
  const layout = read("../../src/app/layout.tsx");
  const shell = read("../../src/components/ai/ChatShell.tsx");
  const floating = read("../../src/components/ai/FloatingAssistant.tsx");
  const page = read("../../src/app/ai/page.tsx");
  const conversation = read("../../src/components/ai/ChatInterface.tsx");
  assert.match(layout, /<ChatShell mode=\{mode\}>\{children\}<\/ChatShell>/);
  assert.match(shell, /<ChatProvider mode=\{mode\}>\{children\}<FloatingAssistant\/><\/ChatProvider>/);
  assert.match(floating, /<ChatInterface compact/);
  assert.match(page, /<ChatInterface\/>/);
  assert.match(conversation, /useChat\(\)/);
});

test("clear confirmation, live API errors, and message timestamps have accessible UI output", () => {
  const conversation = read("../../src/components/ai/ChatInterface.tsx");
  assert.match(conversation, /role="alertdialog"/);
  assert.match(conversation, /role="alert"/);
  assert.match(conversation, /dateTime=\{message\.createdAt\}/);
});
