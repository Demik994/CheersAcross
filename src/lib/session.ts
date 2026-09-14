"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { GuestSession } from "@/lib/rooms/types";

/**
 * Sesija gosta (guestId + tajni token) po sobi, u localStorage.
 * Ako localStorage nije dostupan (npr. privatni način na nekim preglednicima),
 * sesija živi u memoriji dok je stranica otvorena.
 */
const storageKey = (code: string) => `cheersacross:session:${code}`;
const memoryFallback = new Map<string, string>();
const listeners = new Set<() => void>();

function read(code: string): string | null {
  try {
    return window.localStorage.getItem(storageKey(code)) ?? memoryFallback.get(code) ?? null;
  } catch {
    return memoryFallback.get(code) ?? null;
  }
}

function emit() {
  listeners.forEach((l) => l());
}

export function saveSession(code: string, session: GuestSession) {
  const raw = JSON.stringify(session);
  memoryFallback.set(code, raw);
  try {
    window.localStorage.setItem(storageKey(code), raw);
  } catch {
    // ostaje samo memorijska kopija
  }
  emit();
}

export function clearSession(code: string) {
  memoryFallback.delete(code);
  try {
    window.localStorage.removeItem(storageKey(code));
  } catch {
    // nema što obrisati
  }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function parse(raw: string | null): GuestSession | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return typeof value?.guestId === "string" && typeof value?.token === "string" ? value : null;
  } catch {
    return null;
  }
}

/** `undefined` dok se ne zna (server render / hidracija), `null` ako gost nije u sobi */
export function useGuestSession(code: string): GuestSession | null | undefined {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(code),
    () => undefined,
  );
  return useMemo(() => (raw === undefined ? undefined : parse(raw)), [raw]);
}
