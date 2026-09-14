"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
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
  return (
    <SceneErrorBoundary>
      <ToastScene {...props} />
    </SceneErrorBoundary>
  );
}

/**
 * Ako WebGL nije dostupan (stari mobitel, isključeno hardversko ubrzanje) ili se
 * 3D scena sruši, ostatak sobe (popis gostiju, "Nazdravi!") i dalje radi.
 */
class SceneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("3D scena se nije mogla prikazati", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-8 pb-40 text-center">
        <div className="text-5xl" aria-hidden>
          🥂
        </div>
        <p className="font-semibold">3D stol se ne može prikazati na ovom uređaju</p>
        <p className="max-w-xs text-sm text-foreground/60">
          Preglednik ne podržava WebGL ili je isključeno hardversko ubrzanje. Pokušaj u Chromeu ili Safariju.
        </p>
      </div>
    );
  }
}
