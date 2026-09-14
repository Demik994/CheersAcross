"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { PIN_LENGTH } from "@/lib/rooms/types";

export const inputClass =
  "h-12 w-full rounded-xl border border-white/15 bg-white/5 px-4 text-base text-foreground placeholder:text-foreground/35 outline-none focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/30";

export const primaryButtonClass =
  "h-12 w-full rounded-xl bg-amber-300 px-4 text-base font-semibold text-stone-900 active:bg-amber-200 disabled:opacity-60";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground/80">{label}</span>
      {children}
      {hint && <span className="text-xs text-foreground/50">{hint}</span>}
    </label>
  );
}

/** 6-znamenkasti PIN — na mobitelu otvara numeričku tipkovnicu */
export function PinInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & { value: string; onChange: (v: string) => void }) {
  const { value, onChange, ...rest } = props;
  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      pattern={`\\d{${PIN_LENGTH}}`}
      // bez maxLength: kod lijepljenja "12 34 56" native limit bi odrezao znamenke prije filtriranja
      placeholder="••••••"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))}
      className={`${inputClass} text-center font-mono text-xl tracking-[0.5em]`}
    />
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
      {message}
    </p>
  );
}
