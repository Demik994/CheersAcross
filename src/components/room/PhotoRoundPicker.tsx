"use client";

import { MAX_PHOTO_ROUND } from "@/lib/party/protocol";

type Props = {
  /** Broj završenih zdravica */
  round: number;
  photoRound: number;
  onChange: (photoRound: number) => void;
};

/** Domaćin bira u kojoj se zdravici (samo toj jednoj) otkriva slika slavlja */
export default function PhotoRoundPicker({ round, photoRound, onChange }: Props) {
  const nextRound = round + 1;
  const alreadyPassed = photoRound < nextRound;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5">
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="text-sm">
          Otkrij sliku u <span className="font-semibold text-amber-200">{photoRound}.</span> zdravici
        </span>
        <span className={`text-[11px] ${alreadyPassed ? "text-amber-300" : "text-foreground/50"}`}>
          {alreadyPassed ? `Ta je zdravica prošla — sljedeća je ${nextRound}.` : `Sljedeća je ${nextRound}. zdravica`}
        </span>
      </div>
      <button
        type="button"
        aria-label="Ranije"
        disabled={photoRound <= 1}
        onClick={() => onChange(photoRound - 1)}
        className="size-9 shrink-0 rounded-lg bg-white/10 text-lg font-bold active:bg-white/20 disabled:opacity-30"
      >
        −
      </button>
      <button
        type="button"
        aria-label="Kasnije"
        disabled={photoRound >= MAX_PHOTO_ROUND}
        onClick={() => onChange(photoRound + 1)}
        className="size-9 shrink-0 rounded-lg bg-white/10 text-lg font-bold active:bg-white/20 disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}
