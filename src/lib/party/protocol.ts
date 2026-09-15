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
  /** Spojeni preglednici (jedan gost može imati više tabova) i njihov način razgovora */
  peers: Peer[];
  /** Broj završenih zdravica u sobi (1 = prva je gotova) */
  round: number;
  /** Domaćin bira u kojoj se zdravici otkriva slika slavlja (samo u toj jednoj) */
  photoRound: number;
  /** YouTube glazba: što svira i red pjesama */
  music: MusicState;
  /** Vrijeme servera (ms) u trenutku slanja — za usklađivanje glazbe s lokalnim satom */
  serverTime: number;
};

export type MusicTrack = {
  /** jedinstven unutar sobe */
  id: string;
  videoId: string;
  title: string;
  addedBy: string;
};

export type MusicState = {
  current: {
    track: MusicTrack;
    /** ms (vrijeme servera) kad bi pjesma bila na 0:00 — dok svira */
    startedAt: number | null;
    /** sekunde na kojima je pauzirano — dok je pauzirano */
    pausedAt: number | null;
  } | null;
  queue: MusicTrack[];
};

export type MusicAction =
  /** svi: dodaj pjesmu u red (YouTube link) */
  | { action: "add"; url: string }
  /** domaćin: pusti odmah pjesmu iz reda */
  | { action: "play"; trackId: string }
  | { action: "pause" }
  | { action: "resume" }
  | { action: "skip" }
  /** domaćin ili tko je dodao: makni iz reda */
  | { action: "remove"; trackId: string }
  /** bilo koji preglednik: pjesma je završila (server prelazi na sljedeću samo jednom) */
  | { action: "ended"; trackId: string };

export type Peer = {
  /** id konekcije (PartySocket id) — adresa za WebRTC signalizaciju */
  id: string;
  guestId: string;
  /** koristi mikrofon (inače samo tipka, ali i dalje sluša) */
  mic: boolean;
  muted: boolean;
};

/** Tekst poruka koja se prikaže u oblačiću iznad lika */
export type ChatMessage = { type: "chat"; guestId: string; text: string };

/** WebRTC signalizacija (SDP opis ili ICE kandidat), prosljeđuje se samo adresatu */
export type SignalData = {
  description?: { type: string; sdp?: string };
  candidate?: { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null; usernameFragment?: string | null } | null;
};
export type SignalMessage = { type: "signal"; from: string; data: SignalData };

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

/** Samo pošiljatelju: pjesmu nije moguće dodati */
export type MusicError = { type: "music-error"; message: string };

export type ServerMessage = LiveSnapshot | GlassMoved | Clink | Kicked | ChatMessage | SignalMessage | MusicError;

// ---------- preglednik -> server ----------

export type ClientMessage =
  | { type: "ready"; ready: boolean }
  | { type: "glass"; position: GlassPosition | null }
  /** Samo domaćin: nova runda nazdravljanja */
  | { type: "reset" }
  | { type: "chat"; text: string }
  /** Samo domaćin: nakon koje zdravice se otkriva slika */
  | { type: "settings"; photoRound: number }
  | { type: "voice"; mic: boolean; muted: boolean }
  | ({ type: "music" } & MusicAction)
  | { type: "signal"; to: string; data: SignalData };

// ---------- Next.js -> server (HTTP, potpisano tajnom) ----------

export type RoomUpdate = { type: "room"; state: RoomState };

/** Čaše se ne mogu odvući izvan ploče stola */
export const MAX_GLASS_RADIUS = 1.6;

/** Najviše pjesama u redu */
export const MUSIC_QUEUE_LIMIT = 30;
/** Isti gost može dodati pjesmu najviše jednom u ovoliko ms */
export const MUSIC_ADD_INTERVAL_MS = 3000;

/** Najveći izbor za "sliku nakon N. zdravice" */
export const MAX_PHOTO_ROUND = 20;

/** Najdulja poruka u oblačiću — 2–3 kratka retka na mobitelu, čitljivo preko stola */
export const CHAT_MAX_LENGTH = 80;
/** Najmanji razmak između dvije poruke istog gosta (ms) */
export const CHAT_MIN_INTERVAL_MS = 1000;

/** Očisti poruku: bez kontrolnih znakova, sažeti razmaci, najviše CHAT_MAX_LENGTH znakova */
export function sanitizeChat(input: unknown): string {
  if (typeof input !== "string") return "";
  // Prvo razmaci (i novi redovi) u jedan razmak, zatim ukloni preostale kontrolne znakove
  const clean = input.replace(/\s+/g, " ").replace(/[\p{C}]/gu, "").trim();
  return Array.from(clean).slice(0, CHAT_MAX_LENGTH).join("");
}
