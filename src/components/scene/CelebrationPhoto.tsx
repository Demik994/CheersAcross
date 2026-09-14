"use client";

import { Component, Suspense, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, useTexture } from "@react-three/drei";
import { MathUtils, SRGBColorSpace, type Group, type Texture } from "three";
import { TABLE_TOP_Y } from "./Table";

/** Najveća dimenzija slike (šira ili viša strana) u jedinicama scene */
export const PHOTO_SIZE = 1.3;
/** Visina sredine slike kad je otkrivena — iznad čaša da ih ne zaklanjaju */
export const PHOTO_CENTER_Y = TABLE_TOP_Y + 1.7;

type Props = {
  url: string | null;
  revealed: boolean;
};

/**
 * Slika razloga slavlja. Skrivena je u sredini stola i "izranja" iznad
 * njega kad je `revealed` (u Fazi 5 to će pokrenuti nazdravljanje).
 * Billboard je okreće prema kameri, pa je svaki gost vidi sprijeda.
 */
export default function CelebrationPhoto({ url, revealed }: Props) {
  if (!url) return null;
  return (
    <PhotoErrorBoundary key={url}>
      <Suspense fallback={null}>
        <RevealingPhoto url={url} revealed={revealed} />
      </Suspense>
    </PhotoErrorBoundary>
  );
}

function RevealingPhoto({ url, revealed }: Props & { url: string }) {
  const texture = useTexture(url, (tex: Texture) => {
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
  });
  const groupRef = useRef<Group>(null);
  const progress = useRef(0);

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    progress.current = MathUtils.damp(progress.current, revealed ? 1 : 0, 3.5, delta);
    const p = progress.current;
    g.visible = p > 0.005;
    g.position.y = MathUtils.lerp(TABLE_TOP_Y, PHOTO_CENTER_Y, p);
    g.scale.setScalar(Math.max(p, 0.001));
  });

  const image = texture.image as { width: number; height: number };
  const aspect = image.width / image.height;
  const width = aspect >= 1 ? PHOTO_SIZE : PHOTO_SIZE * aspect;
  const height = aspect >= 1 ? PHOTO_SIZE / aspect : PHOTO_SIZE;
  const border = 0.05;

  return (
    <group ref={groupRef} visible={false}>
      <Billboard>
        <mesh position-z={-0.012}>
          <boxGeometry args={[width + border * 2, height + border * 2, 0.02]} />
          <meshStandardMaterial color="#c9a45c" roughness={0.35} metalness={0.6} />
        </mesh>
        <mesh>
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
      </Billboard>
    </group>
  );
}

/** Ako se slika ne može učitati, ne rušimo cijelu 3D scenu. */
class PhotoErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Slika slavlja se nije učitala", error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
