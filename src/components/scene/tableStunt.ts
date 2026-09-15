/**
 * "Numera" jako pijanog gosta koji je već povraćao: popne se na stol, ekira piće
 * i padne na leđa na pod — gdje ostaje ležati dok ga limunada ne otrijezni.
 *
 * Sve je u lokalnim koordinatama lika: ishodište je sjedalo, +Z gleda prema sredini stola,
 * ploča stola je na y = 0, pod na y = −1,1. Tijelo se okreće oko točke između stopala.
 */
import { DRINK_DURATION_MS, SEAT_RADIUS } from "@/lib/party/geometry";
import { VOMIT_DURATION_MS } from "./VomitStream";

const PI = Math.PI;

export const STUNT = {
  climbEnd: 1100,
  liftGlassEnd: 1500,
  chugEnd: 3300,
  slamEnd: 3700,
  fallStart: 4300,
  landAt: 5000,
  end: 5600,
} as const;
export const STUNT_DURATION_MS = STUNT.end;

/** Koliko nakon početka pijenja dolaze konfeti i slika (čeka povraćanje i pad sa stola) */
export function celebrationDelay(anyVomit: boolean, anyFall: boolean) {
  return Math.max(DRINK_DURATION_MS + (anyVomit ? VOMIT_DURATION_MS : 0), anyFall ? STUNT_DURATION_MS : 0);
}

/** Koliko je ishodište tijela iznad stopala kad lik stoji */
export const STAND_HEIGHT = 1.22;
/** Gdje stoji na stolu (lokalni z; rub stola je na ~0,55) */
const TABLE_SPOT_Z = 0.95;
const FLOOR_Y = -1.1;
/**
 * Kad leži na leđima: debljina tijela iznad poda, iza svoje stolice i okrenut bočno. Da leži
 * ravno iza stola, gostima s druge strane zaklanjala bi ga ploča stola — ovako viri sa strane.
 */
const LYING = { x: 0.9, y: FLOOR_Y + 0.25, z: -0.9, yaw: -1.3 };

export type StuntPose = {
  /** točka između stopala */
  feet: [number, number, number];
  /** nagib unatrag (0 = uspravno, −π/2 = na leđima) */
  tilt: number;
  yaw: number;
  /** noge ispružene (stoji ili leži) umjesto savijenih na stolici */
  straightLegs: boolean;
  /** gornji dio tijela: zabacivanje glave dok ekira (radijani, negativno = unatrag) */
  lean: number;
  lying: boolean;
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const SEATED_POSE: StuntPose = { feet: [0, -STAND_HEIGHT, 0], tilt: 0, yaw: 0, straightLegs: false, lean: 0, lying: false };
export const LYING_POSE: StuntPose = {
  feet: [LYING.x, LYING.y, LYING.z],
  tilt: -PI / 2,
  yaw: LYING.yaw,
  straightLegs: true,
  lean: 0,
  lying: true,
};

/** Poza lika u trenutku `age` (ms od početka numere) */
export function stuntPose(age: number): StuntPose {
  if (age >= STUNT.end) return LYING_POSE;

  if (age < STUNT.climbEnd) {
    const p = smoothstep(0, STUNT.climbEnd, age);
    const hop = Math.sin(p * PI) * 0.45;
    return {
      feet: [0, lerp(-STAND_HEIGHT, 0, p) + hop, lerp(0, TABLE_SPOT_Z, p)],
      tilt: 0,
      yaw: 0,
      straightLegs: p > 0.3,
      lean: Math.sin(p * PI) * 0.25,
      lying: false,
    };
  }

  if (age < STUNT.fallStart) {
    // stoji na stolu: podigne čašu, zabaci glavu i ekira, lupi čašom, zatetura se
    const chug = smoothstep(STUNT.liftGlassEnd - 150, STUNT.liftGlassEnd + 250, age) * (1 - smoothstep(STUNT.chugEnd - 100, STUNT.slamEnd, age));
    const wobble = smoothstep(STUNT.slamEnd, STUNT.fallStart, age);
    return {
      feet: [0, 0, TABLE_SPOT_Z],
      tilt: Math.sin(age / 110) * 0.08 * wobble,
      yaw: Math.sin(age / 170) * 0.15 * wobble,
      straightLegs: true,
      lean: -0.45 * chug,
      lying: false,
    };
  }

  // pad unatrag: ubrzava kao da ga vuče gravitacija, pa se malo odbije od poda
  const fall = clamp01((age - STUNT.fallStart) / (STUNT.landAt - STUNT.fallStart));
  const eased = fall * fall;
  const bounce = age > STUNT.landAt ? Math.sin(((age - STUNT.landAt) / (STUNT.end - STUNT.landAt)) * PI) * 0.06 : 0;
  return {
    feet: [lerp(0, LYING.x, eased), lerp(0, LYING.y, eased) + bounce, lerp(TABLE_SPOT_Z, LYING.z, fall)],
    tilt: (-PI / 2) * eased + bounce * 0.6,
    yaw: LYING.yaw * fall,
    straightLegs: true,
    lean: 0,
    lying: false,
  };
}

/**
 * Glava ležećeg lika u koordinatama mjesta za stolom (za oznaku s imenom).
 * Lik je u sjedalu okrenut za π: lokalni (x, y, z) → (−x, y, SEAT_RADIUS − z).
 */
export function lyingHeadInSeatSpace(): [number, number, number] {
  const length = STAND_HEIGHT + 0.5;
  const x = LYING.x - length * Math.sin(LYING.yaw);
  const z = LYING.z - length * Math.cos(LYING.yaw);
  return [-x, LYING.y, SEAT_RADIUS - z];
}

/** Čaša tijekom numere, u koordinatama lika: podigne je do usta stojećeg lika i prevrne */
export function stuntGlass(age: number) {
  const lift = smoothstep(STUNT.climbEnd, STUNT.liftGlassEnd, age) * (1 - smoothstep(STUNT.chugEnd, STUNT.slamEnd, age));
  const tilt = smoothstep(STUNT.liftGlassEnd - 100, STUNT.liftGlassEnd + 500, age) * (1 - smoothstep(STUNT.chugEnd - 200, STUNT.chugEnd + 200, age));
  const level = 1 - smoothstep(STUNT.liftGlassEnd + 200, STUNT.chugEnd - 200, age);
  return {
    /** 0 = čaša na svom mjestu na stolu, 1 = kod usta stojećeg lika */
    lift,
    mouth: { z: TABLE_SPOT_Z + 0.32, y: STAND_HEIGHT + 0.36 },
    tilt: tilt * 2.3,
    level,
  };
}
