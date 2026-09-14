"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import SceneLoader from "@/components/scene/SceneLoader";
import DrinkPicker from "@/components/ui/DrinkPicker";
import PhotoUpload from "@/components/ui/PhotoUpload";
import { useRoomState } from "@/hooks/useRoomState";
import type { DrinkId } from "@/lib/drinks";
import { roomApi } from "@/lib/roomApi";
import type { GuestSession } from "@/lib/rooms/types";
import { clearSession } from "@/lib/session";
import InviteButton from "./InviteButton";
import { FullscreenMessage } from "./RoomClient";
import RoomGone from "./RoomGone";

export default function RoomView({ code, session }: { code: string; session: GuestSession }) {
  const router = useRouter();
  const { data, error, mutate, settle } = useRoomState(code, session);
  const [revealRequested, setRevealRequested] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Token više ne vrijedi (npr. gost je izašao na drugom tabu) — natrag na formu za ulazak
  useEffect(() => {
    if (error?.status === 401) clearSession(code);
  }, [error, code]);

  if (error?.status === 404) return <RoomGone />;
  if (!data) return <FullscreenMessage text={error ? error.message : "Ulazimo u sobu…"} />;

  const { state, meId } = data;
  const me = state.guests.find((g) => g.id === meId);
  const isHost = meId === state.hostId;
  const photoRevealed = revealRequested && state.photoUrl !== null;

  async function changeDrink(drink: DrinkId) {
    setActionError(null);
    mutate((s) => ({ ...s, guests: s.guests.map((g) => (g.id === meId ? { ...g, drink } : g)) }));
    try {
      await roomApi.setDrink(code, session, drink);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Promjena pića nije uspjela.");
    } finally {
      void settle();
    }
  }

  async function uploadPhoto(photo: Blob) {
    const { photoUrl } = await roomApi.uploadPhoto(code, session, photo);
    mutate((s) => ({ ...s, photoUrl }));
    await settle();
  }

  async function removePhoto() {
    await roomApi.removePhoto(code, session);
    mutate((s) => ({ ...s, photoUrl: null }));
    await settle();
  }

  async function leave() {
    const message = isHost
      ? "Ti si domaćin. Ako izađeš, nitko više neće moći mijenjati sliku slavlja. Izaći iz sobe?"
      : "Izaći iz sobe?";
    if (!window.confirm(message)) return;
    try {
      await roomApi.leave(code, session);
    } catch {
      // i ako server ne odgovori, lokalno izlazimo
    }
    clearSession(code);
    router.push("/");
  }

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      <SceneLoader guests={state.guests} meId={meId} photoUrl={state.photoUrl} photoRevealed={photoRevealed} />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto flex h-10 items-center gap-2 rounded-full bg-stone-900/75 px-3 text-sm shadow-lg backdrop-blur">
          <span aria-hidden>🥂</span>
          <span className="font-mono font-semibold tracking-widest text-amber-200">{code}</span>
          <span className="text-foreground/40">·</span>
          <span aria-label={`${state.guests.length} gostiju`}>👥 {state.guests.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <InviteButton code={code} />
          <button
            type="button"
            onClick={() => void leave()}
            aria-label="Izađi iz sobe"
            className="pointer-events-auto flex size-10 items-center justify-center rounded-full bg-stone-900/75 text-lg shadow-lg backdrop-blur active:bg-stone-800"
          >
            🚪
          </button>
        </div>
      </header>

      <section className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-background via-background/90 to-transparent px-4 pt-10 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-xl flex-col gap-3">
          {error && error.status !== 401 && (
            <p className="text-center text-xs text-amber-200/80">Veza je nestabilna — pokušavamo ponovno…</p>
          )}
          {actionError && (
            <p role="alert" className="text-center text-xs text-red-300">
              {actionError}
            </p>
          )}

          {me && <DrinkPicker value={me.drink} onChange={(d) => void changeDrink(d)} />}

          {isHost && (
            <div className="flex items-start gap-2">
              <PhotoUpload photoUrl={state.photoUrl} onUpload={uploadPhoto} onRemove={removePhoto} />
              {state.photoUrl && (
                // Privremeni gumb za testiranje — u Fazi 5 otkrivanje pokreće nazdravljanje (za sve goste)
                <button
                  type="button"
                  onClick={() => setRevealRequested((r) => !r)}
                  className="h-11 shrink-0 rounded-xl bg-amber-300 px-3 text-sm font-semibold text-stone-900 active:bg-amber-200"
                >
                  {photoRevealed ? "Natrag na stol" : "✨ Otkrij"}
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
