import "server-only";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { defaultLook, isAvatarId, isSkinTone, type AvatarId } from "@/lib/avatars";
import { DEFAULT_DRINK, isDrinkId, normalizeDrinkId, type DrinkId } from "@/lib/drinks";
import { generateRoomCode } from "./codes";
import { getRoomStore } from "./store";
import {
  MAX_GUESTS,
  NAME_MAX_LENGTH,
  PIN_LENGTH,
  ROOM_TTL_MS,
  type GuestRecord,
  type GuestSession,
  type RoomRecord,
  type RoomState,
} from "./types";

const PIN_FAIL_WINDOW_MS = 15 * 60 * 1000;
const PIN_MAX_FAILURES = 10;

/** Boje čovječuljaka — dovoljno različite i na tamnoj pozadini */
const GUEST_COLORS = [
  "#e4572e", "#29a19c", "#f3a712", "#6a4c93", "#3f88c5", "#d1495b",
  "#8ac926", "#ff85a1", "#1982c4", "#c97c5d", "#7b8cde", "#43aa8b",
];

export class RoomError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---------- pomoćne ----------

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function hashPin(pin: string, salt: string) {
  return scryptSync(pin, salt, 32).toString("hex");
}

function safeEqualHex(a: string, b: string) {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function validateName(input: unknown): string {
  const name = typeof input === "string" ? input.replace(/[\p{C}]/gu, "").replace(/\s+/g, " ").trim() : "";
  if (!name) throw new RoomError(400, "Upiši svoje ime.");
  if ([...name].length > NAME_MAX_LENGTH) throw new RoomError(400, `Ime može imati najviše ${NAME_MAX_LENGTH} znakova.`);
  return name;
}

function validatePin(input: unknown): string {
  if (typeof input !== "string" || !new RegExp(`^\\d{${PIN_LENGTH}}$`).test(input)) {
    throw new RoomError(400, `PIN mora imati točno ${PIN_LENGTH} znamenki.`);
  }
  return input;
}

type Look = { avatar: AvatarId; skin: number };

/** Odabrani lik; ako nije poslan (ili je neispravan), nasumičan ali stabilan */
function parseLook(input: { avatar?: unknown; skin?: unknown }, seed: string): Look {
  const fallback = defaultLook(seed);
  return {
    avatar: isAvatarId(input.avatar) ? input.avatar : fallback.avatar,
    skin: isSkinTone(input.skin) ? input.skin : fallback.skin,
  };
}

function newGuest(
  name: string,
  color: string,
  look: { avatar?: unknown; skin?: unknown },
): { guest: GuestRecord; session: GuestSession } {
  const token = randomBytes(32).toString("base64url");
  const id = randomUUID();
  const guest: GuestRecord = {
    id,
    name,
    drink: DEFAULT_DRINK,
    color,
    ...parseLook(look, id),
    joinedAt: Date.now(),
    tokenHash: hashToken(token),
  };
  return { guest, session: { guestId: guest.id, token } };
}

async function requireRoom(code: string): Promise<RoomRecord> {
  const room = await getRoomStore().getRoom(code);
  if (!room) throw new RoomError(404, "Soba ne postoji ili je istekla.");
  return room;
}

// ---------- javne operacije ----------

export async function createRoom(input: { hostName: unknown; pin?: unknown; avatar?: unknown; skin?: unknown }) {
  const store = getRoomStore();
  const hostName = validateName(input.hostName);
  const pin = input.pin ? validatePin(input.pin) : null;

  const { guest, session } = newGuest(hostName, GUEST_COLORS[0], input);
  const salt = randomBytes(16).toString("hex");
  const now = Date.now();

  // Sudar kodova je malo vjerojatan (31^6 ≈ 887 milijuna), ali ga svejedno hvatamo
  for (let attempt = 0; attempt < 5; attempt++) {
    const room: RoomRecord = {
      code: generateRoomCode(),
      hostId: guest.id,
      pin: pin ? { salt, hash: hashPin(pin, salt) } : null,
      photoUrl: null,
      createdAt: now,
      expiresAt: now + ROOM_TTL_MS,
    };
    if (await store.createRoom(room)) {
      await store.putGuest(room, guest);
      return { code: room.code, session };
    }
  }
  throw new RoomError(503, "Nije uspjelo kreiranje sobe. Pokušaj ponovno.");
}

export async function getRoomInfo(code: string) {
  const room = await getRoomStore().getRoom(code);
  if (!room) return null;
  return { code: room.code, hasPin: room.pin !== null, expiresAt: room.expiresAt };
}

export async function joinRoom(code: string, input: { name: unknown; pin?: unknown; avatar?: unknown; skin?: unknown }) {
  const store = getRoomStore();
  const room = await requireRoom(code);

  if (room.pin) {
    if ((await store.getPinFailures(code)) >= PIN_MAX_FAILURES) {
      throw new RoomError(429, "Previše pogrešnih PIN-ova. Pokušaj ponovno za 15 minuta.");
    }
    const pin = typeof input.pin === "string" ? input.pin : "";
    if (!/^\d+$/.test(pin) || !safeEqualHex(hashPin(pin, room.pin.salt), room.pin.hash)) {
      await store.registerPinFailure(code, PIN_FAIL_WINDOW_MS);
      throw new RoomError(403, "Pogrešan PIN.");
    }
  }

  const name = validateName(input.name);
  const guests = await store.getGuests(code);
  if (guests.length >= MAX_GUESTS) {
    throw new RoomError(409, `Soba je puna (najviše ${MAX_GUESTS} gostiju).`);
  }
  const taken = guests.some((g) => g.name.localeCompare(name, "hr", { sensitivity: "base" }) === 0);
  if (taken) throw new RoomError(409, "To ime je već zauzeto u sobi. Dodaj inicijal ili nadimak.");

  const usedColors = new Set(guests.map((g) => g.color));
  const color = GUEST_COLORS.find((c) => !usedColors.has(c)) ?? GUEST_COLORS[guests.length % GUEST_COLORS.length];

  const { guest, session } = newGuest(name, color, input);
  await store.putGuest(room, guest);
  return { session };
}

export async function authenticate(code: string, session: GuestSession | null) {
  const room = await requireRoom(code);
  if (!session) throw new RoomError(401, "Nisi član ove sobe.");

  const guests = await getRoomStore().getGuests(code);
  const me = guests.find((g) => g.id === session.guestId);
  if (!me || !safeEqualHex(hashToken(session.token), me.tokenHash)) {
    throw new RoomError(401, "Nisi član ove sobe.");
  }
  return { room, guests, me };
}

export function toRoomState(room: RoomRecord, guests: GuestRecord[]): RoomState {
  return {
    code: room.code,
    photoUrl: room.photoUrl,
    expiresAt: room.expiresAt,
    hostId: room.hostId,
    guests: guests
      .sort((a, b) => a.joinedAt - b.joinedAt)
      // normalizeDrinkId: gosti spremljeni prije menija pića imaju stare oznake (npr. "wine")
      .map((g) => {
        const look = g.avatar !== undefined && g.skin !== undefined ? { avatar: g.avatar, skin: g.skin } : defaultLook(g.id);
        return { id: g.id, name: g.name, drink: normalizeDrinkId(g.drink), color: g.color, ...look, isHost: g.id === room.hostId };
      }),
  };
}

/** Gost mijenja svoje piće i/ili izgled (šalje samo ono što mijenja) */
export async function updateMe(
  code: string,
  session: GuestSession | null,
  input: { drink?: unknown; avatar?: unknown; skin?: unknown },
) {
  const changes: Partial<Pick<GuestRecord, "drink" | "avatar" | "skin">> = {};
  if (input.drink !== undefined) {
    if (!isDrinkId(input.drink)) throw new RoomError(400, "Nepoznato piće.");
    changes.drink = input.drink as DrinkId;
  }
  if (input.avatar !== undefined) {
    if (!isAvatarId(input.avatar)) throw new RoomError(400, "Nepoznat lik.");
    changes.avatar = input.avatar;
  }
  if (input.skin !== undefined) {
    if (!isSkinTone(input.skin)) throw new RoomError(400, "Nepoznata boja kože.");
    changes.skin = input.skin;
  }
  if (Object.keys(changes).length === 0) throw new RoomError(400, "Nema promjena.");

  const { room, me } = await authenticate(code, session);
  // Stari gosti bez lika: zadrži dosadašnji izgled za dio koji ne mijenjaju
  const current = me.avatar !== undefined && me.skin !== undefined ? { avatar: me.avatar, skin: me.skin } : defaultLook(me.id);
  await getRoomStore().putGuest(room, { ...me, ...current, ...changes });
}

export async function leaveRoom(code: string, session: GuestSession | null) {
  const { me } = await authenticate(code, session);
  await getRoomStore().removeGuest(code, me.id);
}

export async function kickGuest(code: string, session: GuestSession | null, guestId: string) {
  const { guests, me } = await requireHost(code, session, "Samo domaćin može uklanjati goste.");
  if (guestId === me.id) throw new RoomError(400, "Domaćin ne može ukloniti sebe.");
  if (!guests.some((g) => g.id === guestId)) throw new RoomError(404, "Gost više nije u sobi.");
  await getRoomStore().removeGuest(code, guestId);
}

export async function requireHost(
  code: string,
  session: GuestSession | null,
  message = "Samo domaćin može mijenjati sliku.",
) {
  const auth = await authenticate(code, session);
  if (auth.me.id !== auth.room.hostId) {
    throw new RoomError(403, message);
  }
  return auth;
}

export async function setPhotoUrl(room: RoomRecord, photoUrl: string | null) {
  await getRoomStore().saveRoom({ ...room, photoUrl });
}
