"use client";

import { useState } from "react";
import type { LiveInfo } from "@/hooks/useLiveRoom";
import { DRUNK_LEVELS, drunkLevel } from "@/lib/drunk";
import type { PublicGuest } from "@/lib/rooms/types";

type Props = {
  guests: PublicGuest[];
  meId: string;
  isHost: boolean;
  live: LiveInfo | null;
  onKick: (guest: PublicGuest) => Promise<void>;
  onClose: () => void;
};

/** Popis gostiju: tko je spojen, tko je spreman; domaćin može ukloniti gosta */
export default function GuestListSheet({ guests, meId, isHost, live, onKick, onClose }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function kick(guest: PublicGuest) {
    if (!window.confirm(`Ukloniti ${guest.name} iz sobe?`)) return;
    setError(null);
    setBusyId(guest.id);
    try {
      await onKick(guest);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Uklanjanje nije uspjelo.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Gosti"
        className="w-full max-w-md rounded-t-3xl border border-white/10 bg-stone-900 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Gosti ({guests.length})</h2>
          <button type="button" onClick={onClose} aria-label="Zatvori" className="size-10 rounded-full text-xl active:bg-white/10">
            ✕
          </button>
        </div>

        <ul className="flex max-h-[60dvh] flex-col gap-1 overflow-y-auto">
          {guests.map((guest) => {
            const online = live === null || live.online.has(guest.id);
            const ready = live?.ready.has(guest.id) ?? false;
            const drinks = live?.intoxication.get(guest.id) ?? 0;
            const level = DRUNK_LEVELS[drunkLevel(drinks)];
            return (
              <li key={guest.id} className="flex min-h-12 items-center gap-3 rounded-xl px-2 py-1.5">
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: guest.color }} aria-hidden />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">
                    {guest.isHost && "👑 "}
                    {guest.name}
                    {guest.id === meId && <span className="font-normal text-foreground/50"> (ti)</span>}
                  </span>
                  <span className={`text-xs ${online ? "text-emerald-300/80" : "text-foreground/45"}`}>
                    {online ? "spojen" : "💤 nije spojen"}
                    {ready && " · 🥂 spreman"}
                    {drinks > 0 && (
                      <span className="text-foreground/55">
                        {" · "}
                        {level.emoji} {level.label} ({drinks.toLocaleString("hr", { maximumFractionDigits: 1 })})
                      </span>
                    )}
                  </span>
                </div>
                {isHost && guest.id !== meId && (
                  <button
                    type="button"
                    disabled={busyId === guest.id}
                    onClick={() => void kick(guest)}
                    className="h-9 shrink-0 rounded-lg border border-red-300/30 px-3 text-sm text-red-200 active:bg-red-500/10 disabled:opacity-50"
                  >
                    Ukloni
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {error && (
          <p role="alert" className="mt-2 text-sm text-red-300">
            {error}
          </p>
        )}
        {isHost && (
          <p className="mt-3 text-xs text-foreground/45">
            Nazdravljanje čeka sve goste. Ako je netko otišao, ukloni ga da ostali mogu nazdraviti.
          </p>
        )}
      </div>
    </div>
  );
}
