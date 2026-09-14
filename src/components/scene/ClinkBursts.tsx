"use client";

import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, type BufferAttribute, type Points } from "three";
import type { ClinkEvent } from "@/hooks/useLiveRoom";
import { TABLE_TOP_Y } from "./Table";

const MAX_BURSTS = 6;
const PARTICLES = 22;
const LIFETIME_MS = 900;
/** Visina kaleža podignute čaše — tu se čaše dodiruju */
const BURST_HEIGHT = TABLE_TOP_Y + 0.62;

// Nasumični smjerovi raspoređeni po sferi (malo više prema gore), isti za svaki prasak
const DIRECTIONS = new Float32Array(PARTICLES * 3);
for (let i = 0; i < PARTICLES; i++) {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(Math.random() * 1.6 - 0.6);
  const speed = 0.35 + Math.random() * 0.45;
  DIRECTIONS[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
  DIRECTIONS[i * 3 + 1] = Math.cos(phi) * speed;
  DIRECTIONS[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * speed;
}

// Stalni spremnici (da ih re-render ne stvara iznova)
const POSITION_BUFFER = new Float32Array(MAX_BURSTS * PARTICLES * 3);
const COLOR_BUFFER = new Float32Array(MAX_BURSTS * PARTICLES * 3);

/**
 * Iskrice na mjestu kucanja. Jedan `Points` objekt za sve praske (jeftino i na mobitelu);
 * čestice blijede prema crnoj uz aditivno miješanje, pa izgledaju kao da se gase.
 * Mora biti unutar TableSpace jer su pozicije kucanja u koordinatama stola.
 */
export default function ClinkBursts({ events }: { events: RefObject<ClinkEvent[]> }) {
  const pointsRef = useRef<Points>(null);

  useFrame(() => {
    const points = pointsRef.current;
    if (!points) return;
    const now = performance.now();
    const active = events.current.filter((e) => now - e.time < LIFETIME_MS).slice(-MAX_BURSTS);
    points.visible = active.length > 0;
    if (active.length === 0) return;

    const positions = points.geometry.attributes.position as BufferAttribute;
    const colors = points.geometry.attributes.color as BufferAttribute;
    for (let b = 0; b < MAX_BURSTS; b++) {
      const event = active[b];
      const t = event ? (now - event.time) / LIFETIME_MS : 1;
      const spread = 1 - (1 - t) * (1 - t); // brzo van, pa usporava
      const fade = event ? (1 - t) * (1 - t) : 0;
      for (let p = 0; p < PARTICLES; p++) {
        const i = b * PARTICLES + p;
        const d = p * 3;
        if (event) {
          positions.setXYZ(
            i,
            event.at.x + DIRECTIONS[d] * spread * 0.5,
            BURST_HEIGHT + DIRECTIONS[d + 1] * spread * 0.5 - t * t * 0.15,
            event.at.z + DIRECTIONS[d + 2] * spread * 0.5,
          );
        } else {
          positions.setXYZ(i, 0, -10, 0);
        }
        colors.setXYZ(i, fade, 0.85 * fade, 0.45 * fade); // topla zlatna iskra
      }
    }
    positions.needsUpdate = true;
    colors.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} frustumCulled={false} visible={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[POSITION_BUFFER, 3]} />
        <bufferAttribute attach="attributes-color" args={[COLOR_BUFFER, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.07} vertexColors transparent depthWrite={false} blending={AdditiveBlending} />
    </points>
  );
}
