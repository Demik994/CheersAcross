"use client";

import dynamic from "next/dynamic";
import { AVATAR_IDS, AVATARS, SKIN_TONES, type AvatarId } from "@/lib/avatars";
import type { Look } from "@/lib/roomApi";

// 3D pregled se učitava zasebno (Three.js), da forma bude odmah upotrebljiva
const AvatarPreviewCanvas = dynamic(() => import("./AvatarPreviewCanvas"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-xs text-foreground/40">Učitavanje lika…</div>,
});

export const DEFAULT_LOOK: Look = { avatar: "m1", skin: 1 };

type Props = {
  value: Look;
  onChange: (look: Look) => void;
  /** Boja odjeće u pregledu (u sobi je to boja gosta) */
  previewColor?: string;
};

export default function AvatarPicker({ value, onChange, previewColor = "#e4572e" }: Props) {
  const gender = AVATARS[value.avatar].gender;
  const options = AVATAR_IDS.filter((id) => AVATARS[id].gender === gender);

  function switchGender(next: "m" | "f") {
    if (next === gender) return;
    // Zadrži "isti redni broj" lika (m2 -> f2)
    const index = options.indexOf(value.avatar);
    const nextOptions = AVATAR_IDS.filter((id) => AVATARS[id].gender === next);
    onChange({ ...value, avatar: nextOptions[Math.max(0, index)] as AvatarId });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="h-40 overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_50%_40%,#4a2e1c_0%,#1f150f_75%)]">
        <AvatarPreviewCanvas look={value} color={previewColor} />
      </div>

      <div role="radiogroup" aria-label="Spol lika" className="grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1">
        {(["m", "f"] as const).map((g) => (
          <button
            key={g}
            type="button"
            role="radio"
            aria-checked={gender === g}
            onClick={() => switchGender(g)}
            className={`h-10 rounded-lg text-sm font-semibold ${gender === g ? "bg-amber-300 text-stone-900" : "text-foreground/70 active:bg-white/10"}`}
          >
            {g === "m" ? "Muško" : "Žensko"}
          </button>
        ))}
      </div>

      <div role="radiogroup" aria-label="Lik" className="grid grid-cols-2 gap-2">
        {options.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value.avatar === id}
            onClick={() => onChange({ ...value, avatar: id })}
            className={`h-11 truncate rounded-xl border px-2 text-sm ${
              value.avatar === id
                ? "border-amber-300/80 bg-amber-300/10 font-semibold text-amber-100"
                : "border-white/10 bg-white/[0.04] text-foreground/80 active:bg-white/10"
            }`}
          >
            {AVATARS[id].label}
          </button>
        ))}
      </div>

      <div role="radiogroup" aria-label="Boja kože" className="flex items-center justify-between gap-2 px-1">
        <span className="text-sm text-foreground/70">Boja kože</span>
        <div className="flex gap-2">
          {SKIN_TONES.map((tone, i) => (
            <button
              key={tone}
              type="button"
              role="radio"
              aria-checked={value.skin === i}
              aria-label={`Boja kože ${i + 1}`}
              onClick={() => onChange({ ...value, skin: i })}
              className={`size-9 rounded-full ring-offset-2 ring-offset-stone-900 ${value.skin === i ? "ring-2 ring-amber-300" : "ring-1 ring-white/20"}`}
              style={{ backgroundColor: tone }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
