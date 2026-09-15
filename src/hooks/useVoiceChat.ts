"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClientMessage, Peer } from "@/lib/party/protocol";
import { roomApi } from "@/lib/roomApi";
import type { GuestSession } from "@/lib/rooms/types";
import { VoiceMesh } from "@/lib/voice/VoiceMesh";
import type { VoiceMode } from "@/lib/voicePreference";
import type { SignalHandler } from "./useLiveRoom";

type Options = {
  code: string;
  session: GuestSession;
  /** null dok gost nije odabrao način */
  mode: VoiceMode | null;
  muted: boolean;
  connected: boolean;
  connectionId: string;
  peers: readonly Peer[];
  send: (message: ClientMessage) => void;
  registerSignalHandler: (handler: SignalHandler | null) => void;
};

function micErrorMessage(err: unknown) {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError") return "Pristup mikrofonu je odbijen. Dopusti ga u postavkama preglednika ili nastavi s tipkanjem.";
  if (name === "NotFoundError") return "Nije pronađen mikrofon na ovom uređaju.";
  if (!window.isSecureContext) return "Mikrofon radi samo preko sigurne (https) veze.";
  return "Mikrofon nije dostupan.";
}

export function useVoiceChat({ code, session, mode, muted, connected, connectionId, peers, send, registerSignalHandler }: Options) {
  const [mesh] = useState(() => new VoiceMesh());
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [iceReady, setIceReady] = useState(false);

  useEffect(() => {
    mesh.start();
    return () => mesh.dispose();
  }, [mesh]);

  useEffect(() => {
    mesh.configure({ send, myId: connectionId, myGuestId: session.guestId, onAudioBlocked: () => setAudioBlocked(true) });
  }, [mesh, send, connectionId, session.guestId]);

  useEffect(() => {
    registerSignalHandler((from, data) => void mesh.handleSignal(from, data));
    return () => registerSignalHandler(null);
  }, [mesh, registerSignalHandler]);

  // ICE poslužitelji (TURN) — jednom po ulasku u sobu
  useEffect(() => {
    let cancelled = false;
    roomApi
      .ice(code, session)
      .then(({ iceServers }) => {
        if (!cancelled) mesh.setIceServers(iceServers);
      })
      .catch(() => {
        // ostaje zadani STUN
      })
      .finally(() => {
        if (!cancelled) setIceReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code, session, mesh]);

  // Mikrofon je otvoren dok je gost u "mic" načinu
  useEffect(() => {
    if (mode !== "mic") return;
    let cancelled = false;
    let acquired: MediaStream | null = null;
    const request = navigator.mediaDevices?.getUserMedia
      ? navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      : Promise.reject(new Error("mediaDevices unavailable"));
    request
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        acquired = stream;
        setMicError(null);
        setMicStream(stream);
      })
      .catch((err) => {
        if (!cancelled) setMicError(micErrorMessage(err));
      });
    return () => {
      cancelled = true;
      acquired?.getTracks().forEach((t) => t.stop());
      setMicStream(null);
    };
  }, [mode]);

  useEffect(() => {
    mesh.setLocalStream(micStream);
  }, [mesh, micStream]);

  useEffect(() => {
    mesh.setMuted(muted);
  }, [mesh, muted]);

  // Javi ostalima imam li mikrofon (i jesam li utišan) — i nakon svakog ponovnog spajanja
  useEffect(() => {
    if (connected) send({ type: "voice", mic: micStream !== null, muted });
  }, [connected, micStream, muted, send]);

  useEffect(() => {
    if (iceReady && connected) mesh.syncPeers(peers);
  }, [mesh, iceReady, connected, peers]);

  const resumeAudio = useCallback(async () => {
    if (await mesh.resumeAudio()) setAudioBlocked(false);
  }, [mesh]);

  const dismissMicError = useCallback(() => setMicError(null), []);

  return {
    levels: mesh.levels,
    micOn: micStream !== null,
    micError,
    dismissMicError,
    audioBlocked,
    resumeAudio,
  };
}
