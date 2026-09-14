"use client";

import { DRINK_IDS, DRINKS, type DrinkId } from "@/lib/drinks";

type Props = {
  value: DrinkId;
  onChange: (drink: DrinkId) => void;
};

export default function DrinkPicker({ value, onChange }: Props) {
  return (
    // Svih 6 pića stane u jedan red i na 360px ekranu — bez skrivenog horizontalnog scrolla
    <div role="radiogroup" aria-label="Odaberi piće" className="grid grid-cols-6 gap-1.5 sm:gap-2">
      {DRINK_IDS.map((id) => {
        const drink = DRINKS[id];
        const selected = id === value;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(id)}
            className={`flex min-w-0 flex-col items-center gap-0.5 rounded-xl border px-0.5 py-2 text-[11px] font-medium transition-colors sm:rounded-2xl sm:text-xs ${
              selected
                ? "border-amber-300/80 bg-amber-200/15 text-amber-100"
                : "border-white/10 bg-white/5 text-foreground/75 active:bg-white/10"
            }`}
          >
            <span className="text-2xl leading-none" aria-hidden>
              {drink.emoji}
            </span>
            {drink.label}
          </button>
        );
      })}
    </div>
  );
}
