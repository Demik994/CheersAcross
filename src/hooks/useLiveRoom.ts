"use client";

import usePartySocket from "partysocket/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, roomApi } from "@/lib/roomApi";
import { PARTY_NAME, type ClientMessage, type GlassPosition, type ServerMessage, type ToastPhase } from "@/lib/party/protocol";
import type { GuestSession } from "@/lib/rooms/types";
import { clearSession } from "@/lib/session";
import { useRoomState } from "./useRoomState";

/** Dok real-time veza radi, REST je samo sigurnosna mreža */
const SAFETY_POLL_MS = 30_000;
const TICKET_RETRY_MS = 5_000;

export type LiveInfo = {
  online: ReadonlySet<string>;
  ready: ReadonlySet<string>;
  phase: ToastPhase;
};

/** Zadnje poznate pozicije tuđih čaša; 3D scena ih čita svaki frame (bez re-rendera) */
export type GlassTargets = Map<string, GlassPosition | null>;

export function useLiveRoom(code: string, session: GuestSession) {
  const room = useRoomState(code, session, SAFETY_POLL_MS);
  const { apply, refresh } = room;

  const [live, setLive] = useState<LiveInfo | null>(null);
  const [connected, setConnected] = useState(false);
  const [host, setHost] = useState<string | null>(null);
  const glassTargets = useRef<GlassTargets>(new Map());
  const firstTicket = useRef<string | null>(null);

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
        case "sync":
          if (message.room) apply(message.room);
          setLive({ online: new Set(message.online), ready: new Set(message.ready), phase: message.phase });
          return;
        case "glass":
          glassTargets.current.set(message.guestId, message.position);
          return;
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

  return { ...room, live, connected, glassTargets, setReady, moveGlass };
}
