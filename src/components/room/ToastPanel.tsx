"use client";

import type { LiveInfo } from "@/hooks/useLiveRoom";
import type { PublicGuest } from "@/lib/rooms/types";

type Props = {
  guests: PublicGuest[];
  meId: string;
  live: LiveInfo | null;
  connected: boolean;
  onReady: (ready: boolean) => void;
};

/** "Nazdravi!" gumb i stanje spremnosti — nazdravljanje kreće tek kad su svi spremni */
export default function ToastPanel({ guests, meId, live, connected, onReady }: Props) {
  if (!live || !connected) {
    return (
      <div className="flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm text-foreground/60">
        Spajanje sa stolom…
      </div>
    );
  }

  if (live.phase === "toasting") {
    return (
      <div className="rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-center text-sm font-medium text-amber-100">
        🥂 Svi su spremni! Povuci svoju čašu i kucni se s ostalima.
      </div>
    );
  }

  const imReady = live.ready.has(meId);
  const readyCount = guests.filter((g) => live.ready.has(g.id)).length;
  const waitingFor = guests.filter((g) => !live.ready.has(g.id) && g.id !== meId);

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => onReady(!imReady)}
        className={`h-12 w-full rounded-xl text-base font-semibold transition-colors ${
          imReady
            ? "border border-amber-300/60 bg-amber-300/15 text-amber-100 active:bg-amber-300/25"
            : "bg-amber-300 text-stone-900 active:bg-amber-200"
        }`}
      >
        {imReady ? `✓ Spreman si · ${readyCount}/${guests.length}` : `🥂 Nazdravi! · ${readyCount}/${guests.length}`}
      </button>
      {waitingFor.length > 0 && (
        <p className="truncate text-center text-xs text-foreground/55">
          Čekamo:{" "}
          {waitingFor.map((g, i) => (
            <span key={g.id}>
              {i > 0 && ", "}
              {g.name}
              {!live.online.has(g.id) && " 💤"}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
