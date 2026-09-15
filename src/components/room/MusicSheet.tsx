"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { MUSIC_ADD_INTERVAL_MS, MUSIC_QUEUE_LIMIT, type MusicAction, type MusicState, type MusicTrack } from "@/lib/party/protocol";
import { saveMusicPreference, useMusicPreference } from "@/lib/musicPreference";
import type { PublicGuest } from "@/lib/rooms/types";
import { parseYouTubeId, youTubeThumbnail } from "@/lib/youtube";

type Props = {
  music: MusicState;
  guests: PublicGuest[];
  meId: string;
  isHost: boolean;
  connected: boolean;
  serverError: { message: string; id: number } | null;
  onAction: (action: MusicAction) => void;
  onClearError: () => void;
  onClose: () => void;
};

/** Koliko čekamo da server doda pjesmu (naslov se dohvaća s YouTubea) */
const ADD_TIMEOUT_MS = 8000;

export default function MusicSheet({ music, guests, meId, isHost, connected, serverError, onAction, onClearError, onClose }: Props) {
  const preference = useMusicPreference();
  const [url, setUrl] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  /** Broj pjesama u trenutku slanja — kad se promijeni, dodavanje je uspjelo */
  const [pending, setPending] = useState<{ count: number; at: number } | null>(null);
  const [lastAddAt, setLastAddAt] = useState(0);
  /** Domaćin vuče klizač — lokalna vrijednost dok server ne potvrdi */
  const [draftVolume, setDraftVolume] = useState<number | null>(null);
  const lastVolumeSent = useRef(0);
  const volume = draftVolume ?? music.volume;

  function changeVolume(value: number, final: boolean) {
    setDraftVolume(final ? null : value);
    const now = Date.now();
    // Dok se vuče, najviše ~6 poruka u sekundi; kraj poteza uvijek pošalji
    if (final || now - lastVolumeSent.current > 150) {
      lastVolumeSent.current = now;
      onAction({ action: "volume", value });
    }
  }

  const trackCount = music.queue.length + (music.current ? 1 : 0);
  const addDone = pending !== null && (trackCount !== pending.count || (serverError !== null && serverError.id >= pending.at));
  const adding = pending !== null && !addDone;
  const error = localError ?? (serverError && pending && serverError.id >= pending.at ? serverError.message : null);

  useEffect(() => {
    if (!adding) return;
    const timer = setTimeout(() => setPending(null), ADD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [adding]);

  const nameOf = (guestId: string) =>
    guestId === meId ? "ti" : (guests.find((g) => g.id === guestId)?.name ?? "bivši gost");

  function add(event: FormEvent) {
    event.preventDefault();
    onClearError();
    setLocalError(null);
    if (!parseYouTubeId(url)) {
      setLocalError("Zalijepi link s YouTubea (npr. youtube.com/watch?v=… ili youtu.be/…).");
      return;
    }
    const now = Date.now();
    if (now - lastAddAt < MUSIC_ADD_INTERVAL_MS) {
      setLocalError("Polako 🙂 Pričekaj par sekundi pa dodaj sljedeću.");
      return;
    }
    setLastAddAt(now);
    setPending({ count: trackCount, at: now });
    onAction({ action: "add", url });
    setUrl("");
  }

  const current = music.current;
  const queueFull = music.queue.length >= MUSIC_QUEUE_LIMIT;

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Glazba"
        className="flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-3xl border border-white/10 bg-stone-900 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">🎵 Glazba</h2>
          <button type="button" onClick={onClose} aria-label="Zatvori" className="size-10 rounded-full text-xl active:bg-white/10">
            ✕
          </button>
        </div>

        <div className="-mx-1 flex min-h-0 flex-col gap-4 overflow-y-auto px-1">
          {current ? (
            <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-2">
              <Thumbnail track={current.track} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-xs text-amber-200/80">{current.startedAt === null ? "⏸ Pauzirano" : "▶ Svira"}</span>
                <span className="line-clamp-2 text-sm font-medium">{current.track.title}</span>
                <span className="text-xs text-foreground/50">dodao/la {nameOf(current.track.addedBy)}</span>
              </div>
              {isHost && (
                <div className="flex shrink-0 gap-1">
                  <IconButton
                    label={current.startedAt === null ? "Nastavi" : "Pauziraj"}
                    onClick={() => onAction({ action: current.startedAt === null ? "resume" : "pause" })}
                  >
                    {current.startedAt === null ? "▶" : "⏸"}
                  </IconButton>
                  <IconButton label="Sljedeća pjesma" onClick={() => onAction({ action: "skip" })}>
                    ⏭
                  </IconButton>
                </div>
              )}
            </div>
          ) : (
            <p className="rounded-2xl bg-white/5 px-3 py-4 text-center text-sm text-foreground/60">
              Ništa ne svira. Dodaj prvu pjesmu!
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="music-volume" className="flex items-center justify-between text-sm font-medium">
              <span>{isHost ? "Glasnoća za sve" : "Glasnoća (postavlja domaćin)"}</span>
              <span className="text-xs font-normal text-foreground/60 tabular-nums">
                {volume === 0 ? "🔇" : volume < 40 ? "🔈" : volume < 75 ? "🔉" : "🔊"} {volume}%
              </span>
            </label>
            <input
              id="music-volume"
              type="range"
              min={0}
              max={100}
              step={1}
              value={volume}
              disabled={!isHost || !connected}
              onChange={(e) => changeVolume(Number(e.target.value), false)}
              onPointerUp={(e) => changeVolume(Number(e.currentTarget.value), true)}
              onKeyUp={(e) => changeVolume(Number(e.currentTarget.value), true)}
              className="h-8 w-full accent-amber-300 disabled:opacity-50"
            />
          </div>

          <form onSubmit={add} className="flex flex-col gap-2">
            <label htmlFor="music-url" className="text-sm font-medium">
              {isHost ? "Dodaj pjesmu" : "Predloži pjesmu"}
            </label>
            <div className="flex gap-2">
              <input
                id="music-url"
                type="text"
                inputMode="url"
                autoComplete="off"
                placeholder="Zalijepi YouTube link"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setLocalError(null);
                }}
                className="h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-3 text-base outline-none focus:border-amber-300/60"
              />
              <button
                type="submit"
                disabled={!connected || adding || queueFull || url.trim() === ""}
                className="h-11 shrink-0 rounded-xl bg-amber-300 px-4 text-sm font-semibold text-stone-900 active:bg-amber-200 disabled:opacity-50"
              >
                {adding ? "…" : "Dodaj"}
              </button>
            </div>
            {error && (
              <p role="alert" className="text-xs text-red-300">
                {error}
              </p>
            )}
            {queueFull && <p className="text-xs text-foreground/50">Red je pun ({MUSIC_QUEUE_LIMIT} pjesama).</p>}
            <p className="text-xs text-foreground/45">
              U YouTube aplikaciji: Podijeli → Kopiraj link.{" "}
              <a href="https://www.youtube.com/" target="_blank" rel="noreferrer" className="text-amber-200/80 underline">
                Otvori YouTube
              </a>
            </p>
          </form>

          {music.queue.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium">Sljedeće ({music.queue.length})</h3>
              <ol className="flex flex-col gap-1">
                {music.queue.map((track, index) => (
                  <li key={track.id} className="flex items-center gap-2 rounded-xl px-1 py-1">
                    <span className="w-4 shrink-0 text-center text-xs text-foreground/40">{index + 1}</span>
                    <Thumbnail track={track} small />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm">{track.title}</span>
                      <span className="text-xs text-foreground/50">{nameOf(track.addedBy)}</span>
                    </div>
                    {isHost && (
                      <IconButton label="Pusti odmah" onClick={() => onAction({ action: "play", trackId: track.id })}>
                        ▶
                      </IconButton>
                    )}
                    {(isHost || track.addedBy === meId) && (
                      <IconButton label="Makni iz reda" onClick={() => onAction({ action: "remove", trackId: track.id })}>
                        ✕
                      </IconButton>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
            <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
              <span>Glazba na ovom uređaju</span>
              <input
                type="checkbox"
                checked={preference.enabled}
                onChange={(e) => saveMusicPreference({ enabled: e.target.checked })}
                className="size-5 accent-amber-300"
              />
            </label>
            <p className="text-xs text-foreground/45">
              {isHost
                ? "Svi mogu predlagati pjesme, a ti upravljaš redom. "
                : "Pjesme predlažu svi, a domaćin pauzira i preskače. "}
              Video svira na televizoru pored stola. Neki videi se ne smiju puštati izvan YouTubea, a mogu se
              pojaviti i reklame.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Thumbnail({ track, small = false }: { track: MusicTrack; small?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- mali YouTube thumbnail
    <img
      src={youTubeThumbnail(track.videoId)}
      alt=""
      loading="lazy"
      className={`shrink-0 rounded-lg bg-black object-cover ${small ? "h-9 w-16" : "h-12 w-20"}`}
    />
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-base active:bg-white/20"
    >
      {children}
    </button>
  );
}
