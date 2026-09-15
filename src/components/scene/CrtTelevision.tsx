"use client";

import { RoundedBox } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { ExtrudeGeometry, Matrix4, Shape, type Group } from "three";
import { CRT, CRT_UNIT_PX, crtLayout, type CrtSide } from "@/components/room/crtLayout";

export type CrtLamp = "playing" | "paused" | "off";

type Props = { side: CrtSide; lamp: CrtLamp };

const LAMP_COLOR: Record<CrtLamp, string> = { playing: "#4ade80", paused: "#fbbf24", off: "#ef4444" };

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

/** Kosa projekcija: točka dublje u ekranu (z < 0) pomakne se u stranu i gore, prednja strana ostaje 1 : 1 */
const SHEAR = {
  1: new Matrix4().set(1, 0, -CRT.shearX, 0, 0, 1, -CRT.shearY, 0, 0, 0, 1, 0, 0, 0, 0, 1),
  [-1]: new Matrix4().set(1, 0, CRT.shearX, 0, 0, 1, -CRT.shearY, 0, 0, 0, 1, 0, 0, 0, 0, 1),
};

const WOOD = "#6e4122";
const PLASTIC = "#26221f";
const SILVER = "#b9b4aa";

export default function CrtTelevision({ side, lamp }: Props) {
  const layout = crtLayout(side);
  // Kamera gleda u sredinu platna; model pomaknemo tako da sredina ekrana padne na layout.centerX/Y
  const offsetX = (layout.centerX - layout.width / 2) / CRT_UNIT_PX;
  const offsetY = (layout.height / 2 - layout.centerY) / CRT_UNIT_PX;
  const cabinetHeight = CRT.top - CRT.bottom;
  const cabinetY = (CRT.top + CRT.bottom) / 2;
  const nameplateWidth = CRT.nameplate.right - CRT.nameplate.left;

  return (
    <Canvas
      orthographic
      // rotation: bez nje R3F okrene kameru prema (0, 0, 0)
      camera={{ zoom: CRT_UNIT_PX, position: [0, 0, 10], rotation: [0, 0, 0], near: 0.1, far: 30 }}
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true }}
      style={{ width: layout.width, height: layout.height, pointerEvents: "none" }}
    >
      <ambientLight intensity={0.9} />
      <directionalLight position={[layout.depthDirection * -3, 4, 5]} intensity={2.2} color="#ffe2bd" />
      <directionalLight position={[layout.depthDirection * 4, 1, -2]} intensity={0.6} color="#a8c4ff" />

      <group position={[offsetX, offsetY, 0]}>
        <group matrixAutoUpdate={false} matrix={SHEAR[layout.depthDirection]}>
          {/* drveno kućište */}
          <RoundedBox
            args={[CRT.halfWidth * 2, cabinetHeight, CRT.depth]}
            radius={0.08}
            smoothness={3}
            position={[0, cabinetY, -CRT.depth / 2]}
          >
            <meshStandardMaterial color={WOOD} roughness={0.55} />
          </RoundedBox>

          {/* tamna prednja ploča */}
          <mesh position={[0, cabinetY, 0.004]}>
            <planeGeometry args={[CRT.halfWidth * 2 - 0.14, cabinetHeight - 0.14]} />
            <meshStandardMaterial color={PLASTIC} roughness={0.7} />
          </mesh>

          {/* ekran (iza YouTube playera) i okvir */}
          <mesh position={[0, 0, 0.01]}>
            <planeGeometry args={[2.04, 2.04]} />
            <meshBasicMaterial color="#050505" />
          </mesh>
          <mesh geometry={TRIM_GEOMETRY} position={[0, 0, 0.006]}>
            <meshStandardMaterial color={SILVER} metalness={0.45} roughness={0.35} />
          </mesh>

          {/* natpisna pločica (tekst je HTML iznad), lampica i gumbi */}
          <mesh position={[(CRT.nameplate.left + CRT.nameplate.right) / 2, CRT.stripY, 0.02]}>
            <boxGeometry args={[nameplateWidth, CRT.nameplate.halfHeight * 2, 0.03]} />
            <meshStandardMaterial color="#0d0c0b" roughness={0.4} />
          </mesh>
          <mesh position={[CRT.lampX, CRT.stripY, 0.03]}>
            <sphereGeometry args={[0.035, 16, 12]} />
            <meshStandardMaterial color={LAMP_COLOR[lamp]} emissive={LAMP_COLOR[lamp]} emissiveIntensity={1.6} />
          </mesh>
          {CRT.knobs.map((x) => (
            <mesh key={x} position={[x, CRT.stripY, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[CRT.knobRadius, CRT.knobRadius * 1.1, 0.1, 24]} />
              <meshStandardMaterial color={SILVER} metalness={0.5} roughness={0.3} />
            </mesh>
          ))}

          {/* stražnji "trbuh" katodne cijevi */}
          <group position={[0, 0.02, -CRT.depth - 0.36]} rotation={[-Math.PI / 2, 0, 0]}>
            <mesh rotation={[0, Math.PI / 4, 0]}>
              <cylinderGeometry args={[0.78, 1.42, 0.72, 4]} />
              <meshStandardMaterial color={PLASTIC} roughness={0.8} flatShading />
            </mesh>
          </group>

          {/* nožice */}
          {[-0.8, 0.8].map((x) => (
            <mesh key={x} position={[x, CRT.bottom - CRT.feet / 2, -CRT.depth / 2]}>
              <boxGeometry args={[0.3, CRT.feet, 0.5]} />
              <meshStandardMaterial color="#1a1716" />
            </mesh>
          ))}

          <Antenna />
        </group>
      </group>
    </Canvas>
  );
}

/** "Zečje uši" koje se lagano njišu */
function Antenna() {
  return (
    <group position={[0, CRT.top, CRT.antennaBaseZ]}>
      <mesh>
        <sphereGeometry args={[0.1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#1a1716" roughness={0.5} />
      </mesh>
      <AntennaRod direction={1} speed={1.3} phase={0} />
      <AntennaRod direction={-1} speed={1.1} phase={1.2} />
    </group>
  );
}

function AntennaRod({ direction, speed, phase }: { direction: 1 | -1; speed: number; phase: number }) {
  const ref = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.z = direction * CRT.antennaSpread + Math.sin(clock.elapsedTime * speed + phase) * 0.05;
  });

  return (
    <group ref={ref} position={[0, 0.06, 0]} rotation={[0, 0, direction * CRT.antennaSpread]}>
      <mesh position={[0, CRT.antennaLength / 2, 0]}>
        <cylinderGeometry args={[0.012, 0.016, CRT.antennaLength, 8]} />
        <meshStandardMaterial color={SILVER} metalness={0.6} roughness={0.25} />
      </mesh>
      <mesh position={[0, CRT.antennaLength, 0]}>
        <sphereGeometry args={[0.03, 12, 8]} />
        <meshStandardMaterial color={SILVER} metalness={0.6} roughness={0.25} />
      </mesh>
    </group>
  );
}
