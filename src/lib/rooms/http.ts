import "server-only";
import { normalizeRoomCode } from "./codes";
import { RoomError } from "./service";
import { StoreNotConfiguredError } from "./store";
import type { GuestSession } from "./types";

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

/** Zajednički omotač za route handlere: pretvara RoomError u JSON odgovor */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof RoomError) return jsonError(err.message, err.status);
    if (err instanceof StoreNotConfiguredError) return jsonError("Server nije konfiguriran.", 503);
    console.error(err);
    return jsonError("Nešto je pošlo po krivu. Pokušaj ponovno.", 500);
  }
}

export function parseCode(raw: string): string {
  const code = normalizeRoomCode(raw);
  if (!code) throw new RoomError(404, "Soba ne postoji ili je istekla.");
  return code;
}

/** Sesija gosta dolazi kao `Authorization: Bearer <guestId>.<token>` */
export function readSession(request: Request): GuestSession | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([0-9a-f-]{36})\.([A-Za-z0-9_-]{20,})$/.exec(header);
  return match ? { guestId: match[1], token: match[2] } : null;
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    throw new RoomError(400, "Neispravan zahtjev.");
  }
}
