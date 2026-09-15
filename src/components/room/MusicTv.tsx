"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { MusicState } from "@/lib/party/protocol";
import { useMusicPreference } from "@/lib/musicPreference";
import { FATAL_PLAYER_ERRORS, YT_STATE, loadYouTubeApi, type YTPlayer } from "@/lib/youtubePlayer";
import { TV_ELEMENT_PX, type TvScreenBridge } from "@/lib/tvScreen";
import StaticNoise from "./StaticNoise";

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
  /** Preko njega 3D scena postavlja player na ekran televizora */
  bridge: TvScreenBridge;
  onEnded: (trackId: string) => void;
};

/** YouTube player za televizor u sceni: svima isti video, usklađen sa satom servera */
export default function MusicTv({ music, serverOffset, voiceLevels, isHost, bridge, onEnded }: Props) {
  const preference = useMusicPreference();
  const current = music.current;
  const active = preference.enabled && current !== null;

  const hostRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const screen = screenRef.current;
    if (!active || !screen) return;
    bridge.attach(screen);
    return () => bridge.detach(screen);
  }, [active, bridge]);

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
          width: TV_ELEMENT_PX,
          height: TV_ELEMENT_PX,
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
      // Po satu servera pjesma je već gotova (npr. svi su bili odsutni) — prijeđi na sljedeću
      const duration = player.getDuration();
      if (duration > 0 && target > duration + 1) {
        if (reportedEnd.current !== track.track.id) {
          reportedEnd.current = track.track.id;
          onEndedRef.current(track.track.id);
        }
        return;
      }
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
  const cannotPlay = playError === current.track.videoId;
  const showStatic = cannotPlay || (playingTrack !== current.track.id && current.startedAt !== null);

  return (
    <>
      {/* Pravi YouTube player — scena ga svaki frame postavi na ekran televizora (ili u kut) */}
      <div
        ref={screenRef}
        data-mode="dock"
        className="pointer-events-none absolute top-0 left-0 z-[1] origin-top-left overflow-hidden rounded-[19px] bg-black data-[mode=dock]:ring-8 data-[mode=dock]:ring-stone-800"
        style={{ width: TV_ELEMENT_PX, height: TV_ELEMENT_PX, transform: "scale(0)" }}
      >
        <div ref={hostRef} className="size-full" />
        {showStatic && (
          <StaticNoise
            style={{ inset: 0 }}
            label={cannotPlay ? "NEMA SIGNALA · ovaj video ne može na tvom uređaju" : undefined}
          />
        )}
      </div>

      {(loadError || needsTap) && (
        <div className="pointer-events-auto absolute top-[calc(max(0.75rem,env(safe-area-inset-top))+3.25rem)] left-1/2 z-10 flex w-56 -translate-x-1/2 flex-col gap-1">
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
    </>
  );
}
