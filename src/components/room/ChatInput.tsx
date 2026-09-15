"use client";

import { useState, type FormEvent } from "react";
import { CHAT_MAX_LENGTH, CHAT_MIN_INTERVAL_MS, sanitizeChat } from "@/lib/party/protocol";

/** Poruka koja se pojavi u oblačiću iznad mog lika */
export default function ChatInput({ onSend, disabled }: { onSend: (text: string) => void; disabled: boolean }) {
  const [text, setText] = useState("");
  const [coolingDown, setCoolingDown] = useState(false);
  // Broji znakove kako ih vidi korisnik (emoji = 1), isto kao server
  const length = Array.from(text).length;

  function submit(e: FormEvent) {
    e.preventDefault();
    const clean = sanitizeChat(text);
    if (!clean || coolingDown || disabled) return;
    onSend(clean);
    setText("");
    setCoolingDown(true);
    setTimeout(() => setCoolingDown(false), CHAT_MIN_INTERVAL_MS);
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <label className="relative flex-1">
        <span className="sr-only">Poruka</span>
        <input
          value={text}
          onChange={(e) => setText(Array.from(e.target.value).slice(0, CHAT_MAX_LENGTH).join(""))}
          placeholder="Napiši nešto za stol…"
          enterKeyHint="send"
          autoComplete="off"
          disabled={disabled}
          className="h-11 w-full rounded-xl border border-white/15 bg-white/5 pr-14 pl-3 text-base placeholder:text-foreground/35 outline-none focus:border-amber-300/70 disabled:opacity-50"
        />
        <span
          className={`pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[11px] tabular-nums ${
            length >= CHAT_MAX_LENGTH ? "text-amber-300" : "text-foreground/40"
          }`}
        >
          {length}/{CHAT_MAX_LENGTH}
        </span>
      </label>
      <button
        type="submit"
        aria-label="Pošalji poruku"
        disabled={disabled || coolingDown || length === 0}
        className="size-11 shrink-0 rounded-xl bg-amber-300 text-lg font-bold text-stone-900 active:bg-amber-200 disabled:opacity-40"
      >
        ➤
      </button>
    </form>
  );
}
