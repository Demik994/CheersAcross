import "server-only";
import { envNames, readEnv } from "@/lib/env";
import { getRoomStore } from "@/lib/rooms/store";
import { toRoomState } from "@/lib/rooms/service";
import { PARTY_NAME, type RoomUpdate } from "./protocol";
import { TICKET_TTL_MS, signTicket } from "./ticket";

const DEV_SECRET = "cheersacross-dev-secret"; // isto kao party/.dev.vars.example
const DEV_PORT = 1999;
const isProduction = process.env.NODE_ENV === "production";

function partySecret(): string {
  const secret = readEnv(...envNames.partySecret) ?? (isProduction ? undefined : DEV_SECRET);
  if (!secret) throw new Error("PARTY_SECRET nije postavljen.");
  return secret;
}

/** Adresa real-time servera s kojom Next.js razgovara (server -> server) */
function partyUrl(): string {
  const url = readEnv(...envNames.partyUrl) ?? (isProduction ? undefined : `http://127.0.0.1:${DEV_PORT}`);
  if (!url) throw new Error("PARTY_URL nije postavljen.");
  return url.replace(/\/$/, "");
}

/**
 * Host na koji se spaja preglednik. U razvoju ga izvodimo iz adrese stranice,
 * pa radi i kad se app otvori s mobitela na lokalnoj mreži (192.168.x.x:3000).
 */
export function partyPublicHost(request: Request): string {
  const publicHost = readEnv(...envNames.partyPublicHost);
  if (publicHost) return publicHost;
  if (isProduction) return new URL(partyUrl()).host;
  const hostname = new URL(request.url).hostname;
  return `${hostname}:${DEV_PORT}`;
}

export function issueTicket(roomCode: string, guestId: string) {
  return signTicket({ r: roomCode, g: guestId, exp: Date.now() + TICKET_TTL_MS }, partySecret());
}

/**
 * Pošalji aktualno stanje sobe real-time serveru, koji ga odmah proslijedi svim gostima.
 * "Best effort": ako real-time server ne radi, zahtjev gosta ipak uspijeva,
 * a preglednici se oslanjaju na povremeno osvježavanje.
 */
export async function publishRoomState(code: string): Promise<void> {
  try {
    const store = getRoomStore();
    const room = await store.getRoom(code);
    if (!room) return;
    const update: RoomUpdate = { type: "room", state: toRoomState(room, await store.getGuests(code)) };

    const res = await fetch(`${partyUrl()}/parties/${PARTY_NAME}/${code}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${partySecret()}` },
      body: JSON.stringify(update),
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
    if (!res.ok) console.warn(`Real-time server je odbio stanje sobe ${code}: ${res.status}`);
  } catch (err) {
    console.warn(`Real-time server nije dostupan (soba ${code})`, err instanceof Error ? err.message : err);
  }
}
