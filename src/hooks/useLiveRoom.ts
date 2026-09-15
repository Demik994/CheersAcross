"use client";

import usePartySocket from "partysocket/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, roomApi } from "@/lib/roomApi";
import { REVEAL_ALREADY_DONE } from "@/lib/party/geometry";
import {
  PARTY_NAME,
  type ClientMessage,
  type GlassPosition,
  type MusicAction,
  type MusicState,
  type Peer,
  type ServerMessage,
  type SignalData,
  type ToastPhase,
} from "@/lib/party/protocol";
import type { GuestSession } from "@/lib/rooms/types";
import { clearSession } from "@/lib/session";
import { playClink } from "@/lib/sound";
import { useRoomState } from "./useRoomState";

/** Dok real-time veza radi, REST je samo sigurnosna mreža */
const SAFETY_POLL_MS = 60_000;
const TICKET_RETRY_MS = 5_000;

export type LiveInfo = {
  online: ReadonlySet<string>;
  ready: ReadonlySet<string>;
  clinked: ReadonlySet<string>;
  phase: ToastPhase;
  /** Popijena standardna pića po gostu */
  intoxication: ReadonlyMap<string, number>;
  /** Tko povraća na kraju ove runde */
  vomiting: ReadonlySet<string>;
  /** Spojeni preglednici i tko koristi mikrofon */
  peers: readonly Peer[];
  /** Broj završenih zdravica */
  round: number;
  /** U kojoj se zdravici otkriva slika slavlja */
  photoRound: number;
  /** YouTube glazba */
  music: MusicState;
};

const NO_MUSIC: MusicState = { current: null, queue: [] };

/** Zadnja poruka svakog gosta koja se trenutno prikazuje u oblačiću */
export type ChatBubbles = ReadonlyMap<string, { text: string; id: number }>;

export type SignalHandler = (from: string, data: SignalData) => void;

/** Koliko dugo je oblačić vidljiv: 4 s + ~50 ms po znaku (80 znakova ≈ 8 s) */
export const bubbleDurationMs = (text: string) => 4000 + Array.from(text).length * 50;

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
  const [bubbles, setBubbles] = useState<ChatBubbles>(new Map());
  const bubbleCounter = useRef(0);
  /** Glasovni chat se ovdje "pretplati" na WebRTC signalizaciju */
  const signalHandler = useRef<SignalHandler | null>(null);
  /** vrijeme servera − lokalno vrijeme (ms); glazba iz ovoga računa poziciju pjesme */
  const serverOffset = useRef(0);
  const [musicError, setMusicError] = useState<{ message: string; id: number } | null>(null);

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
          if (typeof message.serverTime === "number") serverOffset.current = message.serverTime - Date.now();
          setLive({
            online: new Set(message.online),
            ready: new Set(message.ready),
            clinked: new Set(message.clinked),
            phase: message.phase,
            // `?? …`: stariji real-time server (prije deploya) ne šalje ova polja
            intoxication: new Map(Object.entries(message.intoxication ?? {})),
            vomiting: new Set(message.vomiting ?? []),
            peers: message.peers ?? [],
            round: message.round ?? 0,
            photoRound: message.photoRound ?? 1,
            music: message.music ?? NO_MUSIC,
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
        case "chat": {
          const id = ++bubbleCounter.current;
          const { guestId, text } = message;
          setBubbles((current) => new Map(current).set(guestId, { text, id }));
          // Ukloni oblačić nakon isteka — osim ako je u međuvremenu stigla nova poruka
          setTimeout(() => {
            setBubbles((current) => {
              if (current.get(guestId)?.id !== id) return current;
              const next = new Map(current);
              next.delete(guestId);
              return next;
            });
          }, bubbleDurationMs(text));
          return;
        }
        case "signal":
          signalHandler.current?.(message.from, message.data);
          return;
        case "music-error":
          setMusicError({ message: message.message, id: Date.now() });
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
  const startNewRound = useCallback(() => send({ type: "reset" }), [send]);
  const sendChat = useCallback((text: string) => send({ type: "chat", text }), [send]);
  const setPhotoRound = useCallback((photoRound: number) => send({ type: "settings", photoRound }), [send]);
  const sendMusic = useCallback((action: MusicAction) => send({ type: "music", ...action }), [send]);
  const clearMusicError = useCallback(() => setMusicError(null), []);
  const registerSignalHandler = useCallback((handler: SignalHandler | null) => {
    signalHandler.current = handler;
  }, []);

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
    sendChat,
    setPhotoRound,
    sendMusic,
    musicError,
    clearMusicError,
    serverOffset,
    bubbles,
    send,
    registerSignalHandler,
    /** id ove konekcije (isti kao na serveru) — adresa za WebRTC */
    connectionId: socket.id,
  };
}
