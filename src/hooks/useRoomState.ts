"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, roomApi } from "@/lib/roomApi";
import type { GuestSession, RoomState } from "@/lib/rooms/types";

// Privremeno (Faza 3) — u Fazi 4 polling zamjenjuje PartyKit
const POLL_INTERVAL_MS = 3000;

export function useRoomState(code: string, session: GuestSession) {
  const [data, setData] = useState<{ state: RoomState; meId: string } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  // Svaka promjena (npr. odabir pića) povećava verziju; odgovori pollanja
  // koji su krenuli prije promjene se odbacuju da UI ne "trepne" natrag.
  const version = useRef(0);

  const load = useCallback(async () => {
    const startedAt = version.current;
    try {
      const result = await roomApi.state(code, session);
      if (startedAt !== version.current) return;
      setData(result);
      setError(null);
    } catch (err) {
      if (startedAt !== version.current) return;
      setError(err instanceof ApiError ? err : new ApiError(0, "Nešto je pošlo po krivu."));
    }
  }, [code, session]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (document.visibilityState === "visible") await load();
      if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };

    void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  /** Lokalna promjena stanja odmah, prije nego server potvrdi */
  const mutate = useCallback((update: (state: RoomState) => RoomState) => {
    version.current += 1;
    setData((current) => (current ? { ...current, state: update(current.state) } : current));
  }, []);

  /** Nakon što server potvrdi promjenu: odbaci pollanja u letu i povuci svježe stanje */
  const settle = useCallback(() => {
    version.current += 1;
    return load();
  }, [load]);

  return { data, error, mutate, settle };
}
