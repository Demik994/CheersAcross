"use client";

import { useEffect, useRef, type CSSProperties } from "react";

const SIZE = 72;
const FRAME_MS = 60;

/** "Snijeg" na ekranu dok video ne krene (samo dok YouTube ništa ne pušta) */
export default function StaticNoise({ style, label }: { style: CSSProperties; label?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const image = context.createImageData(SIZE, SIZE);
    const draw = () => {
      const data = image.data;
      for (let i = 0; i < data.length; i += 4) {
        const v = Math.random() * 255;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
      context.putImageData(image, 0, 0);
    };
    draw();
    const timer = setInterval(draw, FRAME_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="pointer-events-none absolute overflow-hidden rounded-[12px]" style={style} aria-hidden>
      <canvas ref={canvasRef} width={SIZE} height={SIZE} className="size-full opacity-70" />
      {label && (
        <span className="absolute inset-x-3 top-1/2 -translate-y-1/2 rounded bg-black/75 px-2 py-1 text-center font-mono text-[11px] leading-tight text-stone-100">
          {label}
        </span>
      )}
    </div>
  );
}
