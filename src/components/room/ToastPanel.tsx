"use client";

import type { LiveInfo } from "@/hooks/useLiveRoom";
import type { DrinkId } from "@/lib/drinks";
import { DRUNK_LEVELS, SOBERING_DRINK, SOBER_PER_LEMONADE, drunkLevel } from "@/lib/drunk";
import type { PublicGuest } from "@/lib/rooms/types";

type Props = {
  guests: PublicGuest[];
  meId: string;
  isHost: boolean;
  live: LiveInfo | null;
  connected: boolean;
  /** Animacija pijenja je gotova (slika je otkrivena) */
  celebrationShown: boolean;
  /** Moja popijena standardna pića */
  myIntoxication: number;
  myDrink: DrinkId | null;
  onReady: (ready: boolean) => void;
  onNewRound: () => void;
};

function NameList({ guests, live }: { guests: PublicGuest[]; live: LiveInfo }) {
  return (
    <>
      {guests.map((g, i) => (
        <span key={g.id}>
          {i > 0 && ", "}
          {g.name}
          {!live.online.has(g.id) && " 💤"}
        </span>
      ))}
    </>
  );
}

/** Donji panel kroz faze runde: "Nazdravi!" → kucanje → "Živjeli!" */
export default function ToastPanel({
  guests,
  meId,
  isHost,
  live,
  connected,
  celebrationShown,
  myIntoxication,
  myDrink,
  onReady,
  onNewRound,
}: Props) {
  if (!live || !connected) {
    return (
      <div className="flex h-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm text-foreground/60">
        Spajanje sa stolom…
      </div>
    );
  }

  if (live.phase === "revealed") {
    if (!celebrationShown) {
      return (
        <div className="flex h-12 items-center justify-center rounded-xl border border-amber-300/40 bg-amber-300/10 text-sm font-medium text-amber-100">
          Glu glu glu… 🍷
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        <div className="text-center text-2xl font-semibold text-amber-200">Živjeli! 🎉</div>
        {isHost ? (
          <button
            type="button"
            onClick={onNewRound}
            className="h-12 w-full rounded-xl bg-amber-300 text-base font-semibold text-stone-900 active:bg-amber-200"
          >
            🥂 Nazdravi ponovo
          </button>
        ) : (
          <p className="text-center text-xs text-foreground/55">Domaćin može pokrenuti novo nazdravljanje.</p>
        )}
      </div>
    );
  }

  if (live.phase === "toasting") {
    const clinkedCount = guests.filter((g) => live.clinked.has(g.id)).length;
    const waiting = guests.filter((g) => !live.clinked.has(g.id));
    const solo = guests.length === 1;
    return (
      <div className="rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-2.5 text-center">
        <p className="text-sm font-medium text-amber-100">
          {solo ? "🥂 Povuci čašu u sredinu stola i nazdravi!" : "🥂 Povuci svoju čašu i kucni se s ostalima!"}
        </p>
        {!solo && (
          <p className="mt-0.5 truncate text-xs text-amber-100/70">
            Kucnulo se {clinkedCount}/{guests.length}
            {waiting.length > 0 && (
              <>
                {" "}
                · čekamo: <NameList guests={waiting} live={live} />
              </>
            )}
          </p>
        )}
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
          Čekamo: <NameList guests={waitingFor} live={live} />
        </p>
      )}
      <SoberHint intoxication={myIntoxication} drink={myDrink} />
    </div>
  );
}

/** Savjet pijanom gostu: limunada otrježnjuje */
function SoberHint({ intoxication, drink }: { intoxication: number; drink: DrinkId | null }) {
  const level = drunkLevel(intoxication);
  if (level < 2) return null;
  const status = ["", "", "Pijan si!", "Jako si pijan!", "Toliko si pijan da povraćaš!"][level];
  return (
    <p className="rounded-lg bg-lime-400/10 px-3 py-1.5 text-center text-xs text-lime-200">
      {drink === SOBERING_DRINK
        ? `🍋 Limunada će te otrijezniti (−${SOBER_PER_LEMONADE} pića) nakon ove runde.`
        : `${DRUNK_LEVELS[level].emoji} ${status} Za otrežnjenje popij limunadu (Meni pića → Sokovi).`}
    </p>
  );
}
