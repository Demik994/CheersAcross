"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, roomApi } from "@/lib/roomApi";
import type { GuestSession, RoomState } from "@/lib/rooms/types";

/**
 * Trajno stanje sobe (gosti, pića, slika) preko REST API-ja.
 * Promjene uživo stižu preko real-time servera (`apply`); REST je rezerva
 * za početno učitavanje, ponovno spajanje i rijetko sigurnosno osvježavanje.
 */
export function useRoomState(code: string, session: GuestSession, pollIntervalMs: number) {
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  // Svaka lokalna promjena (npr. odabir pića) povećava verziju; REST odgovori
  // koji su krenuli prije promjene se odbacuju da UI ne "trepne" natrag.
  const version = useRef(0);

  const load = useCallback(async () => {
    const startedAt = version.current;
    try {
      const result = await roomApi.state(code, session);
      if (startedAt !== version.current) return;
      setState(result.state);
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
      if (!cancelled) timer = setTimeout(tick, pollIntervalMs);
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
  }, [load, pollIntervalMs]);

  /** Lokalna promjena stanja odmah, prije nego server potvrdi */
  const mutate = useCallback((update: (state: RoomState) => RoomState) => {
    version.current += 1;
    setState((current) => (current ? update(current) : current));
  }, []);

  /** Stanje koje je gurnuo real-time server */
  const apply = useCallback((next: RoomState) => {
    version.current += 1;
    setState(next);
    setError(null);
  }, []);

  /** Odbaci REST zahtjeve u letu i povuci svježe stanje */
  const refresh = useCallback(() => {
    version.current += 1;
    return load();
  }, [load]);

  return { state, error, mutate, apply, refresh };
}
