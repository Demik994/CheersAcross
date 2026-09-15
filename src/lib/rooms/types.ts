import type { AvatarId } from "@/lib/avatars";
import type { DrinkId } from "@/lib/drinks";

export const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_GUESTS = 12;
export const NAME_MAX_LENGTH = 20;
export const PIN_LENGTH = 6;

/** Zapis sobe u bazi */
export type RoomRecord = {
  code: string;
  hostId: string;
  pin: { salt: string; hash: string } | null;
  photoUrl: string | null;
  createdAt: number;
  expiresAt: number;
};

/** Zapis gosta u bazi (token se čuva samo kao hash) */
export type GuestRecord = {
  id: string;
  name: string;
  drink: DrinkId;
  color: string;
  /** Nema ih kod gostiju spremljenih prije odabira likova */
  avatar?: AvatarId;
  skin?: number;
  joinedAt: number;
  tokenHash: string;
};

/** Ono što klijent smije vidjeti o gostu */
export type PublicGuest = {
  id: string;
  name: string;
  drink: DrinkId;
  color: string;
  avatar: AvatarId;
  skin: number;
  isHost: boolean;
};

export type RoomState = {
  code: string;
  photoUrl: string | null;
  expiresAt: number;
  hostId: string;
  guests: PublicGuest[];
};

/** Sesija gosta koju klijent drži u localStorage */
export type GuestSession = {
  guestId: string;
  token: string;
};
