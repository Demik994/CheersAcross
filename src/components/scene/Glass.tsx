"use client";

import { useRef, type RefObject } from "react";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { DoubleSide, MathUtils, type Group, type Mesh } from "three";
import { DRINKS, normalizeDrinkId, type Drink, type DrinkId, type Garnish } from "@/lib/drinks";
import { getGlassGeometry, type GlassGeometryData } from "./glassShapes";

const SEGMENTS = 48;

type GlassProps = ThreeElements["group"] & {
  drink: DrinkId;
  /** Razina pića 0..1 (1 = puna čaša); čita se svaki frame, za animaciju pijenja */
  levelRef?: RefObject<number>;
};

/** Ukrasi koji su "u piću" i nestaju dok se pije; ostali (slamka, voće, sol) ostaju */
const DRAINING = new Set<Garnish>(["foam", "bubbles", "ice", "mint"]);

/** Čaša s pićem. Kad se promijeni `drink`, roditelj je remounta (key) pa "iskoči". */
export default function Glass({ drink, levelRef, ...groupProps }: GlassProps) {
  const config = DRINKS[normalizeDrinkId(drink)];
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

  const drainingGarnish = config.garnish.filter((g) => DRAINING.has(g));
  const fixedGarnish = config.garnish.filter((g) => !DRAINING.has(g));

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
              {drainingGarnish.map((g) => (
                <GarnishMesh key={g} type={g} geo={geo} drink={config} />
              ))}
            </group>
          </group>

          {fixedGarnish.map((g) => (
            <GarnishMesh key={g} type={g} geo={geo} drink={config} />
          ))}
          {config.glass === "beer" && <MugHandle geo={geo} />}

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

const FRUIT_COLORS: Record<string, string> = { lime: "#9ccc3a", lemon: "#f3dd4a", orange: "#ff9a2e" };

function GarnishMesh({ type, geo, drink }: { type: Garnish; geo: GlassGeometryData; drink: Drink }) {
  const rimRadius = geo.rim.x;
  const liquidHeight = geo.surfaceY - geo.bottomY;

  switch (type) {
    case "foam":
      return (
        <mesh position={[0, geo.surfaceY + 0.028, 0]} renderOrder={1}>
          <cylinderGeometry args={[geo.surfaceRadius, geo.surfaceRadius * 0.98, 0.056, 32]} />
          <meshStandardMaterial color={drink.foamColor ?? "#fff4dc"} roughness={0.9} />
        </mesh>
      );

    case "bubbles":
      return <Bubbles bottom={geo.bottomY + 0.02} top={geo.surfaceY - 0.01} radius={geo.surfaceRadius * 0.6} />;

    case "ice": {
      // Kocke leda pri površini, veličina prema širini čaše
      const size = Math.min(0.075, geo.surfaceRadius * 0.55);
      const offsets: [number, number, number][] = [
        [-0.35, -0.2, 0.3],
        [0.3, -0.45, -0.25],
        [0.05, -0.9, 0.05],
      ];
      return (
        <>
          {offsets.map(([ox, oy, oz], i) => (
            <mesh
              key={i}
              position={[ox * geo.surfaceRadius, Math.max(geo.surfaceY + oy * size, geo.bottomY + size), oz * geo.surfaceRadius]}
              rotation={[0.3 * i, 0.7 * i, 0.2]}
              renderOrder={1}
            >
              <boxGeometry args={[size, size, size]} />
              <meshPhysicalMaterial color="#eaf6ff" roughness={0.1} transparent opacity={0.55} />
            </mesh>
          ))}
        </>
      );
    }

    case "mint":
      return (
        <>
          {[0, 1, 2].map((i) => (
            <mesh
              key={i}
              position={[Math.cos(i * 2.1) * geo.surfaceRadius * 0.45, geo.surfaceY - 0.01, Math.sin(i * 2.1) * geo.surfaceRadius * 0.45]}
              rotation={[0.4, i, 0.3]}
              scale={[1, 0.25, 0.6]}
              renderOrder={1}
            >
              <sphereGeometry args={[0.035, 10, 6]} />
              <meshStandardMaterial color="#3f9b3a" roughness={0.6} />
            </mesh>
          ))}
        </>
      );

    case "straw": {
      const length = liquidHeight + (geo.rim.y - geo.surfaceY) + 0.3;
      return (
        <mesh position={[rimRadius * 0.35, geo.bottomY + length / 2, 0]} rotation-z={-0.18}>
          <cylinderGeometry args={[0.012, 0.012, length, 10]} />
          <meshStandardMaterial color="#ffffff" roughness={0.4} />
        </mesh>
      );
    }

    case "lime":
    case "lemon":
    case "orange": {
      // Kriška zataknuta na rub čaše
      const radius = Math.min(0.08, Math.max(0.05, rimRadius * 0.5));
      return (
        <mesh position={[rimRadius - 0.01, geo.rim.y, 0]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[radius, radius, 0.014, 20]} />
          <meshStandardMaterial color={FRUIT_COLORS[type]} roughness={0.6} />
        </mesh>
      );
    }

    case "olive":
      return (
        <>
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

    case "saltRim":
      return (
        <mesh position={[0, geo.rim.y, 0]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[rimRadius + 0.004, 0.012, 6, 40]} />
          <meshStandardMaterial color="#f7f7f2" roughness={1} />
        </mesh>
      );
  }
}

function MugHandle({ geo }: { geo: GlassGeometryData }) {
  return (
    <mesh position={[geo.rim.x + 0.03, 0.42, 0]} rotation-z={-Math.PI / 2}>
      <torusGeometry args={[0.15, 0.028, 12, 24, Math.PI]} />
      <meshPhysicalMaterial color="#ffffff" roughness={0.05} clearcoat={1} transparent opacity={0.35} />
    </mesh>
  );
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
