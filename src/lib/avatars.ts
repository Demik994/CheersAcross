/**
 * Likovi (avatari) za stolom. Samo podaci — 3D izgled crta scene/Character.tsx.
 * Boja odjeće je boja gosta (dodjeljuje server), a lik i boju kože bira gost.
 */

export type HairStyle = "short" | "curly" | "bald" | "bun" | "long" | "ponytail" | "bob" | "topBun";
export type FacialHair = "none" | "beard" | "mustache" | "stubble";

export type Avatar = {
  gender: "m" | "f";
  label: string;
  hair: HairStyle;
  hairColor: string;
  facialHair: FacialHair;
  glasses: boolean;
  beanie: boolean;
};

const avatars = {
  m1: { gender: "m", label: "Kratka kosa", hair: "short", hairColor: "#5a3a22", facialHair: "none", glasses: false, beanie: false },
  m2: { gender: "m", label: "Kovrče i brada", hair: "curly", hairColor: "#1f1712", facialHair: "beard", glasses: false, beanie: false },
  m3: { gender: "m", label: "Brkovi i naočale", hair: "bald", hairColor: "#4a3f36", facialHair: "mustache", glasses: true, beanie: false },
  m4: { gender: "m", label: "Punđa i kapa", hair: "bun", hairColor: "#b98a4a", facialHair: "stubble", glasses: false, beanie: true },
  f1: { gender: "f", label: "Duga kosa", hair: "long", hairColor: "#3b2416", facialHair: "none", glasses: false, beanie: false },
  f2: { gender: "f", label: "Konjski rep", hair: "ponytail", hairColor: "#e0b86a", facialHair: "none", glasses: false, beanie: false },
  f3: { gender: "f", label: "Bob i naočale", hair: "bob", hairColor: "#141414", facialHair: "none", glasses: true, beanie: false },
  f4: { gender: "f", label: "Kovrčava punđa", hair: "topBun", hairColor: "#8a3b1c", facialHair: "none", glasses: false, beanie: false },
} satisfies Record<string, Avatar>;

export type AvatarId = keyof typeof avatars;
export const AVATARS: Record<AvatarId, Avatar> = avatars;
export const AVATAR_IDS = Object.keys(avatars) as AvatarId[];

export const SKIN_TONES = ["#f6d7c3", "#f1c6a5", "#e0ac86", "#c68863", "#8d5a3b"] as const;

export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(avatars, value);
}

export function isSkinTone(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < SKIN_TONES.length;
}

function hashString(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Lik za goste koji ga nisu odabrali (npr. spremljeni prije ove značajke) — stabilan po id-u */
export function defaultLook(seed: string): { avatar: AvatarId; skin: number } {
  const hash = hashString(seed);
  return { avatar: AVATAR_IDS[hash % AVATAR_IDS.length], skin: (hash >> 4) % SKIN_TONES.length };
}
