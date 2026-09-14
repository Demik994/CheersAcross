"use client";

import usePartySocket from "partysocket/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, roomApi } from "@/lib/roomApi";
import { REVEAL_ALREADY_DONE } from "@/lib/party/geometry";
import {
  PARTY_NAME,
  type ClientMessage,
  type GlassPosition,
  type ServerMessage,
  type ToastPhase,
} from "@/lib/party/protocol";
import type { GuestSession } from "@/lib/rooms/types";
import { clearSession } from "@/lib/session";
import { playClink } from "@/lib/sound";
import { useRoomState } from "./useRoomState";

/** Dok real-time veza radi, REST je samo sigurnosna mreža */
const SAFETY_POLL_MS = 30_000;
const TICKET_RETRY_MS = 5_000;

export type LiveInfo = {
  online: ReadonlySet<string>;
  ready: ReadonlySet<string>;
  clinked: ReadonlySet<string>;
  phase: ToastPhase;
};

/** Zadnje poznate pozicije tuđih čaša; 3D scena ih čita svaki frame (bez re-rendera) */
export type GlassTargets = Map<string, GlassPosition | null>;

/** Kucanja koja scena još treba prikazati (iskrice); `time` je performance.now() */
export type ClinkEvent = { at: GlassPosition; time: number };

export function useLiveRoom(code: string, session: GuestSession) {
  const room = useRoomState(code, session, SAFETY_POLL_MS);
  const { apply, refresh } = room;

  const [live, setLive] = useState<LiveInfo | null>(null);
  const [connected, setConnected] = useState(false);
  const [host, setHost] = useState<string | null>(null);
  /** performance.now() trenutka kad je runda prešla u "revealed" (početak pijenja) */
  const [revealStartedAt, setRevealStartedAt] = useState<number | null>(null);
  const glassTargets = useRef<GlassTargets>(new Map());
  const clinkEvents = useRef<ClinkEvent[]>([]);
  const firstTicket = useRef<string | null>(null);
  const lastPhase = useRef<ToastPhase | null>(null);

  const handleAuthError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) clearSession(code);
    },
    [code],
  );

  // Prvi tiket nam ujedno kaže adresu real-time servera
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const fetchFirstTicket = async () => {
      try {
        const { ticket, host } = await roomApi.ticket(code, session);
        if (cancelled) return;
        firstTicket.current = ticket;
        setHost(host);
      } catch (err) {
        handleAuthError(err);
        if (!cancelled) timer = setTimeout(fetchFirstTicket, TICKET_RETRY_MS);
      }
    };
    void fetchFirstTicket();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code, session, handleAuthError]);

  const socket = usePartySocket({
    host: host ?? undefined,
    party: PARTY_NAME,
    room: code,
    enabled: host !== null,
    // Svako (ponovno) spajanje traži svjež tiket; prvi iskoristimo jednom
    query: async () => {
      const cached = firstTicket.current;
      if (cached) {
        firstTicket.current = null;
        return { ticket: cached };
      }
      try {
        return { ticket: (await roomApi.ticket(code, session)).ticket };
      } catch (err) {
        handleAuthError(err);
        throw err;
      }
    },
    onOpen: () => {
      setConnected(true);
      void refresh(); // uhvati promjene propuštene dok veza nije radila
    },
    onClose: () => setConnected(false),
    onMessage: (event: MessageEvent) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      switch (message.type) {
        case "sync": {
          if (message.room) apply(message.room);
          setLive({
            online: new Set(message.online),
            ready: new Set(message.ready),
            clinked: new Set(message.clinked),
            phase: message.phase,
          });

          const previous = lastPhase.current;
          lastPhase.current = message.phase;
          if (message.phase === "revealed" && previous !== "revealed") {
            // Animaciju pijenja gledamo samo ako smo bili prisutni za kucanje
            setRevealStartedAt(previous === "toasting" ? performance.now() : REVEAL_ALREADY_DONE);
          } else if (message.phase !== "revealed" && previous === "revealed") {
            setRevealStartedAt(null);
          }
          if (message.phase !== "toasting") glassTargets.current.clear();
          return;
        }
        case "glass":
          glassTargets.current.set(message.guestId, message.position);
          return;
        case "clink": {
          const involvesMe = message.a === session.guestId || message.b === session.guestId;
          playClink(involvesMe ? 1 : 0.6);
          if (involvesMe) navigator.vibrate?.(25);
          const now = performance.now();
          // stari događaji (npr. dok se scena još učitava) samo bi se gomilali
          clinkEvents.current = clinkEvents.current.filter((e) => now - e.time < 2000);
          clinkEvents.current.push({ at: message.at, time: now });
          return;
        }
        case "kicked":
          clearSession(code);
          return;
      }
    },
  });

  const send = useCallback(
    (message: ClientMessage) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    },
    [socket],
  );

  const setReady = useCallback((ready: boolean) => send({ type: "ready", ready }), [send]);
  const moveGlass = useCallback((position: GlassPosition | null) => send({ type: "glass", position }), [send]);
  const startNewRound = useCallback(() => send({ type: "reset" }), [send]);

  return {
    ...room,
    live,
    connected,
    glassTargets,
    clinkEvents,
    revealStartedAt,
    setReady,
    moveGlass,
    startNewRound,
  };
}
