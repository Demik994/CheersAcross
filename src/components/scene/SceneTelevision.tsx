"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { SRGBColorSpace, TextureLoader, Vector3, type Group, type Texture } from "three";
import type { ScreenQuad, TvScreenBridge } from "@/lib/tvScreen";
import { youTubeThumbnail } from "@/lib/youtube";
import CrtTvModel, { CRT, SCREEN_CORNERS, type CrtLamp } from "./CrtTvModel";
import { tvPlacement } from "./tvPlacement";

export type SceneTvProps = {
  bridge: TvScreenBridge;
  title: string;
  videoId: string;
  lamp: CrtLamp;
  /** kamera je doletjela do televizora */
  watching: boolean;
  onWatch: () => void;
  onOpen: () => void;
  onPowerOff: () => void;
};

const FEET_OFFSET = CRT.feet - CRT.bottom;
const CORNER = new Vector3();

export default function SceneTelevision({
  bridge,
  title,
  videoId,
  lamp,
  onWatch,
  onOpen,
  onPowerOff,
  hidden,
}: SceneTvProps & { hidden: boolean }) {
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);
  const placement = tvPlacement(width, height);
  const screenRef = useRef<Group>(null);
  const thumbnail = useThumbnail(videoId);

  // Svaki frame: gdje su kutovi ekrana na zaslonu → YouTube player se lijepi na njih
  useFrame((state) => {
    const screen = screenRef.current;
    // Slika slavlja stoji ispred televizora — video bi je prekrio, pa se tada vidi 3D ekran
    if (!screen || hidden) {
      bridge.place(null);
      return;
    }
    state.camera.updateMatrixWorld();
    screen.updateWorldMatrix(true, false);
    const quad: [number, number][] = [];
    for (const [x, y] of SCREEN_CORNERS) {
      CORNER.set(x, y, 0).applyMatrix4(screen.matrixWorld).project(state.camera);
      if (CORNER.z < -1 || CORNER.z > 1) {
        bridge.place(null);
        return;
      }
      quad.push([((CORNER.x + 1) / 2) * state.size.width, ((1 - CORNER.y) / 2) * state.size.height]);
    }
    bridge.place(quad as unknown as ScreenQuad);
  });

  useEffect(() => () => bridge.place(null), [bridge]);

  const { feet, yaw, pitch, scale, standHeight } = placement;
  const cabinetWidth = CRT.halfWidth * 2 * scale;
  const cabinetDepth = CRT.depth * scale;

  return (
    <group position={feet} rotation-y={yaw}>
      {/* drveni ormarić od poda do televizora (ne naginje se) */}
      {standHeight > 0.05 && (
        <mesh position={[0, -standHeight / 2, -cabinetDepth / 2]}>
          <boxGeometry args={[cabinetWidth * 1.08, standHeight, cabinetDepth * 1.3]} />
          <meshStandardMaterial color="#4a2c1a" roughness={0.65} />
        </mesh>
      )}

      {/* TV je malo nagnut unatrag, prema kameri */}
      <group rotation-x={-pitch}>
        <group ref={screenRef} position-y={FEET_OFFSET * scale} scale={scale}>
          <CrtTvModel
            lamp={lamp}
            title={title}
            thumbnail={thumbnail}
            onBody={onWatch}
            onKnob={(knob) => (knob === "power" ? onPowerOff() : onOpen())}
          />
          {/* TV malo osvjetljava prostor ispred sebe */}
          <pointLight position={[0, 0, 1.2]} intensity={1.2} distance={5} color="#9ec5ff" />
        </group>
      </group>
    </group>
  );
}

/** Naslovna slika videa za 3D ekran (vidi se dok je pravi player u kutu) */
function useThumbnail(videoId: string) {
  const [texture, setTexture] = useState<{ videoId: string; texture: Texture } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loaded: Texture | null = null;
    const loader = new TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(youTubeThumbnail(videoId), (result) => {
      result.colorSpace = SRGBColorSpace;
      loaded = result;
      if (cancelled) result.dispose();
      else setTexture({ videoId, texture: result });
    });
    return () => {
      cancelled = true;
      loaded?.dispose();
    };
  }, [videoId]);

  return texture?.videoId === videoId ? texture.texture : null;
}
