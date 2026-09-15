import { routePartykitRequest, Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import {
  CLINK_DISTANCE,
  SOLO_CLINK_RADIUS,
  distance,
  distanceToSegment,
  glassRestPosition,
  seatAngle,
} from "../../src/lib/party/geometry";
import {
  CHAT_MIN_INTERVAL_MS,
  MAX_GLASS_RADIUS,
  MAX_PHOTO_ROUND,
  MUSIC_ADD_INTERVAL_MS,
  MUSIC_QUEUE_LIMIT,
  PARTY_NAME,
  sanitizeChat,
  type ClientMessage,
  type GlassPosition,
  type LiveSnapshot,
  type MusicAction,
  type MusicState,
  type Peer,
  type RoomUpdate,
  type ServerMessage,
  type ToastPhase,
} from "../../src/lib/party/protocol";
import { verifyTicket } from "../../src/lib/party/ticket";
import { VOMIT_LEVEL, afterDrinking, drunkLevel } from "../../src/lib/drunk";
import { parseYouTubeId, youTubeWatchUrl } from "../../src/lib/youtube";
import type { RoomState } from "../../src/lib/rooms/types";

type ConnectionState = { guestId: string; mic?: boolean; muted?: boolean };
type GuestConnection = Connection<ConnectionState>;

const GUEST_HEADER = "x-cheers-guest-id";
const MAX_MESSAGE_BYTES = 2048;
/** WebRTC SDP opisi su veći od običnih poruka */
const MAX_SIGNAL_BYTES = 16_000;
/** Isti par čaša ne može "zazvoniti" češće od ovoga (ms) */
const CLINK_COOLDOWN_MS = 500;
/** Histereza: par se mora razdvojiti malo više prije novog kucanja */
const CLINK_RELEASE_DISTANCE = CLINK_DISTANCE * 1.3;

/**
 * Jedna soba = jedan Durable Object. Drži "živo" stanje sobe:
 * tko je spojen, tko je spreman, gdje su čaše koje se vuku i tko se kucnuo.
 * Trajne podatke (gosti, pića, slika) šalje Next.js nakon svake promjene.
 *
 * Kucanje prepoznaje server (a ne preglednici), pa svi gosti čuju "cling"
 * u istom trenutku i nitko ne može "varati" s brojem kucanja.
 *
 * Hibernacija: kad nitko ništa ne šalje, objekt se uspava i ne troši kvotu.
 * Zato je sve što mora preživjeti buđenje u storageu, a id gosta u stanju konekcije.
 * Pozicije čaša u zraku su samo u memoriji — dok netko vuče čašu, objekt je budan.
 */
export class ToastRoom extends Server<Env> {
  static options = { hibernate: true };

  private room: RoomState | null = null;
  private ready = new Set<string>();
  private clinked = new Set<string>();
  private phase: ToastPhase = "lobby";
  private intoxication: Record<string, number> = {};
  private vomiting: string[] = [];
  private round = 0;
  private photoRound = 1;
  private music: MusicState = { current: null, queue: [] };

  private held = new Map<string, GlassPosition>();
  private touching = new Set<string>();
  private lastClinkAt = new Map<string, number>();
  private lastChatAt = new Map<string, number>();
  private lastMusicAddAt = new Map<string, number>();

  async onStart() {
    const stored = await this.ctx.storage.get<unknown>([
      "room",
      "ready",
      "clinked",
      "phase",
      "intoxication",
      "vomiting",
      "round",
      "photoRound",
      "music",
    ]);
    this.room = (stored.get("room") as RoomState | undefined) ?? null;
    this.ready = new Set((stored.get("ready") as string[] | undefined) ?? []);
    this.clinked = new Set((stored.get("clinked") as string[] | undefined) ?? []);
    this.phase = (stored.get("phase") as ToastPhase | undefined) ?? "lobby";
    this.intoxication = (stored.get("intoxication") as Record<string, number> | undefined) ?? {};
    this.vomiting = (stored.get("vomiting") as string[] | undefined) ?? [];
    this.round = (stored.get("round") as number | undefined) ?? 0;
    this.photoRound = (stored.get("photoRound") as number | undefined) ?? 1;
    this.music = (stored.get("music") as MusicState | undefined) ?? { current: null, queue: [] };
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
    if (!guestId || typeof raw !== "string" || raw.length > MAX_SIGNAL_BYTES) return;

    let message: ClientMessage;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (message.type !== "signal" && raw.length > MAX_MESSAGE_BYTES) return;

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
        const previous = this.held.get(guestId) ?? null;
        if (position) {
          this.held.set(guestId, position);
        } else {
          // Čaša se vraća na mjesto — sljedeći dodir s istim gostom opet zvoni
          this.held.delete(guestId);
          for (const key of this.touching) if (key.split("|").includes(guestId)) this.touching.delete(key);
        }
        this.broadcastMessage({ type: "glass", guestId, position }, [connection.id]);
        if (position) await this.detectClinks(guestId, previous, position);
        return;
      }
      case "chat": {
        const text = sanitizeChat(message.text);
        const now = Date.now();
        if (!text || now - (this.lastChatAt.get(guestId) ?? 0) < CHAT_MIN_INTERVAL_MS) return;
        this.lastChatAt.set(guestId, now);
        this.broadcastMessage({ type: "chat", guestId, text });
        return;
      }
      case "settings": {
        if (guestId !== this.room?.hostId) return;
        const value = Math.round(Number(message.photoRound));
        if (!Number.isFinite(value)) return;
        this.photoRound = Math.min(MAX_PHOTO_ROUND, Math.max(1, value));
        await this.persist();
        this.broadcastSnapshot();
        return;
      }
      case "music": {
        await this.handleMusic(connection, guestId, message);
        return;
      }
      case "voice": {
        connection.setState({ guestId, mic: message.mic === true, muted: message.muted === true });
        this.broadcastSnapshot();
        return;
      }
      case "signal": {
        // Signalizacija ide samo drugom pregledniku u ovoj istoj sobi
        if (typeof message.to !== "string" || message.to === connection.id) return;
        const target = this.getConnection(message.to);
        if (!target) return;
        this.send(target, { type: "signal", from: connection.id, data: message.data });
        return;
      }
      case "reset": {
        if (guestId !== this.room?.hostId) return;
        this.phase = "lobby";
        this.ready.clear();
        this.resetRound();
        this.vomiting = [];
        await this.persist();
        this.broadcastSnapshot();
        return;
      }
    }
  }

  onClose(connection: GuestConnection) {
    const guestId = connection.state?.guestId;
    if (!guestId) return;
    // Ako je gost vukao čašu kad mu je pukla veza, vrati je na mjesto kod ostalih
    if (!this.onlineGuestIds(connection.id).has(guestId)) {
      this.held.delete(guestId);
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

    // Uklonjeni gosti: makni im spremnost/kucanje i zatvori im konekcije
    this.ready = new Set([...this.ready].filter((id) => guestIds.has(id)));
    this.clinked = new Set([...this.clinked].filter((id) => guestIds.has(id)));
    this.intoxication = Object.fromEntries(Object.entries(this.intoxication).filter(([id]) => guestIds.has(id)));
    this.vomiting = this.vomiting.filter((id) => guestIds.has(id));
    for (const id of this.held.keys()) if (!guestIds.has(id)) this.held.delete(id);
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
    this.resetRound();
    this.phase = "lobby";
    this.intoxication = {};
    this.vomiting = [];
    this.round = 0;
    this.photoRound = 1;
    this.music = { current: null, queue: [] };
  }

  // ---------- kucanje ----------

  private async detectClinks(guestId: string, previous: GlassPosition | null, position: GlassPosition) {
    const guests = this.room?.guests ?? [];
    const now = Date.now();
    let changed = false;

    if (guests.length === 1) {
      // Sam za stolom: kucni čašom u sredinu stola
      if (distance(position, { x: 0, z: 0 }) < SOLO_CLINK_RADIUS) {
        changed = this.registerClink(guestId, guestId, position, now) || changed;
      } else {
        this.touching.delete(pairKey(guestId, guestId));
      }
    }

    guests.forEach((other, index) => {
      if (other.id === guestId) return;
      const otherPosition = this.held.get(other.id) ?? glassRestPosition(seatAngle(index, guests.length));
      const key = pairKey(guestId, other.id);
      const gap = previous ? distanceToSegment(otherPosition, previous, position) : distance(otherPosition, position);

      if (gap < CLINK_DISTANCE) {
        const at = { x: (position.x + otherPosition.x) / 2, z: (position.z + otherPosition.z) / 2 };
        changed = this.registerClink(guestId, other.id, at, now) || changed;
      } else if (distance(otherPosition, position) > CLINK_RELEASE_DISTANCE) {
        this.touching.delete(key);
      }
    });

    if (!changed) return;
    this.updatePhase();
    await this.persist();
    this.broadcastSnapshot();
  }

  /** Vraća true ako se promijenio skup gostiju koji su se kucnuli */
  private registerClink(a: string, b: string, at: GlassPosition, now: number) {
    const key = pairKey(a, b);
    if (this.touching.has(key)) return false;
    this.touching.add(key);
    if (now - (this.lastClinkAt.get(key) ?? 0) < CLINK_COOLDOWN_MS) return false;
    this.lastClinkAt.set(key, now);

    this.broadcastMessage({ type: "clink", a, b, at: { x: round(at.x), z: round(at.z) } });
    const before = this.clinked.size;
    this.clinked.add(a).add(b);
    return this.clinked.size !== before;
  }

  // ---------- glazba (YouTube) ----------

  private async handleMusic(connection: GuestConnection, guestId: string, message: MusicAction) {
    const isHost = guestId === this.room?.hostId;
    const now = Date.now();
    const music = this.music;
    const current = music.current;

    switch (message.action) {
      case "add": {
        if (now - (this.lastMusicAddAt.get(guestId) ?? 0) < MUSIC_ADD_INTERVAL_MS) return;
        if (music.queue.length >= MUSIC_QUEUE_LIMIT) {
          this.send(connection, { type: "music-error", message: `Red je pun (najviše ${MUSIC_QUEUE_LIMIT} pjesama).` });
          return;
        }
        const videoId = typeof message.url === "string" ? parseYouTubeId(message.url) : null;
        if (!videoId) {
          this.send(connection, { type: "music-error", message: "To nije ispravan YouTube link." });
          return;
        }
        this.lastMusicAddAt.set(guestId, now);
        const title = await fetchYouTubeTitle(videoId);
        if (title === null) {
          this.send(connection, { type: "music-error", message: "Taj video ne postoji ili se ne smije puštati izvan YouTubea." });
          return;
        }
        const track = { id: crypto.randomUUID().slice(0, 8), videoId, title, addedBy: guestId };
        // Ništa ne svira — kreni odmah
        if (!current) music.current = { track, startedAt: now, pausedAt: null };
        else music.queue.push(track);
        break;
      }
      case "play": {
        if (!isHost) return;
        const index = music.queue.findIndex((t) => t.id === message.trackId);
        if (index < 0) return;
        const [track] = music.queue.splice(index, 1);
        music.current = { track, startedAt: now, pausedAt: null };
        break;
      }
      case "pause": {
        if (!isHost || !current || current.startedAt === null) return;
        current.pausedAt = Math.max(0, (now - current.startedAt) / 1000);
        current.startedAt = null;
        break;
      }
      case "resume": {
        if (!isHost || !current || current.pausedAt === null) return;
        current.startedAt = now - current.pausedAt * 1000;
        current.pausedAt = null;
        break;
      }
      case "skip": {
        if (!isHost) return;
        this.playNext(now);
        break;
      }
      case "ended": {
        // Više preglednika javi kraj iste pjesme — prelazimo samo jednom
        if (!current || current.track.id !== message.trackId) return;
        this.playNext(now);
        break;
      }
      case "remove": {
        const track = music.queue.find((t) => t.id === message.trackId);
        if (!track || (!isHost && track.addedBy !== guestId)) return;
        music.queue = music.queue.filter((t) => t.id !== message.trackId);
        break;
      }
      default:
        return;
    }

    await this.persist();
    this.broadcastSnapshot();
  }

  private playNext(now: number) {
    const next = this.music.queue.shift();
    this.music.current = next ? { track: next, startedAt: now, pausedAt: null } : null;
  }

  private resetRound() {
    this.clinked.clear();
    this.held.clear();
    this.touching.clear();
    this.lastClinkAt.clear();
  }

  // ---------- pomoćne ----------

  private updatePhase() {
    const guests = this.room?.guests ?? [];
    if (guests.length === 0) {
      this.phase = "lobby";
      this.ready.clear();
      this.resetRound();
      return;
    }
    // Čekamo i goste koji su trenutno offline — nazdravlja se tek kad su SVI spremni
    if (this.phase === "lobby" && guests.every((g) => this.ready.has(g.id))) {
      this.phase = "toasting";
      this.resetRound();
    }
    // Svatko se kucnuo s barem jednim drugim -> pijenje i otkrivanje slike
    if (this.phase === "toasting" && guests.every((g) => this.clinked.has(g.id))) {
      this.phase = "revealed";
      this.held.clear();
      this.finishRound();
    }
  }

  /** Kraj runde: svatko popije svoje piće (limunada otrježnjuje), pa tko je prešao granicu — povraća */
  private finishRound() {
    const guests = this.room?.guests ?? [];
    this.round += 1;
    this.vomiting = [];
    for (const guest of guests) {
      const next = afterDrinking(this.intoxication[guest.id] ?? 0, guest.drink);
      this.intoxication[guest.id] = next;
      if (drunkLevel(next) >= VOMIT_LEVEL) this.vomiting.push(guest.id);
    }
  }

  private persist() {
    return this.ctx.storage.put({
      room: this.room,
      ready: [...this.ready],
      clinked: [...this.clinked],
      phase: this.phase,
      intoxication: this.intoxication,
      vomiting: this.vomiting,
      round: this.round,
      photoRound: this.photoRound,
      music: this.music,
    });
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

  private peers(excludeConnectionId?: string): Peer[] {
    const peers: Peer[] = [];
    for (const connection of this.getConnections<ConnectionState>()) {
      const state = connection.state;
      if (connection.id === excludeConnectionId || !state?.guestId) continue;
      peers.push({ id: connection.id, guestId: state.guestId, mic: state.mic === true, muted: state.muted === true });
    }
    return peers;
  }

  private broadcastSnapshot(excludeConnectionId?: string) {
    const snapshot: LiveSnapshot = {
      type: "sync",
      room: this.room,
      online: [...this.onlineGuestIds(excludeConnectionId)],
      ready: [...this.ready],
      clinked: [...this.clinked],
      phase: this.phase,
      intoxication: this.intoxication,
      vomiting: this.vomiting,
      peers: this.peers(excludeConnectionId),
      round: this.round,
      photoRound: this.photoRound,
      music: this.music,
      serverTime: Date.now(),
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

/**
 * Naslov videa preko YouTube oEmbeda (bez API ključa). null = video ne postoji ili
 * vlasnik ne dopušta ugradnju; kod mrežne greške pustimo ga s općim naslovom.
 */
async function fetchYouTubeTitle(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(youTubeWatchUrl(videoId))}`);
    if ([400, 401, 403, 404].includes(res.status)) return null;
    if (!res.ok) return "YouTube video";
    const data = (await res.json()) as { title?: unknown };
    return typeof data.title === "string" && data.title.trim() ? data.title.trim().slice(0, 120) : "YouTube video";
  } catch {
    return "YouTube video";
  }
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

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
