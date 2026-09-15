"use client";

import { PerspectiveCamera } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { DEFAULT_CAMERA_POSITION } from "./CameraRig";

const BASE_FOV = 40;
const REFERENCE_ASPECT = 1.5;

/**
 * Na uskim (portrait) ekranima proširi vertikalni FOV tako da
 * horizontalni kadar ostane otprilike isti kao na desktopu —
 * inače bi stol na mobitelu bio odrezan sa strane.
 */
export function fovForAspect(aspect: number) {
  if (aspect >= REFERENCE_ASPECT) return BASE_FOV;
  const halfFov = (BASE_FOV * Math.PI) / 360;
  const horizontalHalf = Math.atan(Math.tan(halfFov) * REFERENCE_ASPECT);
  const fov = (Math.atan(Math.tan(horizontalHalf) / aspect) * 360) / Math.PI;
  return Math.min(fov, 75);
}

export default function ResponsiveCamera() {
  const aspect = useThree((state) => state.size.width / state.size.height);

  return (
    <PerspectiveCamera
      makeDefault
      position={DEFAULT_CAMERA_POSITION}
      fov={fovForAspect(aspect)}
      near={0.1}
      far={50}
    />
  );
}
