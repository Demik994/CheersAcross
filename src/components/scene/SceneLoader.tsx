"use client";

import dynamic from "next/dynamic";
import type { ToastSceneProps } from "./ToastScene";

// Three.js treba window/WebGL, pa scenu renderiramo samo na klijentu
// i u zasebnom bundleu (landing HTML dolazi brzo i na sporom mobilnom netu).
const ToastScene = dynamic(() => import("./ToastScene"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-foreground/60">
      Postavljamo stol…
    </div>
  ),
});

export default function SceneLoader(props: ToastSceneProps) {
  return <ToastScene {...props} />;
}
