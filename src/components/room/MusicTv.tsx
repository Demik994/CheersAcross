"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { MusicState } from "@/lib/party/protocol";
import { saveMusicPreference, useMusicPreference } from "@/lib/musicPreference";
import { FATAL_PLAYER_ERRORS, YT_STATE, loadYouTubeApi, type YTPlayer } from "@/lib/youtubePlayer";
import { CRT, CRT_SCREEN_PX, crtLayout, crtRect } from "./crtLayout";
import StaticNoise from "./StaticNoise";

// Three.js samo na klijentu i u zasebnom bundleu — učitava se tek kad nešto zasvira
const CrtTelevision = dynamic(() => import("@/components/scene/CrtTelevision"), { ssr: false });

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

/** Stari CRT televizor u kutu: svima isti YouTube video, usklađen sa satom servera */
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
  /** Pjesma koja je na ovom uređaju barem jednom zasvirala (do tada je na ekranu "snijeg") */
  const [playingTrack, setPlayingTrack] = useState<string | null>(null);

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
          width: CRT_SCREEN_PX,
          height: CRT_SCREEN_PX,
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
              if (data === YT_STATE.PLAYING) {
                stalledSince.current = null;
                setPlayingTrack(loadedTrack.current);
              }
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
  const cannotPlay = playError === current.track.videoId;
  const layout = crtLayout(preference.side);
  const screen = {
    left: layout.centerX - CRT_SCREEN_PX / 2,
    top: layout.centerY - CRT_SCREEN_PX / 2,
    width: CRT_SCREEN_PX,
    height: CRT_SCREEN_PX,
  };
  const plate = crtRect(
    layout,
    CRT.nameplate.left,
    CRT.stripY - CRT.nameplate.halfHeight,
    CRT.nameplate.right,
    CRT.stripY + CRT.nameplate.halfHeight,
  );
  const knob = (x: number) => crtRect(layout, x - 0.14, CRT.stripY - 0.17, x + 0.14, CRT.stripY + 0.17);

  return (
    <div
      className={`pointer-events-none absolute top-[calc(max(0.75rem,env(safe-area-inset-top))+2.25rem)] z-[5] ${
        preference.side === "left" ? "left-2" : "right-2"
      }`}
      style={{ width: layout.width }}
    >
      <div className="relative" style={{ width: layout.width, height: layout.height }}>
        <TvErrorBoundary>
          <CrtTelevision side={preference.side} lamp={cannotPlay ? "off" : paused ? "paused" : "playing"} />
        </TvErrorBoundary>

        <div ref={hostRef} className="pointer-events-auto absolute overflow-hidden rounded-[12px] bg-black" style={screen} />
        {(cannotPlay || playingTrack !== current.track.id) && !paused && (
          <StaticNoise style={screen} label={cannotPlay ? "NEMA SIGNALA · ovaj video ne može na tvom uređaju" : undefined} />
        )}

        <button
          type="button"
          onClick={onOpen}
          aria-label={`Glazba: ${current.track.title}`}
          className="pointer-events-auto absolute flex items-center gap-1 overflow-hidden rounded-sm px-1.5 text-left font-mono text-[10px] text-amber-300 active:text-amber-100"
          style={plate}
        >
          <span aria-hidden>{paused ? "⏸" : "♪"}</span>
          <span className="truncate">{current.track.title}</span>
        </button>
        <button
          type="button"
          onClick={() => saveMusicPreference({ side: preference.side === "left" ? "right" : "left" })}
          aria-label="Premjesti televizor na drugu stranu"
          title="Premjesti televizor"
          className="pointer-events-auto absolute flex items-center justify-center rounded-full text-stone-800 active:text-black"
          style={knob(CRT.knobs[0])}
        >
          <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M2 5h11M10 2l3 3-3 3M14 11H3M6 8l-3 3 3 3" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => saveMusicPreference({ enabled: false })}
          aria-label="Isključi glazbu za mene"
          title="Isključi glazbu za mene"
          className="pointer-events-auto absolute flex items-center justify-center rounded-full text-stone-800 active:text-black"
          style={knob(CRT.knobs[1])}
        >
          <svg viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M8 1.5v6M4.5 3.8a5.5 5.5 0 1 0 7 0" />
          </svg>
        </button>
      </div>

      {(loadError || needsTap) && (
        <div className="pointer-events-auto mx-auto -mt-1 flex w-[216px] flex-col gap-1">
          {loadError && <p className="rounded-lg bg-black/70 px-2 py-1 text-xs text-red-300">{loadError}</p>}
          {needsTap && (
            <button
              type="button"
              onClick={enableSound}
              className="h-9 rounded-full bg-amber-300 text-xs font-semibold text-stone-900 shadow-lg active:bg-amber-200"
            >
              🔊 Dodirni za zvuk glazbe
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Ako WebGL ne radi, player i gumbi ostaju — samo bez kućišta */
class TvErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <div className="absolute inset-x-2 top-12 bottom-1 rounded-3xl bg-stone-800" /> : this.props.children;
  }
}
