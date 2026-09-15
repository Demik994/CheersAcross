"use client";

import { useSyncExternalStore } from "react";

/** Postavke glazbe samo za ovaj uređaj: je li glazba uključena i u kojem je kutu video */
export type MusicPreference = { enabled: boolean; side: "left" | "right" };

const KEY = "cheersacross:music";
const DEFAULT: MusicPreference = { enabled: true, side: "right" };
const listeners = new Set<() => void>();
let cached: MusicPreference | null = null;

function read(): MusicPreference {
  if (cached) return cached;
  cached = DEFAULT;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "null");
    if (parsed && typeof parsed === "object") {
      cached = {
        enabled: parsed.enabled !== false,
        side: parsed.side === "left" ? "left" : "right",
      };
    }
  } catch {
    // privatni način ili neispravan zapis — zadane postavke
  }
  return cached;
}

export function saveMusicPreference(change: Partial<MusicPreference>) {
  cached = { ...read(), ...change };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    // ostaje samo u memoriji
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMusicPreference(): MusicPreference {
  return useSyncExternalStore(subscribe, read, () => DEFAULT);
}
