"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import SceneLoader from "@/components/scene/SceneLoader";
import DrinkMenu from "@/components/ui/DrinkMenu";
import PhotoUpload from "@/components/ui/PhotoUpload";
import { useLiveRoom } from "@/hooks/useLiveRoom";
import { useVoiceChat } from "@/hooks/useVoiceChat";
import type { Peer } from "@/lib/party/protocol";
import { saveVoiceMode, useVoiceMode, type VoiceMode } from "@/lib/voicePreference";
import type { DrinkId } from "@/lib/drinks";
import { roomApi, type Look } from "@/lib/roomApi";
import type { GuestSession, PublicGuest } from "@/lib/rooms/types";
import { DRINK_DURATION_MS, REVEAL_ALREADY_DONE } from "@/lib/party/geometry";
import { clearSession } from "@/lib/session";
import { playCelebration, playVomit, unlockAudio } from "@/lib/sound";
import { DRUNK_LEVELS, drunkLevel } from "@/lib/drunk";
import { VOMIT_DURATION_MS } from "@/components/scene/VomitStream";
import AvatarSheet from "./AvatarSheet";
import ChatInput from "./ChatInput";
import GuestListSheet from "./GuestListSheet";
import InviteButton from "./InviteButton";
import PhotoRoundPicker from "./PhotoRoundPicker";
import { FullscreenMessage } from "./RoomClient";
import RoomGone from "./RoomGone";
import ToastPanel from "./ToastPanel";
import VoiceChoiceDialog from "./VoiceChoiceDialog";

const NO_PEERS: readonly Peer[] = [];

export default function RoomView({ code, session }: { code: string; session: GuestSession }) {
  const router = useRouter();
  const {
    state,
    error,
    mutate,
    refresh,
    live,
    connected,
    glassTargets,
    clinkEvents,
    revealStartedAt,
    setReady,
    moveGlass,
    startNewRound,
    sendChat,
    setPhotoRound,
    bubbles,
    send,
    registerSignalHandler,
    connectionId,
  } = useLiveRoom(code, session);
  const voiceMode = useVoiceMode(code);
  const [muted, setMuted] = useState(false);
  const [voiceChoiceOpen, setVoiceChoiceOpen] = useState(false);
  const voice = useVoiceChat({
    code,
    session,
    mode: voiceMode ?? null,
    muted,
    drunkLevel: drunkLevel(live?.intoxication.get(session.guestId) ?? 0),
    connected,
    connectionId,
    peers: live?.peers ?? NO_PEERS,
    send,
    registerSignalHandler,
  });
  /** Za koju rundu (revealStartedAt) je animacija pijenja završila */
  const [celebratedRound, setCelebratedRound] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [guestListOpen, setGuestListOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);

  // Token više ne vrijedi (gost je uklonjen ili je izašao na drugom tabu) — natrag na formu za ulazak
  useEffect(() => {
    if (error?.status === 401) clearSession(code);
  }, [error, code]);

  // Preglednici puštaju zvuk tek nakon interakcije — "otključaj" audio na prvi dodir
  useEffect(() => {
    window.addEventListener("pointerdown", unlockAudio);
    return () => window.removeEventListener("pointerdown", unlockAudio);
  }, []);

  const anyVomit = (live?.vomiting.size ?? 0) > 0;

  // Nakon animacije pijenja (i eventualnog povraćanja): otkrij sliku, konfeti i melodija
  useEffect(() => {
    if (revealStartedAt === null) return;
    const animated = revealStartedAt !== REVEAL_ALREADY_DONE;
    const now = performance.now();
    const drinkEnd = revealStartedAt + DRINK_DURATION_MS;
    const vomitTimer =
      animated && anyVomit ? setTimeout(playVomit, Math.max(0, drinkEnd + 200 - now)) : undefined;
    const timer = setTimeout(
      () => {
        setCelebratedRound(revealStartedAt);
        if (animated) playCelebration();
      },
      Math.max(0, drinkEnd + (anyVomit ? VOMIT_DURATION_MS : 0) - now),
    );
    return () => {
      clearTimeout(timer);
      clearTimeout(vomitTimer);
    };
  }, [revealStartedAt, anyVomit]);

  if (error?.status === 404) return <RoomGone />;
  if (!state) return <FullscreenMessage text={error ? error.message : "Ulazimo u sobu…"} />;

  const meId = session.guestId;
  const me = state.guests.find((g) => g.id === meId);
  const isHost = meId === state.hostId;
  const celebrationShown = revealStartedAt !== null && celebratedRound === revealStartedAt;
  // Slika se otkriva samo u zdravici koju je domaćin odabrao
  const photoRound = live !== null && live.round === live.photoRound;
  const photoRevealed = celebrationShown && state.photoUrl !== null && photoRound;
  const inLobby = live === null || live.phase === "lobby";
  const myIntoxication = live?.intoxication.get(meId) ?? 0;
  const myLevel = drunkLevel(myIntoxication);

  async function changeDrink(drink: DrinkId) {
    setActionError(null);
    mutate((s) => ({ ...s, guests: s.guests.map((g) => (g.id === meId ? { ...g, drink } : g)) }));
    try {
      await roomApi.setDrink(code, session, drink);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Promjena pića nije uspjela.");
      void refresh();
    }
  }

  async function changeLook(look: Look) {
    await roomApi.setLook(code, session, look);
    mutate((s) => ({ ...s, guests: s.guests.map((g) => (g.id === meId ? { ...g, ...look } : g)) }));
  }

  async function uploadPhoto(photo: Blob) {
    const { photoUrl } = await roomApi.uploadPhoto(code, session, photo);
    mutate((s) => ({ ...s, photoUrl }));
  }

  async function removePhoto() {
    await roomApi.removePhoto(code, session);
    mutate((s) => ({ ...s, photoUrl: null }));
  }

  async function kick(guest: PublicGuest) {
    await roomApi.kick(code, session, guest.id);
    mutate((s) => ({ ...s, guests: s.guests.filter((g) => g.id !== guest.id) }));
  }

  function chooseVoice(mode: VoiceMode) {
    unlockAudio();
    voice.dismissMicError();
    saveVoiceMode(code, mode);
    setVoiceChoiceOpen(false);
  }

  async function leave() {
    const message = isHost
      ? "Ti si domaćin. Ako izađeš, nitko više neće moći mijenjati sliku ni uklanjati goste. Izaći iz sobe?"
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
      <SceneLoader
        guests={state.guests}
        meId={meId}
        live={live}
        glassTargets={glassTargets}
        clinkEvents={clinkEvents}
        bubbles={bubbles}
        voiceLevels={voice.levels}
        onMyGlassMove={moveGlass}
        revealStartedAt={revealStartedAt}
        photoUrl={state.photoUrl}
        photoRevealed={photoRevealed}
      />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => setGuestListOpen(true)}
          className="pointer-events-auto flex h-10 items-center gap-2 rounded-full bg-stone-900/75 px-3 text-sm shadow-lg backdrop-blur active:bg-stone-800"
        >
          <span
            className={`size-2 rounded-full ${connected ? "bg-emerald-400" : "animate-pulse bg-amber-400"}`}
            aria-label={connected ? "spojeno" : "spajanje"}
          />
          <span className="font-mono font-semibold tracking-widest text-amber-200">{code}</span>
          <span className="text-foreground/40">·</span>
          <span aria-label={`${state.guests.length} gostiju`}>👥 {state.guests.length}</span>
          {myLevel > 0 && (
            <>
              <span className="text-foreground/40">·</span>
              <span aria-label={`Ti si ${DRUNK_LEVELS[myLevel].label}`}>{DRUNK_LEVELS[myLevel].emoji}</span>
            </>
          )}
        </button>
        <div className="flex items-center gap-2">
          <InviteButton code={code} />
          {me && (
            <button
              type="button"
              onClick={() => setAvatarOpen(true)}
              aria-label="Promijeni svoj lik"
              className="pointer-events-auto flex size-10 items-center justify-center rounded-full bg-stone-900/75 text-lg shadow-lg backdrop-blur active:bg-stone-800"
            >
              🧑
            </button>
          )}
          {voiceMode === "mic" && voice.micOn ? (
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? "Uključi mikrofon" : "Utišaj mikrofon"}
              aria-pressed={muted}
              className={`pointer-events-auto flex size-10 items-center justify-center rounded-full text-lg shadow-lg backdrop-blur ${
                muted ? "bg-red-500/80 active:bg-red-500" : "bg-emerald-500/80 active:bg-emerald-500"
              }`}
            >
              {muted ? "🔇" : "🎤"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setVoiceChoiceOpen(true)}
              aria-label="Način razgovora"
              className="pointer-events-auto flex size-10 items-center justify-center rounded-full bg-stone-900/75 text-lg shadow-lg backdrop-blur active:bg-stone-800"
            >
              ⌨️
            </button>
          )}
        </div>
      </header>

      <section className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-background via-background/90 to-transparent px-4 pt-10 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {/* pointer-events samo na kontrolama, da se čaša može vući i iza gradijenta */}
        <div className="pointer-events-auto mx-auto flex max-w-xl flex-col gap-3">
          {voice.micError && (
            <div role="alert" className="flex items-center gap-2 rounded-xl bg-red-500/15 px-3 py-2 text-xs text-red-200">
              <span className="flex-1">{voice.micError}</span>
              <button type="button" onClick={() => chooseVoice("text")} className="shrink-0 rounded-lg bg-white/10 px-2 py-1 font-semibold">
                Tipkanje
              </button>
            </div>
          )}
          {voice.audioBlocked && (
            <button
              type="button"
              onClick={() => void voice.resumeAudio()}
              className="h-10 rounded-xl bg-sky-500/20 text-sm font-semibold text-sky-100 active:bg-sky-500/30"
            >
              🔊 Dodirni za uključivanje zvuka razgovora
            </button>
          )}
          {actionError && (
            <p role="alert" className="text-center text-xs text-red-300">
              {actionError}
            </p>
          )}

          <ToastPanel
            guests={state.guests}
            meId={meId}
            isHost={isHost}
            live={live}
            connected={connected}
            celebrationShown={celebrationShown}
            myIntoxication={myIntoxication}
            myDrink={me?.drink ?? null}
            onReady={setReady}
            onNewRound={startNewRound}
          />

          {inLobby && me && <DrinkMenu value={me.drink} onChange={(d) => void changeDrink(d)} />}

          {inLobby && isHost && (
            // Slika ostaje skrivena gostima dok se ne dođe do odabrane zdravice
            <PhotoUpload photoUrl={state.photoUrl} onUpload={uploadPhoto} onRemove={removePhoto} />
          )}
          {inLobby && isHost && state.photoUrl && live && (
            <PhotoRoundPicker round={live.round} photoRound={live.photoRound} onChange={setPhotoRound} />
          )}

          <ChatInput onSend={sendChat} disabled={!connected} />
        </div>
      </section>

      {me && (voiceMode === null || voiceChoiceOpen) && (
        <VoiceChoiceDialog
          current={voiceMode ?? null}
          onChoose={chooseVoice}
          onClose={voiceMode ? () => setVoiceChoiceOpen(false) : undefined}
        />
      )}

      {avatarOpen && me && (
        <AvatarSheet
          initial={{ avatar: me.avatar, skin: me.skin }}
          color={me.color}
          onSave={changeLook}
          onClose={() => setAvatarOpen(false)}
        />
      )}

      {guestListOpen && (
        <GuestListSheet
          guests={state.guests}
          meId={meId}
          isHost={isHost}
          live={live}
          onKick={kick}
          onLeave={() => void leave()}
          onClose={() => setGuestListOpen(false)}
        />
      )}
    </main>
  );
}
