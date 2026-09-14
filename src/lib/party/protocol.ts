/**
 * Protokol između preglednika, Next.js API-ja i real-time servera (PartyServer na Cloudflareu).
 * Datoteka nema ovisnosti pa je koriste i Next i Worker (party/).
 *
 * Podjela odgovornosti:
 * - Next.js + Redis: trajni podaci sobe (gosti, imena, pića, slika) — izvor istine
 * - PartyServer: "živo" stanje (tko je online, tko je spreman, pomicanje čaša)
 */
// Relativni import (ne "@/…") jer ovu datoteku bundla i Wrangler za Worker
import type { RoomState } from "../rooms/types";

/** Ime "partyja" u URL-u: /parties/toast-room/:kod */
export const PARTY_NAME = "toast-room";

export type ToastPhase = "lobby" | "toasting";

/** Pozicija čaše u koordinatama stola (x, z), neovisno o tome odakle gost gleda */
export type GlassPosition = { x: number; z: number };

// ---------- server -> preglednik ----------

export type LiveSnapshot = {
  type: "sync";
  room: RoomState | null;
  online: string[];
  ready: string[];
  phase: ToastPhase;
};

export type GlassMoved = {
  type: "glass";
  guestId: string;
  /** null = čaša se vraća na mjesto gosta */
  position: GlassPosition | null;
};

export type Kicked = { type: "kicked" };

export type ServerMessage = LiveSnapshot | GlassMoved | Kicked;

// ---------- preglednik -> server ----------

export type ClientMessage =
  | { type: "ready"; ready: boolean }
  | { type: "glass"; position: GlassPosition | null };

// ---------- Next.js -> server (HTTP, potpisano tajnom) ----------

export type RoomUpdate = { type: "room"; state: RoomState };

/** Čaše se ne mogu odvući izvan ploče stola */
export const MAX_GLASS_RADIUS = 1.6;
