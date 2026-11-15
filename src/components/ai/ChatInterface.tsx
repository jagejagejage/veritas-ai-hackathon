"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowUp, Bot, Check, CircleAlert, Clock3, CornerDownLeft, FileQuestion, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useChat } from "./ChatProvider";

const SUGGESTIONS = [
  { label: "Why is cash flow changing?", prompt: "Why is my cash flow changing week to week?", icon: Clock3 },
  { label: "What if sales fall 20%?", prompt: "What happens if sales fall 20%?", icon: Sparkles },
  { label: "My biggest expense", prompt: "What is my biggest expense?", icon: FileQuestion },
  { label: "How can I reduce risk?", prompt: "How can I reduce my financial risk?", icon: CircleAlert },
];

function timeLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function ChatInterface({ compact = false, onClose }: { compact?: boolean; onClose?: () => void }) {
  const { messages, context, sendMessage, clearConversation, isSending, error, mode } = useChat();
  const [draft, setDraft] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isSending, error]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isSending) return;
    setDraft("");
    void sendMessage(message);
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      textareaRef.current?.form?.requestSubmit();
    }
  }

  function confirmAndClear() {
    clearConversation();
    setDraft("");
    setConfirmClear(false);
    textareaRef.current?.focus();
  }

  const sourceLabel = context ? context.source === "demo" ? "Illustrative demo data" : "Imported cash-flow data" : "No dashboard data yet";

  return <section onKeyDown={(event) => { if (compact && event.key === "Escape") onClose?.(); }} className={`flex min-h-0 flex-col overflow-hidden bg-white ${compact ? "h-full" : "min-h-[640px] rounded-2xl border border-[#dfe9e6] shadow-[0_12px_36px_rgba(29,68,62,.07)]"}`} aria-label="CashSense AI conversation">
    <header className="flex shrink-0 items-center gap-3 border-b border-[#e7eeeb] px-4 py-3 sm:px-5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#174a49] text-[#a7e2ce]"><Sparkles size={17} aria-hidden="true"/></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-[14px] font-semibold text-[#1c3a3d]">CashSense AI</h2><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${mode === "mock" ? "bg-[#fbf2e3] text-[#91652e]" : mode === "live" ? "bg-[#e7f4ee] text-[#327967]" : "bg-[#fff0eb] text-[#a6543d]"}`}>{mode === "mock" ? "Example mode" : mode === "live" ? "Claude · secure" : "Setup needed"}</span></div>
        <p className="mt-0.5 truncate text-[11px] text-[#829296]">{sourceLabel} · answers grounded in your cash-flow view</p>
      </div>
      {!compact && <button type="button" onClick={() => setConfirmClear(true)} disabled={isSending} className="focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium text-[#718487] hover:bg-[#f2f7f5] disabled:cursor-not-allowed disabled:opacity-50" aria-label="Clear conversation"><Trash2 size={14}/> <span className="hidden sm:inline">Clear chat</span></button>}
      {compact && <div className="flex items-center gap-1">
        <button type="button" onClick={() => setConfirmClear(true)} disabled={isSending} className="focus-ring flex h-11 w-11 items-center justify-center rounded-lg text-[#74878a] hover:bg-[#f2f7f5] disabled:cursor-not-allowed disabled:opacity-50" aria-label="Clear conversation"><Trash2 size={15}/></button>
        {onClose && <button type="button" onClick={onClose} className="focus-ring flex h-11 w-11 items-center justify-center rounded-lg text-[#74878a] hover:bg-[#f2f7f5]" aria-label="Minimize CashSense AI"><X size={16}/></button>}
      </div>}
    </header>

    <div ref={transcriptRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6" role="log" aria-label="Conversation messages" aria-live="polite" aria-relevant="additions text">
      {messages.length === 0 ? <div className={`mx-auto flex h-full max-w-[640px] flex-col justify-center ${compact ? "py-4" : "py-5"}`}>
        <div className="mb-5 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f3ef] text-[#24776b]"><Bot size={19}/></span><div><p className="text-[13px] font-semibold text-[#28484a]">A clearer way to think through cash flow.</p><p className="mt-1 text-[12px] leading-5 text-[#75878a]">Ask a question. I’ll use the numbers on your dashboard and explain what they can and can’t tell you.</p></div></div>
        <p className="mb-2 text-[11px] font-semibold text-[#718487]">Try asking</p>
        <div className="grid gap-2 sm:grid-cols-2">{SUGGESTIONS.map(({ label, prompt, icon: Icon }) => <button key={label} type="button" onClick={() => void sendMessage(prompt)} disabled={isSending} className="focus-ring flex min-h-11 items-center gap-2 rounded-xl border border-[#e3ebe8] bg-[#fbfdfc] px-3 py-2.5 text-left text-[12px] text-[#446368] transition-colors hover:border-[#b9d6ca] hover:bg-[#f3f8f5] disabled:opacity-50"><Icon size={14} className="shrink-0 text-[#398679]"/><span className="min-w-0">{label}</span><Plus size={13} className="ml-auto shrink-0 text-[#90a29f]"/></button>)}</div>
        {mode === "mock" && <p className="mt-4 rounded-lg bg-[#fcf7ec] px-3 py-2 text-[10px] leading-4 text-[#8b6a39]">Mock mode is on. Replies are local examples; no Anthropic request is made.</p>}
      </div> : <div className="mx-auto flex max-w-[720px] flex-col gap-5">
        {messages.map((message) => <article key={message.id} className={`flex gap-2.5 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
          {message.role === "assistant" && <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#e8f3ef] text-[#26786e]"><Bot size={15}/></span>}
          <div className={`min-w-0 max-w-[88%] sm:max-w-[82%] ${message.role === "user" ? "rounded-2xl rounded-br-md bg-[#174a49] px-4 py-3 text-white" : "rounded-2xl rounded-bl-md border border-[#e7eeeb] bg-[#f8fbf9] px-4 py-3 text-[#365456]"}`}>
            {message.role === "assistant" && message.mock && <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[.08em] text-[#986a31]">Example · Mock mode</p>}
            <p className="whitespace-pre-wrap break-words text-[13px] leading-[1.7]">{message.content}</p>
            <time dateTime={message.createdAt} className={`mt-2 block text-[10px] ${message.role === "user" ? "text-white/65" : "text-[#91a09e]"}`}>{timeLabel(message.createdAt)}</time>
          </div>
        </article>)}
        {isSending && <div className="flex items-start gap-2.5" aria-label="CashSense AI is preparing a response"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#e8f3ef] text-[#26786e]"><Bot size={15}/></span><div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-[#e7eeeb] bg-[#f8fbf9] px-4 py-3"><span className="typing-dot"/><span className="typing-dot delay-1"/><span className="typing-dot delay-2"/><span className="ml-1 text-[11px] text-[#7d908e]">Thinking</span></div></div>}
        {error && <div className="ml-9 rounded-xl border border-[#efd4c9] bg-[#fff8f5] p-3 text-[12px] text-[#92593e]" role="alert"><p className="font-semibold">Message not sent</p><p className="mt-1 leading-5">{error}</p></div>}
        <div aria-hidden="true" className="h-1"/>
      </div>}
    </div>

    {messages.length > 0 && !isSending && <div className="shrink-0 px-4 pb-2 sm:px-6"><div className="mx-auto flex max-w-[720px] flex-wrap gap-2">{SUGGESTIONS.slice(0, 2).map(({ label, prompt }) => <button type="button" key={label} onClick={() => void sendMessage(prompt)} className="focus-ring min-h-11 rounded-full border border-[#e4ece8] px-3 text-[10px] text-[#647d7d] hover:bg-[#f5f9f7]">{label}</button>)}</div></div>}
    <form onSubmit={onSubmit} className="shrink-0 border-t border-[#e7eeeb] bg-white px-3 py-3 sm:px-5">
      <div className="mx-auto flex max-w-[720px] items-end gap-2 rounded-xl border border-[#dce8e3] bg-[#fbfdfc] p-2 shadow-[0_2px_6px_rgba(32,71,62,.03)] focus-within:border-[#80b7a8] focus-within:ring-2 focus-within:ring-[#d7eee5]">
        <label className="sr-only" htmlFor={compact ? "compact-ai-message" : "ai-message"}>Ask CashSense AI</label>
        <textarea ref={textareaRef} id={compact ? "compact-ai-message" : "ai-message"} name="message" autoComplete="off" rows={1} value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 1800))} onKeyDown={onComposerKeyDown} placeholder="Ask about your cash flow…" className="max-h-32 min-h-10 flex-1 resize-y bg-transparent px-2 py-2 text-[13px] leading-5 text-[#284748] outline-none placeholder:text-[#9aa9a7]" aria-describedby={compact ? "compact-ai-hint" : "ai-hint"} disabled={isSending}/>
        <button type="submit" disabled={!draft.trim() || isSending} className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#176f65] text-white transition-colors hover:bg-[#105e56] disabled:cursor-not-allowed disabled:bg-[#d8e4df] disabled:text-[#94a49f]" aria-label="Send message"><ArrowUp size={17}/></button>
      </div>
      <div id={compact ? "compact-ai-hint" : "ai-hint"} className="mx-auto mt-1.5 flex max-w-[720px] items-center justify-between px-1 text-[10px] text-[#91a09e]"><span>Enter to send · Shift + Enter for a new line</span>{!compact && <span className="hidden items-center gap-1 sm:flex"><CornerDownLeft size={11}/> Your chat stays in this browser tab</span>}</div>
      {compact && <Link href="/ai" className="focus-ring mx-auto mt-2 flex w-fit min-h-9 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold text-[#32796c] hover:bg-[#f1f7f4]">Open full CashSense AI <span aria-hidden="true">↗</span></Link>}
    </form>

    {confirmClear && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#193533]/25 p-4" onKeyDown={(event) => { if (event.key === "Escape") setConfirmClear(false); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="clear-title" aria-describedby="clear-description" className="w-full max-w-sm rounded-2xl border border-[#dfe9e6] bg-white p-5 shadow-xl">
        <div className="flex items-start gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fbf3e6] text-[#a06e33]"><Trash2 size={16}/></span><div className="flex-1"><h3 id="clear-title" className="text-[14px] font-semibold text-[#284748]">Clear this conversation?</h3><p id="clear-description" className="mt-1 text-[12px] leading-5 text-[#718487]">This removes the messages from the current browser session.</p></div><button type="button" onClick={() => setConfirmClear(false)} className="focus-ring flex h-9 w-9 items-center justify-center rounded-lg text-[#75888a] hover:bg-[#f3f7f5]" aria-label="Cancel clearing conversation"><X size={15}/></button></div>
        <div className="mt-5 flex justify-end gap-2"><button type="button" autoFocus onClick={() => setConfirmClear(false)} className="focus-ring min-h-10 rounded-lg border border-[#dfe9e6] px-3 text-[12px] font-medium text-[#536e70] hover:bg-[#f7faf8]">Keep chat</button><button type="button" onClick={confirmAndClear} className="focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[#a8533f] px-3 text-[12px] font-semibold text-white hover:bg-[#914331]"><Check size={14}/>Clear chat</button></div>
      </div>
    </div>}
  </section>;
}
