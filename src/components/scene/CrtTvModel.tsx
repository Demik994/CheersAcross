"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CanvasTexture, ExtrudeGeometry, SRGBColorSpace, Shape, type Group, type Texture } from "three";

/**
 * Stari CRT televizor. Jedinice modela: ekran je 2 × 2 sa sredinom u (0, 0, 0),
 * prednja strana kućišta je na z = 0 — tu se "lijepi" YouTube player.
 */
export const CRT = {
  halfWidth: 1.18,
  top: 1.18,
  bottom: -1.52,
  feet: 0.08,
  depth: 0.9,
  stripY: -1.29,
  nameplate: { left: -1.0, right: 0.34, halfHeight: 0.13 },
  lampX: 0.48,
  knobs: [0.7, 0.98],
  knobRadius: 0.12,
  antennaLength: 0.55,
  antennaSpread: 0.42,
} as const;

/** Kutovi ekrana (gore lijevo, gore desno, dolje desno, dolje lijevo) */
export const SCREEN_CORNERS: readonly (readonly [number, number])[] = [
  [-1, 1],
  [1, 1],
  [1, -1],
  [-1, -1],
];

export type CrtLamp = "playing" | "paused";

const LAMP_COLOR: Record<CrtLamp, string> = { playing: "#4ade80", paused: "#fbbf24" };
const WOOD = "#6e4122";
const PLASTIC = "#26221f";
const SILVER = "#b9b4aa";

function roundedRect(shape: Shape, halfW: number, halfH: number, r: number) {
  shape.moveTo(-halfW + r, -halfH);
  shape.lineTo(halfW - r, -halfH);
  shape.quadraticCurveTo(halfW, -halfH, halfW, -halfH + r);
  shape.lineTo(halfW, halfH - r);
  shape.quadraticCurveTo(halfW, halfH, halfW - r, halfH);
  shape.lineTo(-halfW + r, halfH);
  shape.quadraticCurveTo(-halfW, halfH, -halfW, halfH - r);
  shape.lineTo(-halfW, -halfH + r);
  shape.quadraticCurveTo(-halfW, -halfH, -halfW + r, -halfH);
  return shape;
}

/** Srebrni okvir oko ekrana: zaobljeni pravokutnik s rupom, malo izbočen */
const TRIM_GEOMETRY = (() => {
  const outer = roundedRect(new Shape(), 1.1, 1.1, 0.2);
  outer.holes.push(roundedRect(new Shape(), 1.0, 1.0, 0.12));
  return new ExtrudeGeometry(outer, {
    depth: 0.03,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 3,
    curveSegments: 8,
  });
})();

type Props = {
  lamp: CrtLamp;
  title: string;
  /** naslovna slika videa na ekranu (ispod pravog playera) */
  thumbnail: Texture | null;
  onBody: () => void;
  onKnob: (knob: "menu" | "power") => void;
};

/** Naslov pjesme kao tekstura natpisne pločice (jantarni "LCD") */
function useTitleTexture(title: string, paused: boolean) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 100;
    const context = canvas.getContext("2d");
    if (context) {
      context.fillStyle = "#0d0c0b";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#fbbf24";
      context.font = "600 46px ui-monospace, Menlo, Consolas, monospace";
      context.textBaseline = "middle";
      let text = `${paused ? "❚❚" : "♪"} ${title}`;
      const maxWidth = canvas.width - 36;
      if (context.measureText(text).width > maxWidth) {
        while (text.length > 1 && context.measureText(`${text}…`).width > maxWidth) text = text.slice(0, -1);
        text = `${text.trimEnd()}…`;
      }
      context.fillText(text, 18, canvas.height / 2 + 2);
    }
    const result = new CanvasTexture(canvas);
    result.colorSpace = SRGBColorSpace;
    result.anisotropy = 4;
    return result;
  }, [title, paused]);

  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

export default function CrtTvModel({ lamp, title, thumbnail, onBody, onKnob }: Props) {
  const titleTexture = useTitleTexture(title, lamp === "paused");
  const cabinetHeight = CRT.top - CRT.bottom;
  const cabinetY = (CRT.top + CRT.bottom) / 2;
  const nameplateWidth = CRT.nameplate.right - CRT.nameplate.left;

  const click = (knob: "menu" | "power") => (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onKnob(knob);
  };
  const bodyClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onBody();
  };

  return (
    <group>
      {/* drveno kućište */}
      <RoundedBox
        args={[CRT.halfWidth * 2, cabinetHeight, CRT.depth]}
        radius={0.08}
        smoothness={3}
        position={[0, cabinetY, -CRT.depth / 2]}
        onClick={bodyClick}
      >
        <meshStandardMaterial color={WOOD} roughness={0.55} fog={false} />
      </RoundedBox>

      {/* tamna prednja ploča */}
      <mesh position={[0, cabinetY, 0.004]}>
        <planeGeometry args={[CRT.halfWidth * 2 - 0.14, cabinetHeight - 0.14]} />
        <meshStandardMaterial color={PLASTIC} roughness={0.7} fog={false} />
      </mesh>

      {/* ekran (iza YouTube playera) i okvir */}
      <mesh position={[0, 0, 0.01]} onClick={bodyClick}>
        <planeGeometry args={[2.04, 2.04]} />
        <meshBasicMaterial color="#050505" fog={false} />
      </mesh>
      {thumbnail && (
        <mesh position={[0, 0, 0.012]}>
          <planeGeometry args={[2, 1.125]} />
          <meshBasicMaterial map={thumbnail} toneMapped={false} fog={false} />
        </mesh>
      )}
      <mesh geometry={TRIM_GEOMETRY} position={[0, 0, 0.006]}>
        <meshStandardMaterial color={SILVER} metalness={0.45} roughness={0.35} fog={false} />
      </mesh>

      {/* natpisna pločica s naslovom, lampica i gumbi */}
      <mesh
        position={[(CRT.nameplate.left + CRT.nameplate.right) / 2, CRT.stripY, 0.036]}
        onClick={(event) => {
          event.stopPropagation();
          onKnob("menu");
        }}
      >
        <planeGeometry args={[nameplateWidth, CRT.nameplate.halfHeight * 2]} />
        <meshBasicMaterial map={titleTexture} toneMapped={false} fog={false} />
      </mesh>
      <mesh position={[CRT.lampX, CRT.stripY, 0.03]}>
        <sphereGeometry args={[0.035, 16, 12]} />
        <meshStandardMaterial color={LAMP_COLOR[lamp]} emissive={LAMP_COLOR[lamp]} emissiveIntensity={1.6} fog={false} />
      </mesh>
      {CRT.knobs.map((x, i) => (
        <group key={x} position={[x, CRT.stripY, 0.05]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[CRT.knobRadius, CRT.knobRadius * 1.1, 0.1, 24]} />
            <meshStandardMaterial color={SILVER} metalness={0.5} roughness={0.3} fog={false} />
          </mesh>
          <mesh position={[0, CRT.knobRadius * 0.45, 0.052]}>
            <boxGeometry args={[0.025, CRT.knobRadius * 0.8, 0.01]} />
            <meshStandardMaterial color="#1c1a18" fog={false} />
          </mesh>
          {/* nevidljiva veća površina za dodir */}
          <mesh position={[0, 0, 0.06]} onClick={click(i === 0 ? "menu" : "power")}>
            <circleGeometry args={[0.16, 16]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
      ))}

      {/* stražnji "trbuh" katodne cijevi */}
      <group position={[0, 0.02, -CRT.depth - 0.36]} rotation={[-Math.PI / 2, 0, 0]}>
        <mesh rotation={[0, Math.PI / 4, 0]}>
          <cylinderGeometry args={[0.78, 1.42, 0.72, 4]} />
          <meshStandardMaterial color={PLASTIC} roughness={0.8} flatShading fog={false} />
        </mesh>
      </group>

      {/* nožice */}
      {[-0.8, 0.8].map((x) => (
        <mesh key={x} position={[x, CRT.bottom - CRT.feet / 2, -CRT.depth / 2]}>
          <boxGeometry args={[0.3, CRT.feet, 0.5]} />
          <meshStandardMaterial color="#1a1716" fog={false} />
        </mesh>
      ))}

      <group position={[0, CRT.top, -0.55]}>
        <mesh>
          <sphereGeometry args={[0.1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#1a1716" roughness={0.5} fog={false} />
        </mesh>
        <AntennaRod direction={1} speed={1.3} phase={0} />
        <AntennaRod direction={-1} speed={1.1} phase={1.2} />
      </group>
    </group>
  );
}

/** "Zečje uši" koje se lagano njišu */
function AntennaRod({ direction, speed, phase }: { direction: 1 | -1; speed: number; phase: number }) {
  const ref = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.z = direction * CRT.antennaSpread + Math.sin(clock.elapsedTime * speed + phase) * 0.05;
  });

  return (
    <group ref={ref} position={[0, 0.06, 0]} rotation={[0, 0, direction * CRT.antennaSpread]}>
      <mesh position={[0, CRT.antennaLength / 2, 0]}>
        <cylinderGeometry args={[0.012, 0.016, CRT.antennaLength, 8]} />
        <meshStandardMaterial color={SILVER} metalness={0.6} roughness={0.25} fog={false} />
      </mesh>
      <mesh position={[0, CRT.antennaLength, 0]}>
        <sphereGeometry args={[0.03, 12, 8]} />
        <meshStandardMaterial color={SILVER} metalness={0.6} roughness={0.25} fog={false} />
      </mesh>
    </group>
  );
}
