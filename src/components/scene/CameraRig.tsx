"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, type PerspectiveCamera } from "three";
import { PHOTO_CENTER_Y, PHOTO_SIZE } from "./CelebrationPhoto";

/** Dio OrbitControls API-ja koji nam treba (drei ih registrira kao `state.controls`) */
type Controls = {
  enabled: boolean;
  minDistance: number;
  maxDistance: number;
  target: Vector3;
  update: () => void;
};

// Iza i iznad "mog" lika, tako da se vidi cijeli stol i svi gosti u krugu
export const DEFAULT_CAMERA_POSITION: [number, number, number] = [0, 3.9, 7.2];
// Cilj ispod razine stola gura stol prema gore u kadru — donji dio ekrana pokriva UI panel
export const DEFAULT_TARGET: [number, number, number] = [0, -0.35, 0];

const NORMAL_LIMITS = { minDistance: 2.5, maxDistance: 9 };
const REVEAL_LIMITS = { minDistance: 1.2, maxDistance: 9 };
/** Blagi pogled odozgo na sliku (radijani) */
const REVEAL_ELEVATION = 0.18;
const FIT_HEIGHT = 0.6;
const FIT_WIDTH = 0.9;

/**
 * Kad se slika otkrije, kamera doleti do nje (zadržava smjer iz kojeg
 * je gost gledao). Kad se otkrivanje ugasi, vraća se na početni kadar.
 * Za vrijeme leta OrbitControls su isključeni da se ne "tuku" s animacijom.
 */
export default function CameraRig({ revealed }: { revealed: boolean }) {
  const get = useThree((state) => state.get);
  const flight = useRef<{ position: Vector3; target: Vector3; revealed: boolean } | null>(null);
  const firstRun = useRef(true);

  useEffect(() => {
    // Ne animiramo kod prvog rendera — kamera je već na početnom kadru
    if (firstRun.current) {
      firstRun.current = false;
      if (!revealed) return;
    }

    const { camera, size } = get();
    if (!revealed) {
      flight.current = {
        position: new Vector3(...DEFAULT_CAMERA_POSITION),
        target: new Vector3(...DEFAULT_TARGET),
        revealed: false,
      };
      return;
    }

    const cam = camera as PerspectiveCamera;
    const aspect = size.width / size.height;
    const halfFovTan = Math.tan((cam.fov * Math.PI) / 360);
    const half = PHOTO_SIZE / 2 + 0.08;
    // Slika smije zauzeti najviše 60% visine (naslov gore, panel dolje) i 90% širine ekrana
    const distance = Math.max(half / (halfFovTan * FIT_HEIGHT), half / (halfFovTan * aspect * FIT_WIDTH));
    // Kamera gleda malo ispod slike, pa slika u kadru sjedne iznad donjeg panela
    const viewHeight = 2 * distance * halfFovTan;

    const target = new Vector3(0, PHOTO_CENTER_Y - viewHeight * 0.07, 0);
    const azimuth = Math.atan2(cam.position.x, cam.position.z);
    const position = new Vector3(
      Math.sin(azimuth) * Math.cos(REVEAL_ELEVATION),
      Math.sin(REVEAL_ELEVATION),
      Math.cos(azimuth) * Math.cos(REVEAL_ELEVATION),
    )
      .multiplyScalar(distance)
      .add(target);

    flight.current = { position, target, revealed: true };
  }, [revealed, get]);

  useFrame((state, delta) => {
    const controls = state.controls as unknown as Controls | null;
    const goal = flight.current;
    if (!controls || !goal) return;

    const limits = goal.revealed ? REVEAL_LIMITS : NORMAL_LIMITS;
    controls.enabled = false;
    controls.minDistance = Math.min(limits.minDistance, controls.minDistance);

    const k = 1 - Math.exp(-3 * delta);
    state.camera.position.lerp(goal.position, k);
    controls.target.lerp(goal.target, k);

    const arrived =
      state.camera.position.distanceTo(goal.position) < 0.01 &&
      controls.target.distanceTo(goal.target) < 0.01;
    if (arrived) {
      state.camera.position.copy(goal.position);
      controls.target.copy(goal.target);
      controls.minDistance = limits.minDistance;
      controls.maxDistance = limits.maxDistance;
      controls.enabled = true;
      flight.current = null;
    }
    controls.update();
  });

  return null;
}
