"use client";

import { useRef, type RefObject } from "react";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { DoubleSide, MathUtils, type Group, type Mesh } from "three";
import { DRINKS, type DrinkId } from "@/lib/drinks";
import { getGlassGeometry, type GlassGeometryData } from "./glassShapes";

const SEGMENTS = 48;

type GlassProps = ThreeElements["group"] & {
  drink: DrinkId;
  /** Razina pića 0..1 (1 = puna čaša); čita se svaki frame, za animaciju pijenja */
  levelRef?: RefObject<number>;
};

/** Pjena i mjehurići se prazne zajedno s pićem; slamka, limeta i maslina ostaju */
const DRAINING_EXTRAS = new Set(["beer", "flute"]);

/** Čaša s pićem. Kad se promijeni `drink`, roditelj je remounta (key) pa "iskoči". */
export default function Glass({ drink, levelRef, ...groupProps }: GlassProps) {
  const config = DRINKS[drink];
  const geo = getGlassGeometry(config.glass, config.fill);
  const popRef = useRef<Group>(null);
  const drainRef = useRef<Group>(null);

  useFrame((_, delta) => {
    const drain = drainRef.current;
    if (drain && levelRef) {
      const level = Math.max(levelRef.current, 0.001);
      drain.scale.y = level;
      drain.visible = level > 0.02;
    }

    const g = popRef.current;
    if (!g || g.scale.x > 0.999) return;
    const s = MathUtils.damp(g.scale.x, 1, 10, delta);
    g.scale.setScalar(s > 0.999 ? 1 : s);
  });

  const drainingExtras = DRAINING_EXTRAS.has(config.glass);

  return (
    <group {...groupProps}>
      <group ref={popRef} scale={0.6}>
        <group scale={geo.scale}>
          {/* Skaliranje po visini oko dna posude = razina pića pada */}
          <group ref={drainRef} position-y={geo.bottomY}>
            <group position-y={-geo.bottomY}>
              <mesh renderOrder={0}>
                <latheGeometry args={[geo.liquid, SEGMENTS]} />
                <meshStandardMaterial
                  color={config.liquidColor}
                  roughness={0.15}
                  transparent
                  opacity={config.liquidOpacity}
                />
              </mesh>
              {drainingExtras && <GlassExtras type={config.glass} geo={geo} />}
            </group>
          </group>

          {!drainingExtras && <GlassExtras type={config.glass} geo={geo} />}

          {/*
            Staklo bez "transmission" efekta — transmission renderira scenu dvaput
            i previše je skup za slabije mobitele. Prozirnost + clearcoat + env
            refleksije daju dovoljno uvjerljiv izgled.
          */}
          <mesh renderOrder={2}>
            <latheGeometry args={[geo.glass, SEGMENTS]} />
            <meshPhysicalMaterial
              color="#ffffff"
              roughness={0.04}
              clearcoat={1}
              clearcoatRoughness={0.05}
              envMapIntensity={1.6}
              transparent
              opacity={0.22}
              side={DoubleSide}
              depthWrite={false}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function GlassExtras({ type, geo }: { type: string; geo: GlassGeometryData }) {
  switch (type) {
    case "beer":
      return (
        <>
          {/* Pjena */}
          <mesh position={[0, geo.surfaceY + 0.03, 0]} renderOrder={1}>
            <cylinderGeometry args={[geo.surfaceRadius, geo.surfaceRadius, 0.06, 32]} />
            <meshStandardMaterial color="#fff4dc" roughness={0.9} />
          </mesh>
          {/* Ručka krigle */}
          <mesh position={[geo.rim.x + 0.03, 0.42, 0]} rotation-z={-Math.PI / 2}>
            <torusGeometry args={[0.15, 0.028, 12, 24, Math.PI]} />
            <meshPhysicalMaterial color="#ffffff" roughness={0.05} clearcoat={1} transparent opacity={0.35} />
          </mesh>
        </>
      );
    case "flute":
      return <Bubbles bottom={0.5} top={geo.surfaceY - 0.01} radius={geo.surfaceRadius * 0.6} />;
    case "tumbler":
      return (
        // Slamka
        <mesh position={[0.06, 0.55, 0]} rotation-z={-0.22}>
          <cylinderGeometry args={[0.012, 0.012, 0.75, 10]} />
          <meshStandardMaterial color="#ffffff" roughness={0.4} />
        </mesh>
      );
    case "martini":
      return (
        <>
          {/* Kriška limete na rubu */}
          <mesh position={[geo.rim.x - 0.01, geo.rim.y, 0]} rotation-x={Math.PI / 2}>
            <cylinderGeometry args={[0.07, 0.07, 0.014, 20]} />
            <meshStandardMaterial color="#9ccc3a" roughness={0.6} />
          </mesh>
          {/* Maslina na štapiću */}
          <mesh position={[0.05, geo.surfaceY - 0.08, 0]}>
            <sphereGeometry args={[0.035, 16, 12]} />
            <meshStandardMaterial color="#56702a" roughness={0.5} />
          </mesh>
          <mesh position={[0.1, geo.surfaceY + 0.03, 0]} rotation-z={-0.45}>
            <cylinderGeometry args={[0.004, 0.004, 0.32, 6]} />
            <meshStandardMaterial color="#c9a36b" />
          </mesh>
        </>
      );
    default:
      return null;
  }
}

const BUBBLE_COUNT = 8;

function Bubbles({ bottom, top, radius }: { bottom: number; top: number; radius: number }) {
  const refs = useRef<(Mesh | null)[]>([]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    refs.current.forEach((m, i) => {
      if (!m) return;
      const phase = (t * 0.35 + i / BUBBLE_COUNT) % 1;
      m.position.y = bottom + (top - bottom) * phase;
      const angle = i * 2.4;
      m.position.x = Math.cos(angle) * radius * ((i % 3) / 3);
      m.position.z = Math.sin(angle) * radius * ((i % 3) / 3);
    });
  });

  return (
    <>
      {Array.from({ length: BUBBLE_COUNT }, (_, i) => (
        <mesh key={i} ref={(m) => { refs.current[i] = m; }} renderOrder={1}>
          <sphereGeometry args={[0.006, 6, 4]} />
          <meshBasicMaterial color="#fff8e0" transparent opacity={0.8} />
        </mesh>
      ))}
    </>
  );
}
