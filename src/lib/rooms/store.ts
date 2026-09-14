import "server-only";
import { Redis } from "@upstash/redis";
import { redisToken, redisUrl } from "@/lib/env";
import type { GuestRecord, RoomRecord } from "./types";

/**
 * Spremište soba. Soba i gosti su odvojeni ključevi (gosti kao Redis hash),
 * pa dva gosta koja se istovremeno pridruže ne prepisuju jedan drugoga.
 * Oba ključa ističu točno kad i soba (24 h od kreiranja).
 */
export interface RoomStore {
  /** Vraća false ako soba s tim kodom već postoji */
  createRoom(room: RoomRecord): Promise<boolean>;
  getRoom(code: string): Promise<RoomRecord | null>;
  saveRoom(room: RoomRecord): Promise<void>;
  getGuests(code: string): Promise<GuestRecord[]>;
  putGuest(room: RoomRecord, guest: GuestRecord): Promise<void>;
  removeGuest(code: string, guestId: string): Promise<void>;
  /** Broji krive PIN-ove u kliznom prozoru; vraća broj pokušaja */
  registerPinFailure(code: string, windowMs: number): Promise<number>;
  getPinFailures(code: string): Promise<number>;
}

const roomKey = (code: string) => `room:${code}`;
const guestsKey = (code: string) => `room:${code}:guests`;
const pinFailKey = (code: string) => `room:${code}:pinfail`;

class RedisRoomStore implements RoomStore {
  constructor(private redis: Redis) {}

  async createRoom(room: RoomRecord) {
    const res = await this.redis.set(roomKey(room.code), room, { nx: true, pxat: room.expiresAt });
    return res === "OK";
  }

  async getRoom(code: string) {
    return this.redis.get<RoomRecord>(roomKey(code));
  }

  async saveRoom(room: RoomRecord) {
    await this.redis.set(roomKey(room.code), room, { pxat: room.expiresAt });
  }

  async getGuests(code: string) {
    const all = await this.redis.hgetall<Record<string, GuestRecord>>(guestsKey(code));
    return all ? Object.values(all) : [];
  }

  async putGuest(room: RoomRecord, guest: GuestRecord) {
    await this.redis
      .pipeline()
      .hset(guestsKey(room.code), { [guest.id]: guest })
      .pexpireat(guestsKey(room.code), room.expiresAt)
      .exec();
  }

  async removeGuest(code: string, guestId: string) {
    await this.redis.hdel(guestsKey(code), guestId);
  }

  async registerPinFailure(code: string, windowMs: number) {
    const [count] = await this.redis
      .pipeline()
      .incr(pinFailKey(code))
      .pexpire(pinFailKey(code), windowMs, "NX")
      .exec<[number, number]>();
    return count;
  }

  async getPinFailures(code: string) {
    return (await this.redis.get<number>(pinFailKey(code))) ?? 0;
  }
}

type Expiring<T> = { value: T; expiresAt: number };

/** Za lokalni razvoj bez baze. Podaci nestaju kad se ugasi dev server. */
class MemoryRoomStore implements RoomStore {
  private rooms = new Map<string, Expiring<RoomRecord>>();
  private guests = new Map<string, Map<string, GuestRecord>>();
  private pinFails = new Map<string, Expiring<number>>();

  private live<T>(map: Map<string, Expiring<T>>, key: string): T | null {
    const entry = map.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      map.delete(key);
      return null;
    }
    return entry.value;
  }

  async createRoom(room: RoomRecord) {
    if (this.live(this.rooms, room.code)) return false;
    this.rooms.set(room.code, { value: structuredClone(room), expiresAt: room.expiresAt });
    this.guests.set(room.code, new Map()); // briše goste eventualne istekle sobe s istim kodom
    return true;
  }

  async getRoom(code: string) {
    const room = this.live(this.rooms, code);
    return room ? structuredClone(room) : null;
  }

  async saveRoom(room: RoomRecord) {
    this.rooms.set(room.code, { value: structuredClone(room), expiresAt: room.expiresAt });
  }

  async getGuests(code: string) {
    if (!this.live(this.rooms, code)) return [];
    return [...(this.guests.get(code)?.values() ?? [])].map((g) => structuredClone(g));
  }

  async putGuest(room: RoomRecord, guest: GuestRecord) {
    const map = this.guests.get(room.code) ?? new Map<string, GuestRecord>();
    map.set(guest.id, structuredClone(guest));
    this.guests.set(room.code, map);
  }

  async removeGuest(code: string, guestId: string) {
    this.guests.get(code)?.delete(guestId);
  }

  async registerPinFailure(code: string, windowMs: number) {
    const entry = this.pinFails.get(code);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.pinFails.set(code, { value: 1, expiresAt: Date.now() + windowMs });
      return 1;
    }
    entry.value += 1;
    return entry.value;
  }

  async getPinFailures(code: string) {
    return this.live(this.pinFails, code) ?? 0;
  }
}

export class StoreNotConfiguredError extends Error {
  constructor() {
    super("Baza soba nije konfigurirana (UPSTASH_REDIS_REST_URL / KV_REST_API_URL).");
  }
}

// Memorijsko spremište držimo na globalThis da preživi hot-reload u razvoju
const globalForStore = globalThis as unknown as { cheersRoomStore?: RoomStore };

export function getRoomStore(): RoomStore {
  if (globalForStore.cheersRoomStore) return globalForStore.cheersRoomStore;

  // Vercel Marketplace (Upstash) postavlja KV_REST_API_*, ručna Upstash konfiguracija UPSTASH_REDIS_REST_*
  const url = redisUrl();
  const token = redisToken();

  let store: RoomStore;
  if (url && token) {
    store = new RedisRoomStore(new Redis({ url, token }));
  } else if (process.env.NODE_ENV !== "production") {
    store = new MemoryRoomStore();
  } else {
    throw new StoreNotConfiguredError();
  }

  globalForStore.cheersRoomStore = store;
  return store;
}
