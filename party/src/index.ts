import { routePartykitRequest, Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import {
  MAX_GLASS_RADIUS,
  PARTY_NAME,
  type ClientMessage,
  type GlassPosition,
  type LiveSnapshot,
  type RoomUpdate,
  type ServerMessage,
  type ToastPhase,
} from "../../src/lib/party/protocol";
import { verifyTicket } from "../../src/lib/party/ticket";
import type { RoomState } from "../../src/lib/rooms/types";

type ConnectionState = { guestId: string };
type GuestConnection = Connection<ConnectionState>;

const GUEST_HEADER = "x-cheers-guest-id";
const MAX_MESSAGE_BYTES = 2048;

/**
 * Jedna soba = jedan Durable Object. Drži "živo" stanje sobe:
 * tko je spojen, tko je kliknuo "Nazdravi" i gdje su čaše koje se vuku.
 * Trajne podatke (gosti, pića, slika) šalje Next.js nakon svake promjene.
 *
 * Hibernacija: kad nitko ništa ne šalje, objekt se uspava i ne troši kvotu.
 * Zato je sve što mora preživjeti buđenje u storageu, a id gosta u stanju konekcije.
 */
export class ToastRoom extends Server<Env> {
  static options = { hibernate: true };

  private room: RoomState | null = null;
  private ready = new Set<string>();
  private phase: ToastPhase = "lobby";

  async onStart() {
    const stored = await this.ctx.storage.get<unknown>(["room", "ready", "phase"]);
    this.room = (stored.get("room") as RoomState | undefined) ?? null;
    this.ready = new Set((stored.get("ready") as string[] | undefined) ?? []);
    this.phase = (stored.get("phase") as ToastPhase | undefined) ?? "lobby";
  }

  getConnectionTags(_connection: Connection, ctx: ConnectionContext) {
    const guestId = ctx.request.headers.get(GUEST_HEADER);
    return guestId ? [guestId] : [];
  }

  onConnect(connection: GuestConnection, ctx: ConnectionContext) {
    const guestId = ctx.request.headers.get(GUEST_HEADER);
    if (!guestId) {
      connection.close(4001, "unauthorized");
      return;
    }
    // Gost koji je u međuvremenu uklonjen iz sobe (stari tiket još vrijedi)
    if (this.room && !this.room.guests.some((g) => g.id === guestId)) {
      this.send(connection, { type: "kicked" });
      connection.close(4003, "not a guest");
      return;
    }
    connection.setState({ guestId });
    this.broadcastSnapshot();
  }

  async onMessage(connection: GuestConnection, raw: WSMessage) {
    const guestId = connection.state?.guestId;
    if (!guestId || typeof raw !== "string" || raw.length > MAX_MESSAGE_BYTES) return;

    let message: ClientMessage;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    switch (message.type) {
      case "ready": {
        if (this.phase !== "lobby") return;
        if (message.ready) this.ready.add(guestId);
        else this.ready.delete(guestId);
        this.updatePhase();
        await this.persist();
        this.broadcastSnapshot();
        return;
      }
      case "glass": {
        if (this.phase !== "toasting") return;
        const position = sanitizePosition(message.position);
        this.broadcastMessage({ type: "glass", guestId, position }, [connection.id]);
        return;
      }
    }
  }

  onClose(connection: GuestConnection) {
    const guestId = connection.state?.guestId;
    if (!guestId) return;
    // Ako je gost vukao čašu kad mu je pukla veza, vrati je na mjesto kod ostalih
    if (!this.onlineGuestIds(connection.id).has(guestId)) {
      this.broadcastMessage({ type: "glass", guestId, position: null }, [connection.id]);
    }
    this.broadcastSnapshot(connection.id);
  }

  /** Next.js javlja promjenu trajnog stanja sobe (ulazak, izlazak, piće, slika…) */
  async onRequest(request: Request) {
    if (request.method !== "POST" || !(await isAuthorizedServer(request, this.env.PARTY_SECRET))) {
      return new Response("Unauthorized", { status: 401 });
    }

    let update: RoomUpdate;
    try {
      update = await request.json();
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    if (update.type !== "room" || update.state?.code !== this.name) {
      return new Response("Bad request", { status: 400 });
    }

    this.room = update.state;
    const guestIds = new Set(this.room.guests.map((g) => g.id));

    // Uklonjeni gosti: makni im spremnost i zatvori im konekcije
    this.ready = new Set([...this.ready].filter((id) => guestIds.has(id)));
    for (const connection of this.getConnections<ConnectionState>()) {
      const id = connection.state?.guestId;
      if (id && !guestIds.has(id)) {
        this.send(connection, { type: "kicked" });
        connection.close(4003, "removed from room");
      }
    }

    this.updatePhase();
    await this.persist();
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(this.room.expiresAt);
    }
    this.broadcastSnapshot();
    return new Response(null, { status: 204 });
  }

  /** Soba je istekla (24 h) — obriši sve */
  async onAlarm() {
    for (const connection of this.getConnections()) connection.close(4004, "room expired");
    await this.ctx.storage.deleteAll();
    this.room = null;
    this.ready.clear();
    this.phase = "lobby";
  }

  // ---------- pomoćne ----------

  private updatePhase() {
    const guests = this.room?.guests ?? [];
    if (guests.length === 0) {
      this.phase = "lobby";
      this.ready.clear();
      return;
    }
    // Čekamo i goste koji su trenutno offline — nazdravlja se tek kad su SVI spremni
    if (this.phase === "lobby" && guests.every((g) => this.ready.has(g.id))) {
      this.phase = "toasting";
    }
  }

  private persist() {
    return this.ctx.storage.put({ room: this.room, ready: [...this.ready], phase: this.phase });
  }

  private onlineGuestIds(excludeConnectionId?: string) {
    const online = new Set<string>();
    for (const connection of this.getConnections<ConnectionState>()) {
      if (connection.id === excludeConnectionId) continue;
      const id = connection.state?.guestId;
      if (id) online.add(id);
    }
    return online;
  }

  private broadcastSnapshot(excludeConnectionId?: string) {
    const snapshot: LiveSnapshot = {
      type: "sync",
      room: this.room,
      online: [...this.onlineGuestIds(excludeConnectionId)],
      ready: [...this.ready],
      phase: this.phase,
    };
    this.broadcastMessage(snapshot);
  }

  private broadcastMessage(message: ServerMessage, without?: string[]) {
    this.broadcast(JSON.stringify(message), without);
  }

  private send(connection: Connection, message: ServerMessage) {
    connection.send(JSON.stringify(message));
  }
}

function sanitizePosition(position: unknown): GlassPosition | null {
  if (!position || typeof position !== "object") return null;
  const { x, z } = position as Record<string, unknown>;
  if (typeof x !== "number" || typeof z !== "number" || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  const radius = Math.hypot(x, z);
  const scale = radius > MAX_GLASS_RADIUS ? MAX_GLASS_RADIUS / radius : 1;
  return { x: round(x * scale), z: round(z * scale) };
}

const round = (value: number) => Math.round(value * 1000) / 1000;

async function isAuthorizedServer(request: Request, secret: string | undefined) {
  if (!secret) return false;
  const provided = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const encoder = new TextEncoder();
  const a = encoder.encode(provided);
  const b = encoder.encode(expected);
  return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await routePartykitRequest(request, env, {
      // Preglednik se spaja samo s valjanim tiketom koji je izdao Next.js
      onBeforeConnect: async (req, lobby) => {
        if (lobby.party !== PARTY_NAME || !env.PARTY_SECRET) {
          return new Response("Unauthorized", { status: 401 });
        }
        const ticket = new URL(req.url).searchParams.get("ticket");
        const payload = ticket ? await verifyTicket(ticket, env.PARTY_SECRET) : null;
        if (!payload || payload.r !== lobby.name) {
          return new Response("Unauthorized", { status: 401 });
        }
        const headers = new Headers(req.headers);
        headers.set(GUEST_HEADER, payload.g);
        return new Request(req, { headers });
      },
      // Za HTTP zahtjeve (Next.js -> server) ne vjerujemo lažnom headeru gosta
      onBeforeRequest: (req) => {
        const headers = new Headers(req.headers);
        headers.delete(GUEST_HEADER);
        return new Request(req, { headers });
      },
    });
    return response ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
