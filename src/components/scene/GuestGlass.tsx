"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { MathUtils, Plane, Vector3, type Group, type Mesh, type MeshBasicMaterial } from "three";
import type { GlassTargets } from "@/hooks/useLiveRoom";
import { MAX_GLASS_RADIUS, type GlassPosition } from "@/lib/party/protocol";
import type { PublicGuest } from "@/lib/rooms/types";
import Glass from "./Glass";
import { DRINK_DURATION_MS, SEAT_RADIUS, glassRestPosition } from "@/lib/party/geometry";
import { TABLE_TOP_Y } from "./Table";
import { STUNT, stuntGlass } from "./tableStunt";

const GLASS_SCALE = 0.72;
/** Podignuta čaša (dok je netko drži) */
const LIFT = 0.18;
/** Koliko često šaljemo poziciju tijekom vučenje (ms) — ~20 poruka/s */
const SEND_INTERVAL_MS = 50;

const tablePlane = new Plane(new Vector3(0, 1, 0), -(TABLE_TOP_Y + LIFT));
const hit = new Vector3();

type Props = {
  guest: PublicGuest;
  angle: number;
  isMe: boolean;
  /** Smije li se moja čaša vući (tek kad su svi kliknuli "Nazdravi") */
  draggable: boolean;
  glassTargets: RefObject<GlassTargets>;
  onMove: (position: GlassPosition | null) => void;
  /** performance.now() početka pijenja; null = runda još nije završila */
  revealStartedAt: number | null;
  /** gost se penje na stol i ekira (performance.now() početka) */
  stuntStartedAt: number | null;
  /** gost leži na podu — čaša ostaje na stolu i samo se isprazni */
  lying: boolean;
};

/** Gdje je čaša dok lik pije (ispred lica) */
const MOUTH_RADIUS = SEAT_RADIUS - 0.55;
const MOUTH_HEIGHT = 0.3;
const DRINK_TILT = 1.15;

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Čaša jednog gosta u koordinatama stola. Tuđe čaše prate pozicije s real-time
 * servera (glatko interpolirano), a svoju gost vuče mišem ili prstom.
 * Kad se pusti, čaša se vrati na mjesto ispred gosta.
 * Kad se svi kucnu, lik podigne čašu do usta, nagne je i ispije.
 */
export default function GuestGlass({
  guest,
  angle,
  isMe,
  draggable,
  glassTargets,
  onMove,
  revealStartedAt,
  stuntStartedAt,
  lying,
}: Props) {
  const groupRef = useRef<Group>(null);
  const hintRef = useRef<Mesh>(null);
  const dragging = useRef(false);
  const lastSent = useRef(0);
  /** Razmak između točke hvatanja i čaše, da čaša ne "skoči" pod prst */
  const grabOffset = useRef({ x: 0, z: 0 });
  const level = useRef(1);
  const get = useThree((state) => state.get);

  // Ako vučenje prestane biti dopušteno usred poteza, pusti čašu
  useEffect(() => {
    if (!draggable && dragging.current) {
      dragging.current = false;
      onMove(null);
    }
  }, [draggable, onMove]);

  useFrame(({ clock }, delta) => {
    const g = groupRef.current;
    if (!g) return;
    g.rotation.order = "YXZ"; // nagib (X) u smjeru lika (Y = kut mjesta)
    g.rotation.y = angle;

    const progress = revealStartedAt === null ? null : (performance.now() - revealStartedAt) / DRINK_DURATION_MS;
    const stuntAge = stuntStartedAt === null ? null : performance.now() - stuntStartedAt;
    const stunting = stuntAge !== null && stuntAge < STUNT.slamEnd;
    const animating = stunting || (progress !== null && progress < 1);

    if (stunting) {
      // Na stolu: podigne čašu do usta (stoji, pa je visoko), prevrne je i lupi natrag na stol
      const s = stuntGlass(stuntAge);
      const rest = glassRestPosition(angle);
      const mouthRadius = SEAT_RADIUS - s.mouth.z;
      g.position.set(
        MathUtils.lerp(rest.x, Math.sin(angle) * mouthRadius, s.lift),
        TABLE_TOP_Y + s.lift * s.mouth.y,
        MathUtils.lerp(rest.z, Math.cos(angle) * mouthRadius, s.lift),
      );
      g.rotation.x = s.tilt;
      level.current = s.level;
    } else if (progress !== null && progress < 1 && lying) {
      // Leži na podu: čaša ostane na stolu, samo se isprazni
      level.current = 1 - smoothstep(0.36, 0.7, progress);
    } else if (progress !== null && progress < 1) {
      // 0–0.3 podizanje do usta · 0.3–0.72 naginjanje i pijenje · 0.72–1 spuštanje
      const lift = smoothstep(0, 0.3, progress) * (1 - smoothstep(0.72, 1, progress));
      const tilt = smoothstep(0.3, 0.48, progress) * (1 - smoothstep(0.66, 0.84, progress));
      const rest = glassRestPosition(angle);
      const mouthX = Math.sin(angle) * MOUTH_RADIUS;
      const mouthZ = Math.cos(angle) * MOUTH_RADIUS;
      g.position.set(
        MathUtils.lerp(rest.x, mouthX, lift),
        TABLE_TOP_Y + lift * MOUTH_HEIGHT,
        MathUtils.lerp(rest.z, mouthZ, lift),
      );
      g.rotation.x = tilt * DRINK_TILT;
      level.current = 1 - smoothstep(0.36, 0.7, progress);
    } else {
      // Nakon pijenja čaša ostaje prazna; nova runda je polako napuni
      level.current = MathUtils.damp(level.current, revealStartedAt === null ? 1 : 0, 2.5, delta);
      g.rotation.x = MathUtils.damp(g.rotation.x, 0, 8, delta);
    }

    if (!dragging.current && !(animating && !lying)) {
      const remote = isMe ? null : glassTargets.current.get(guest.id) ?? null;
      const target = remote ?? glassRestPosition(angle);
      const lambda = remote ? 14 : 6;
      g.position.x = MathUtils.damp(g.position.x, target.x, lambda, delta);
      g.position.z = MathUtils.damp(g.position.z, target.z, lambda, delta);
      g.position.y = MathUtils.damp(g.position.y, TABLE_TOP_Y + (remote ? LIFT : 0), 10, delta);
    }

    // Pulsirajući prsten ispod moje čaše = "možeš me povući"
    const hint = hintRef.current;
    if (hint) {
      hint.visible = draggable && !dragging.current;
      (hint.material as MeshBasicMaterial).opacity = 0.35 + Math.sin(clock.getElapsedTime() * 4) * 0.25;
    }
  });

  function setControlsEnabled(enabled: boolean) {
    const controls = get().controls as unknown as { enabled: boolean } | null;
    if (controls) controls.enabled = enabled;
  }

  /** Točka na ravnini stola ispod pokazivača, u koordinatama stola */
  function pointerOnTable(e: ThreeEvent<PointerEvent>) {
    const parent = groupRef.current?.parent;
    if (!parent || !e.ray.intersectPlane(tablePlane, hit)) return null;
    // Svjetske koordinate -> koordinate stola (stol je zarotiran za svakog gosta)
    return parent.worldToLocal(hit);
  }

  function onPointerDown(e: ThreeEvent<PointerEvent>) {
    const g = groupRef.current;
    if (!isMe || !draggable || !g) return;
    e.stopPropagation();
    const point = pointerOnTable(e);
    if (!point) return;
    grabOffset.current = { x: g.position.x - point.x, z: g.position.z - point.z };
    (e.target as unknown as Element).setPointerCapture(e.pointerId);
    dragging.current = true;
    setControlsEnabled(false);
    document.body.style.cursor = "grabbing";
    onPointerMove(e);
  }

  function onPointerMove(e: ThreeEvent<PointerEvent>) {
    const g = groupRef.current;
    if (!dragging.current || !g) return;
    e.stopPropagation();
    const point = pointerOnTable(e);
    if (!point) return;

    const x = point.x + grabOffset.current.x;
    const z = point.z + grabOffset.current.z;
    const radius = Math.hypot(x, z);
    const scale = radius > MAX_GLASS_RADIUS ? MAX_GLASS_RADIUS / radius : 1;
    g.position.set(x * scale, TABLE_TOP_Y + LIFT, z * scale);

    const now = performance.now();
    if (now - lastSent.current >= SEND_INTERVAL_MS) {
      lastSent.current = now;
      onMove({ x: g.position.x, z: g.position.z });
    }
  }

  function onPointerUp(e: ThreeEvent<PointerEvent>) {
    if (!dragging.current) return;
    e.stopPropagation();
    (e.target as unknown as Element).releasePointerCapture(e.pointerId);
    dragging.current = false;
    setControlsEnabled(true);
    document.body.style.cursor = draggable ? "grab" : "";
    onMove(null);
  }

  const rest = glassRestPosition(angle);

  return (
    <group ref={groupRef} position={[rest.x, TABLE_TOP_Y, rest.z]}>
      <Glass key={guest.drink} drink={guest.drink} scale={GLASS_SCALE} levelRef={level} />

      {isMe && (
        <>
          <mesh ref={hintRef} rotation-x={-Math.PI / 2} position-y={0.005} visible={false}>
            <ringGeometry args={[0.2, 0.26, 40]} />
            <meshBasicMaterial color="#fcd34d" transparent opacity={0.5} depthWrite={false} />
          </mesh>
          {/* Nevidljiva, veća zona za hvatanje — tanku čašu je teško pogoditi prstom */}
          <mesh
            position-y={0.45}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerOver={() => draggable && (document.body.style.cursor = "grab")}
            onPointerOut={() => !dragging.current && (document.body.style.cursor = "")}
          >
            <cylinderGeometry args={[0.32, 0.32, 1, 12]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </>
      )}
    </group>
  );
}
