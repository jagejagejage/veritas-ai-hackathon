"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, Sparkles } from "lucide-react";
import { ChatInterface } from "./ChatInterface";

export function FloatingAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previouslyOpen = useRef(false);
  useEffect(() => {
    if (pathname === "/ai" && open) setOpen(false);
    if (open) panelRef.current?.focus();
    else if (previouslyOpen.current && pathname !== "/ai") triggerRef.current?.focus();
    previouslyOpen.current = open;
  }, [open, pathname]);
  if (pathname === "/ai" || pathname === "/how-it-works") return null;

  return <div className="fixed bottom-[calc(16px+env(safe-area-inset-bottom))] right-3 z-40 flex flex-col items-end gap-3 sm:bottom-5 sm:right-5">
    {open && <div ref={panelRef} tabIndex={-1} className="floating-chat-panel overflow-hidden rounded-2xl border border-[#dce8e3] bg-white shadow-[0_22px_70px_rgba(20,61,55,.22)] animate-chat-open" aria-label="Floating CashSense AI panel"><ChatInterface compact onClose={() => setOpen(false)}/></div>}
    <button ref={triggerRef} type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? "Minimize CashSense AI" : "Open CashSense AI assistant"} className="focus-ring flex min-h-12 items-center gap-2 rounded-full bg-[#174a49] px-4 text-[12px] font-semibold text-white shadow-[0_8px_24px_rgba(23,74,73,.28)] transition-colors hover:bg-[#105e56] active:scale-[.98] sm:min-h-14 sm:px-5 sm:text-[13px]">
      {open ? <MessageCircle size={17}/> : <Sparkles size={17} className="text-[#a7e2ce]"/>}<span>{open ? "Minimize assistant" : "Ask CashSense AI"}</span>
    </button>
  </div>;
}
