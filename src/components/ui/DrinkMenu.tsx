"use client";

import { useState } from "react";
import {
  DRINK_CATEGORIES,
  DRINK_IDS,
  DRINKS,
  servingLabel,
  standardDrinks,
  type DrinkCategory,
  type DrinkId,
} from "@/lib/drinks";

type Props = {
  value: DrinkId;
  onChange: (drink: DrinkId) => void;
};

const emojiFor = (category: DrinkCategory) => DRINK_CATEGORIES.find((c) => c.id === category)?.emoji ?? "🥂";

/**
 * U donjem panelu je samo gumb s trenutnim pićem (da panel ne pokriva stol na mobitelu);
 * klik otvara meni s kategorijama.
 */
export default function DrinkMenu({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const current = DRINKS[value];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-12 w-full items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-3 text-left active:bg-white/10"
      >
        <span className="text-2xl" aria-hidden>
          {emojiFor(current.category)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate font-semibold">{current.label}</span>
          <span className="truncate text-xs text-foreground/55">{servingLabel(current)}</span>
        </span>
        <span className="shrink-0 text-sm font-medium text-amber-200">Meni pića ▸</span>
      </button>

      {open && (
        <DrinkMenuSheet
          value={value}
          onClose={() => setOpen(false)}
          onSelect={(id) => {
            onChange(id);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function DrinkMenuSheet({
  value,
  onSelect,
  onClose,
}: {
  value: DrinkId;
  onSelect: (id: DrinkId) => void;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<DrinkCategory>(DRINKS[value].category);
  const drinks = DRINK_IDS.filter((id) => DRINKS[id].category === category);

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Meni pića"
        className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-3xl border border-white/10 bg-stone-900 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between px-4">
          <h2 className="text-lg font-semibold">Meni pića</h2>
          <button type="button" onClick={onClose} aria-label="Zatvori" className="size-10 rounded-full text-xl active:bg-white/10">
            ✕
          </button>
        </div>

        <div role="tablist" className="grid grid-cols-5 gap-1 px-3">
          {DRINK_CATEGORIES.map((c) => {
            const selected = c.id === category;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setCategory(c.id)}
                className={`flex min-w-0 flex-col items-center gap-0.5 rounded-xl px-0.5 py-2 text-[11px] font-medium ${
                  selected ? "bg-amber-300/15 text-amber-100 ring-1 ring-amber-300/60" : "text-foreground/65 active:bg-white/5"
                }`}
              >
                <span className="text-2xl leading-none" aria-hidden>
                  {c.emoji}
                </span>
                {c.label}
              </button>
            );
          })}
        </div>

        <ul role="radiogroup" className="mt-3 grid grid-cols-2 gap-2 overflow-y-auto px-3 pb-1">
          {drinks.map((id) => {
            const drink = DRINKS[id];
            const selected = id === value;
            // Jačina porcije (0 = bez alkohola, puna traka ≈ 2,5 standardna pića)
            const strength = Math.min(standardDrinks(drink) / 2.5, 1);
            return (
              <li key={id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onSelect(id)}
                  className={`flex h-full w-full flex-col gap-1 rounded-2xl border p-3 text-left ${
                    selected ? "border-amber-300/80 bg-amber-300/10" : "border-white/10 bg-white/[0.04] active:bg-white/10"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="size-3 shrink-0 rounded-full ring-1 ring-white/30"
                      style={{ backgroundColor: drink.liquidColor }}
                      aria-hidden
                    />
                    <span className="truncate font-semibold">{drink.label}</span>
                  </span>
                  <span className="text-xs text-foreground/55">{servingLabel(drink)}</span>
                  <span className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-white/10" aria-hidden>
                    <span className="block h-full rounded-full bg-amber-300/80" style={{ width: `${strength * 100}%` }} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
