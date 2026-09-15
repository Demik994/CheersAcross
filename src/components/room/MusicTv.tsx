"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { MusicState } from "@/lib/party/protocol";
import { saveMusicPreference, useMusicPreference } from "@/lib/musicPreference";
import { FATAL_PLAYER_ERRORS, YT_STATE, loadYouTubeApi, type YTPlayer } from "@/lib/youtubePlayer";

/** YouTube traži da player bude vidljiv i barem 200 × 200 px */
const PLAYER_SIZE = 200;
const SYNC_INTERVAL_MS = 1000;
/** Koliko smijemo odstupiti od "zajedničke" pozicije pjesme prije premotavanja */
const MAX_DRIFT_S = 2;
/** Ako pjesma ne krene za ovoliko, preglednik je blokirao zvuk — sviramo utišano i tražimo dodir */
const AUTOPLAY_TIMEOUT_MS = 2500;
const DUCK_CHECK_MS = 150;
/** Glasnoća glazbe dok netko govori (0–100) */
const DUCKED_VOLUME = 30;
const DUCK_HOLD_MS = 700;

type Props = {
  music: MusicState;
  /** vrijeme servera − lokalno vrijeme (ms) */
  serverOffset: RefObject<number>;
  voiceLevels: ReadonlyMap<string, number>;
  isHost: boolean;
  onEnded: (trackId: string) => void;
  onOpen: () => void;
};

/** Mali "televizor" u kutu: svima isti YouTube video, usklađen sa satom servera */
export default function MusicTv({ music, serverOffset, voiceLevels, isHost, onEnded, onOpen }: Props) {
  const preference = useMusicPreference();
  const current = music.current;
  const active = preference.enabled && current !== null;

  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** id videa koji se na ovom uređaju ne može pustiti */
  const [playError, setPlayError] = useState<string | null>(null);

  const currentRef = useRef(current);
  const onEndedRef = useRef(onEnded);
  const isHostRef = useRef(isHost);
  /** Pjesma (id u redu) koju je ovaj player zadnju učitao */
  const loadedTrack = useRef<string | null>(null);
  const reportedEnd = useRef<string | null>(null);
  const stalledSince = useRef<number | null>(null);

  useEffect(() => {
    currentRef.current = current;
    onEndedRef.current = onEnded;
    isHostRef.current = isHost;
  });

  // Player postoji dok nešto svira i glazba je uključena na ovom uređaju
  useEffect(() => {
    const host = hostRef.current;
    if (!active || !host) return;
    let cancelled = false;
    let player: YTPlayer | null = null;

    const reportEnd = () => {
      // Javljamo pjesmu koju player stvarno ima — ne `current`, koji je možda već sljedeća
      const trackId = loadedTrack.current;
      if (!trackId || reportedEnd.current === trackId) return;
      reportedEnd.current = trackId;
      onEndedRef.current(trackId);
    };

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        // YouTube zamjenjuje element iframeom — dajemo mu vlastiti, izvan Reactovog stabla
        const mount = document.createElement("div");
        host.replaceChildren(mount);
        player = new YT.Player(mount, {
          width: PLAYER_SIZE,
          height: PLAYER_SIZE,
          playerVars: {
            playsinline: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            rel: 0,
            iv_load_policy: 3,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (cancelled) return;
              playerRef.current = player;
              setReady(true);
            },
            onStateChange: ({ data }) => {
              if (data === YT_STATE.ENDED) reportEnd();
              if (data === YT_STATE.PLAYING) stalledSince.current = null;
            },
            onError: ({ data }) => {
              if (!FATAL_PLAYER_ERRORS.includes(data)) return;
              // Greška može biti samo kod ovog gosta (regija, preglednik) — preskače samo domaćinov player
              if (isHostRef.current) reportEnd();
              else setPlayError(currentRef.current?.track.videoId ?? null);
            },
          },
        });
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      });

    return () => {
      cancelled = true;
      player?.destroy();
      playerRef.current = null;
      loadedTrack.current = null;
      stalledSince.current = null;
      host.replaceChildren();
      setReady(false);
      setNeedsTap(false);
      setLoadError(null);
    };
  }, [active]);

  // Usklađivanje: svaki preglednik sam računa gdje bi pjesma trebala biti
  useEffect(() => {
    if (!ready) return;

    const sync = () => {
      const player = playerRef.current;
      const track = currentRef.current;
      if (!player || !track) return;
      const now = Date.now() + (serverOffset.current ?? 0);
      const playing = track.startedAt !== null;
      const target = playing ? Math.max(0, (now - track.startedAt!) / 1000) : (track.pausedAt ?? 0);

      if (loadedTrack.current !== track.track.id) {
        loadedTrack.current = track.track.id;
        reportedEnd.current = null;
        stalledSince.current = null;
        const options = { videoId: track.track.videoId, startSeconds: target };
        if (playing) player.loadVideoById(options);
        else player.cueVideoById(options);
        return;
      }

      const state = player.getPlayerState();
      if (!playing) {
        stalledSince.current = null;
        if (state === YT_STATE.PLAYING || state === YT_STATE.BUFFERING) player.pauseVideo();
        // seekTo iz stanja "cued" bi pokrenuo video — premotavamo samo pauzirani
        if (state === YT_STATE.PAUSED && Math.abs(player.getCurrentTime() - target) > 1) player.seekTo(target, true);
        return;
      }

      if (state === YT_STATE.ENDED) return;
      if (state === YT_STATE.PLAYING) {
        stalledSince.current = null;
        if (Math.abs(player.getCurrentTime() - target) > MAX_DRIFT_S) player.seekTo(target, true);
        return;
      }
      if (state === YT_STATE.BUFFERING) return;

      // Premotavanje svake sekunde bi iznova pokretalo učitavanje — samo ako smo stvarno daleko
      if (Math.abs(player.getCurrentTime() - target) > MAX_DRIFT_S) player.seekTo(target, true);
      player.playVideo();
      const since = (stalledSince.current ??= performance.now());
      if (performance.now() - since > AUTOPLAY_TIMEOUT_MS && !player.isMuted()) {
        // Preglednik ne da zvuk bez dodira: sviraj utišano da slika bude usklađena
        player.mute();
        player.playVideo();
        setNeedsTap(true);
      }
    };

    sync();
    const timer = setInterval(sync, SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [ready, current, serverOffset]);

  // Utišaj glazbu dok netko govori
  useEffect(() => {
    if (!ready) return;
    let lastSpeech = 0;
    let volume = -1;
    const timer = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const now = performance.now();
      for (const level of voiceLevels.values()) {
        if (level > 0.1) lastSpeech = now;
      }
      const next = now - lastSpeech < DUCK_HOLD_MS ? DUCKED_VOLUME : 100;
      if (next !== volume) {
        volume = next;
        player.setVolume(next);
      }
    }, DUCK_CHECK_MS);
    return () => clearInterval(timer);
  }, [ready, voiceLevels]);

  function enableSound() {
    const player = playerRef.current;
    if (!player) return;
    player.unMute();
    player.playVideo();
    stalledSince.current = null;
    setNeedsTap(false);
  }

  if (!active || !current) return null;
  const paused = current.startedAt === null;

  return (
    <div
      className={`pointer-events-auto absolute top-[calc(max(0.75rem,env(safe-area-inset-top))+3.25rem)] z-10 w-[200px] overflow-hidden rounded-2xl bg-stone-950 shadow-xl ring-1 ring-white/15 ${
        preference.side === "left" ? "left-3" : "right-3"
      }`}
    >
      <div ref={hostRef} className="size-[200px] bg-black" />
      {loadError && <p className="px-2 pt-1.5 text-xs text-red-300">{loadError}</p>}
      {playError === current.track.videoId && (
        <p className="px-2.5 pt-1.5 text-xs text-red-300">Ovaj video se ne može pustiti na tvom uređaju.</p>
      )}
      {needsTap && (
        <button
          type="button"
          onClick={enableSound}
          className="block h-9 w-full bg-amber-300 text-xs font-semibold text-stone-900 active:bg-amber-200"
        >
          🔊 Dodirni za zvuk glazbe
        </button>
      )}
      <div className="flex h-9 items-center text-xs">
        <button
          type="button"
          onClick={onOpen}
          className="flex h-full min-w-0 flex-1 items-center gap-1 pl-2.5 text-left active:bg-white/10"
          aria-label="Otvori glazbu"
        >
          <span aria-hidden>{paused ? "⏸" : "🎵"}</span>
          <span className="truncate">{current.track.title}</span>
        </button>
        <button
          type="button"
          onClick={() => saveMusicPreference({ side: preference.side === "left" ? "right" : "left" })}
          aria-label="Premjesti video na drugu stranu"
          className="h-full w-8 shrink-0 text-foreground/70 active:bg-white/10"
        >
          ⇆
        </button>
        <button
          type="button"
          onClick={() => saveMusicPreference({ enabled: false })}
          aria-label="Isključi glazbu za mene"
          className="h-full w-8 shrink-0 text-foreground/70 active:bg-white/10"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
