"use client";

import { useSyncExternalStore } from "react";

/**
 * Način razgovora po sobi, zapamćen na ovom uređaju:
 * "mic" = otvoren mikrofon cijelo vrijeme, "text" = samo tipkanje (ali i dalje sluša druge).
 */
export type VoiceMode = "mic" | "text";

const key = (code: string) => `cheersacross:voice:${code}`;
const memory = new Map<string, VoiceMode>();
const listeners = new Set<() => void>();

function read(code: string): VoiceMode | null {
  try {
    const value = window.localStorage.getItem(key(code));
    if (value === "mic" || value === "text") return value;
  } catch {
    // privatni način — samo memorija
  }
  return memory.get(code) ?? null;
}

export function saveVoiceMode(code: string, mode: VoiceMode) {
  memory.set(code, mode);
  try {
    window.localStorage.setItem(key(code), mode);
  } catch {
    // ostaje samo u memoriji
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** `undefined` tijekom hidracije, `null` dok gost nije odabrao */
export function useVoiceMode(code: string): VoiceMode | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => read(code),
    () => undefined,
  );
}
