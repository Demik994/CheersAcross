/**
 * Protokol između preglednika, Next.js API-ja i real-time servera (PartyServer na Cloudflareu).
 * Datoteka nema ovisnosti pa je koriste i Next i Worker (party/).
 *
 * Podjela odgovornosti:
 * - Next.js + Redis: trajni podaci sobe (gosti, imena, pića, slika) — izvor istine
 * - PartyServer: "živo" stanje (tko je online, spremnost, čaše, kucanje, otkrivanje)
 */
// Relativni import (ne "@/…") jer ovu datoteku bundla i Wrangler za Worker
import type { RoomState } from "../rooms/types";

/** Ime "partyja" u URL-u: /parties/toast-room/:kod */
export const PARTY_NAME = "toast-room";

/**
 * lobby     — biranje pića, gosti klikću "Nazdravi!"
 * toasting  — svi su spremni; gosti vuku čaše i kucaju se
 * revealed  — svi su se kucnuli; pijenje, pa otkrivanje slike
 */
export type ToastPhase = "lobby" | "toasting" | "revealed";

/** Pozicija čaše u koordinatama stola (x, z), neovisno o tome odakle gost gleda */
export type GlassPosition = { x: number; z: number };

// ---------- server -> preglednik ----------

export type LiveSnapshot = {
  type: "sync";
  room: RoomState | null;
  online: string[];
  ready: string[];
  /** Gosti koji su se u ovoj rundi kucnuli barem s jednim drugim */
  clinked: string[];
  phase: ToastPhase;
  /** Popijena standardna pića po gostu (ne pada s vremenom, samo limunadom) */
  intoxication: Record<string, number>;
  /** Tko povraća na kraju ove runde (prazno dok runda nije gotova) */
  vomiting: string[];
};

export type GlassMoved = {
  type: "glass";
  guestId: string;
  /** null = čaša se vraća na mjesto gosta */
  position: GlassPosition | null;
};

/** Dvije čaše su se kucnule (a === b kad je gost sam i kucne u sredinu stola) */
export type Clink = {
  type: "clink";
  a: string;
  b: string;
  at: GlassPosition;
};

export type Kicked = { type: "kicked" };

export type ServerMessage = LiveSnapshot | GlassMoved | Clink | Kicked;

// ---------- preglednik -> server ----------

export type ClientMessage =
  | { type: "ready"; ready: boolean }
  | { type: "glass"; position: GlassPosition | null }
  /** Samo domaćin: nova runda nazdravljanja */
  | { type: "reset" };

// ---------- Next.js -> server (HTTP, potpisano tajnom) ----------

export type RoomUpdate = { type: "room"; state: RoomState };

/** Čaše se ne mogu odvući izvan ploče stola */
export const MAX_GLASS_RADIUS = 1.6;
