"use client";

import type { ClientMessage, Peer, SignalData } from "@/lib/party/protocol";
import type { DrunkLevel } from "@/lib/drunk";
import { getContext } from "@/lib/sound";

/**
 * Glasovni chat kao "mreža" izravnih WebRTC veza (svaki preglednik sa svakim).
 * Za do 12 gostiju i samo zvuk (~30 kbit/s po vezi) to je dovoljno i ne treba medijski server.
 *
 * - Veza postoji samo ako barem jedna strana ima mikrofon (dva "tipkača" nemaju što slati).
 * - Pregovaranje: "perfect negotiation" obrazac — obje strane smiju slati ponudu,
 *   "pristojna" strana (veći id) popušta kad se ponude sudare.
 * - Signalizacija (SDP i ICE kandidati) ide preko real-time servera.
 * - Glasnoća svakog gosta mjeri se lokalno (AnalyserNode) za animaciju usta i prstena.
 * - Pijani glas: moj mikrofon prolazi kroz lanac koji "ljulja" visinu tona, prigušuje
 *   visoke tonove i malo izobličuje — to čuju ostali. Trijezan šalje sirovi mikrofon.
 */

type PeerLink = {
  pc: RTCPeerConnection;
  /** Pošiljatelj mog mikrofona na ovoj vezi (null dok nemam mikrofon) */
  sender: RTCRtpSender | null;
  guestId: string;
  /** pristojna strana popušta pri sudaru ponuda */
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  audio: HTMLAudioElement | null;
  source: MediaStreamAudioSourceNode | null;
  analyser: AnalyserNode | null;
};

const LEVEL_INTERVAL_MS = 100;

/** Parametri pijanog glasa po razini: titranje visine (s), brzina titranja (Hz), gornja granica tonova (Hz), izobličenje */
const DRUNK_VOICE: Record<DrunkLevel, { depth: number; rate: number; cutoff: number; drive: number }> = {
  0: { depth: 0, rate: 0.8, cutoff: 20000, drive: 0 },
  1: { depth: 0.0015, rate: 0.9, cutoff: 9000, drive: 0 },
  2: { depth: 0.004, rate: 0.65, cutoff: 5000, drive: 1.5 },
  3: { depth: 0.007, rate: 0.5, cutoff: 3200, drive: 3 },
  4: { depth: 0.009, rate: 0.4, cutoff: 2400, drive: 4 },
};

type DrunkChain = {
  source: MediaStreamAudioSourceNode;
  delay: DelayNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
  filter: BiquadFilterNode;
  shaper: WaveShaperNode;
  destination: MediaStreamAudioDestinationNode;
};

/** Mekano "zasićenje" — što veći drive, to mutniji glas */
function saturationCurve(drive: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(1024 * 4));
  const k = 1 + drive;
  for (let i = 0; i < 1024; i++) {
    const x = (i / 1023) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

const DEFAULT_ICE: RTCIceServer[] = [{ urls: ["stun:stun.cloudflare.com:3478"] }];

export class VoiceMesh {
  /** Glasnoća po gostu, 0..1 (izglađeno) — 3D scena je čita svaki frame */
  readonly levels = new Map<string, number>();

  private links = new Map<string, PeerLink>();
  private peers: readonly Peer[] = [];
  private iceServers: RTCIceServer[] = DEFAULT_ICE;
  private localStream: MediaStream | null = null;
  private localSource: MediaStreamAudioSourceNode | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private muted = false;
  private drunkLevel: DrunkLevel = 0;
  private drunkChain: DrunkChain | null = null;
  private myId = "";
  private myGuestId = "";
  private send: (message: ClientMessage) => void = () => {};
  private onAudioBlocked: () => void = () => {};
  private timer: ReturnType<typeof setInterval> | null = null;
  private buffer = new Uint8Array(new ArrayBuffer(512));

  configure(options: { send: (m: ClientMessage) => void; myId: string; myGuestId: string; onAudioBlocked: () => void }) {
    const idChanged = options.myId !== this.myId;
    this.send = options.send;
    this.myId = options.myId;
    this.myGuestId = options.myGuestId;
    this.onAudioBlocked = options.onAudioBlocked;
    // Novi id konekcije (ponovno spajanje) — stare veze više ne vrijede
    if (idChanged) for (const id of [...this.links.keys()]) this.closeLink(id);
  }

  start() {
    if (!this.timer) this.timer = setInterval(this.measureLevels, LEVEL_INTERVAL_MS);
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const id of [...this.links.keys()]) this.closeLink(id);
    this.localSource?.disconnect();
    this.localSource = null;
    this.localAnalyser = null;
    this.destroyDrunkChain();
    getContext()?.removeEventListener("statechange", this.refreshOutgoing);
    this.levels.clear();
  }

  setIceServers(servers: RTCIceServer[]) {
    if (servers.length > 0) this.iceServers = servers;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    // Utišavanje bez ponovnog pregovaranja: staza ostaje, samo šalje tišinu
    this.localStream?.getAudioTracks().forEach((track) => (track.enabled = !muted));
    this.drunkChain?.destination.stream.getAudioTracks().forEach((track) => (track.enabled = !muted));
  }

  /** Moja razina pijanstva — mijenja glas koji čuju ostali (bez ponovnog pregovaranja) */
  setDrunkLevel(level: DrunkLevel) {
    this.drunkLevel = level;
    const chain = this.drunkChain;
    const ctx = getContext();
    if (chain && ctx) {
      const p = DRUNK_VOICE[level];
      const now = ctx.currentTime;
      chain.lfo.frequency.setTargetAtTime(p.rate, now, 0.3);
      chain.lfoGain.gain.setTargetAtTime(p.depth, now, 0.3);
      // Osnovno kašnjenje veće od amplitude titranja, da ne padne ispod nule
      chain.delay.delayTime.setTargetAtTime(p.depth + 0.003, now, 0.3);
      chain.filter.frequency.setTargetAtTime(p.cutoff, now, 0.3);
      chain.shaper.curve = p.drive > 0 ? saturationCurve(p.drive) : null;
    }
    this.refreshOutgoing();
  }

  setLocalStream(stream: MediaStream | null) {
    this.localStream = stream;
    this.localSource?.disconnect();
    this.localSource = null;
    this.localAnalyser = null;
    this.destroyDrunkChain();
    const ctx = getContext();
    if (stream && ctx) {
      this.localSource = ctx.createMediaStreamSource(stream);
      this.localAnalyser = ctx.createAnalyser();
      this.localAnalyser.fftSize = 512;
      this.localSource.connect(this.localAnalyser);
      this.createDrunkChain(ctx, stream);
      ctx.removeEventListener("statechange", this.refreshOutgoing);
      ctx.addEventListener("statechange", this.refreshOutgoing);
    }
    this.setMuted(this.muted);
    this.setDrunkLevel(this.drunkLevel);
    for (const link of this.links.values()) this.syncTracks(link);
    this.syncPeers(this.peers);
  }

  /** Otvori veze prema novim gostima, zatvori prema onima koji su otišli */
  syncPeers(peers: readonly Peer[]) {
    this.peers = peers;
    if (!this.myId) return;
    const hasMic = this.localStream !== null;
    const wanted = new Map<string, Peer>();
    for (const peer of peers) {
      if (peer.id !== this.myId && (hasMic || peer.mic)) wanted.set(peer.id, peer);
    }
    for (const id of [...this.links.keys()]) if (!wanted.has(id)) this.closeLink(id);
    for (const peer of wanted.values()) {
      const link = this.links.get(peer.id);
      if (link) link.guestId = peer.guestId;
      else this.createLink(peer.id, peer.guestId);
    }
  }

  async handleSignal(from: string, data: SignalData) {
    let link = this.links.get(from);
    if (!link) {
      const peer = this.peers.find((p) => p.id === from);
      link = this.createLink(from, peer?.guestId ?? "");
    }
    const { pc } = link;
    try {
      if (data.description) {
        const description = data.description as RTCSessionDescriptionInit;
        const collision = description.type === "offer" && (link.makingOffer || pc.signalingState !== "stable");
        link.ignoreOffer = !link.polite && collision;
        if (link.ignoreOffer) return;
        await pc.setRemoteDescription(description);
        if (description.type === "offer") {
          await pc.setLocalDescription();
          this.sendDescription(from, pc);
        }
      } else if (data.candidate) {
        try {
          await pc.addIceCandidate(data.candidate);
        } catch (err) {
          if (!link.ignoreOffer) throw err;
        }
      }
    } catch (err) {
      console.warn("Glasovni chat: signalizacija nije uspjela", err);
    }
  }

  /** Nakon korisnikovog dodira ponovno pokušaj pustiti zvuk (autoplay blokada) */
  async resumeAudio(): Promise<boolean> {
    await getContext()?.resume().catch(() => {});
    const results = await Promise.all(
      [...this.links.values()].map((link) => (link.audio ? link.audio.play().then(() => true, () => false) : true)),
    );
    return results.every(Boolean);
  }

  // ---------- interno ----------

  private createLink(peerId: string, guestId: string): PeerLink {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const link: PeerLink = {
      pc,
      sender: null,
      guestId,
      polite: this.myId > peerId,
      makingOffer: false,
      ignoreOffer: false,
      audio: null,
      source: null,
      analyser: null,
    };

    pc.onnegotiationneeded = async () => {
      try {
        link.makingOffer = true;
        await pc.setLocalDescription();
        this.sendDescription(peerId, pc);
      } catch (err) {
        console.warn("Glasovni chat: ponuda nije uspjela", err);
      } finally {
        link.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.send({ type: "signal", to: peerId, data: { candidate: candidate.toJSON() } });
    };
    pc.ontrack = ({ track, streams }) => {
      this.attachRemoteAudio(link, streams[0] ?? new MediaStream([track]));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") pc.restartIce();
    };

    this.links.set(peerId, link);
    this.syncTracks(link);
    return link;
  }

  private closeLink(peerId: string) {
    const link = this.links.get(peerId);
    if (!link) return;
    link.pc.onnegotiationneeded = null;
    link.pc.onicecandidate = null;
    link.pc.ontrack = null;
    link.pc.close();
    link.source?.disconnect();
    if (link.audio) {
      link.audio.srcObject = null;
      link.audio.remove();
    }
    this.links.delete(peerId);
    if (![...this.links.values()].some((l) => l.guestId === link.guestId)) this.levels.delete(link.guestId);
  }

  /** Dodaj ili makni moj mikrofon na vezi (okida ponovno pregovaranje) */
  private syncTracks(link: PeerLink) {
    const stream = this.localStream;
    const track = this.outgoingTrack();
    if (stream && track && !link.sender) {
      link.sender = link.pc.addTrack(track, stream);
    } else if (!stream && link.sender) {
      link.pc.removeTrack(link.sender);
      link.sender = null;
    }
  }

  /** Što šaljem: obrađeni "pijani" glas ako sam pijan i zvuk radi, inače sirovi mikrofon */
  private outgoingTrack(): MediaStreamTrack | null {
    const raw = this.localStream?.getAudioTracks()[0] ?? null;
    const processed = this.drunkChain?.destination.stream.getAudioTracks()[0] ?? null;
    const audioRunning = getContext()?.state === "running";
    return this.drunkLevel > 0 && processed && audioRunning ? processed : raw;
  }

  /** Zamijeni stazu na svim vezama bez ponovnog pregovaranja */
  private refreshOutgoing = () => {
    const track = this.outgoingTrack();
    if (!track) return;
    for (const link of this.links.values()) {
      if (link.sender && link.sender.track !== track) {
        link.sender.replaceTrack(track).catch((err) => console.warn("Glasovni chat: zamjena staze nije uspjela", err));
      }
    }
  };

  private createDrunkChain(ctx: AudioContext, stream: MediaStream) {
    const source = ctx.createMediaStreamSource(stream);
    const delay = ctx.createDelay(0.05);
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const shaper = ctx.createWaveShaper();
    const destination = ctx.createMediaStreamDestination();

    filter.type = "lowpass";
    lfo.connect(lfoGain).connect(delay.delayTime);
    source.connect(delay).connect(filter).connect(shaper).connect(destination);
    lfo.start();
    this.drunkChain = { source, delay, lfo, lfoGain, filter, shaper, destination };
  }

  private destroyDrunkChain() {
    const chain = this.drunkChain;
    if (!chain) return;
    chain.lfo.stop();
    chain.source.disconnect();
    chain.lfo.disconnect();
    chain.destination.stream.getTracks().forEach((t) => t.stop());
    this.drunkChain = null;
  }

  private sendDescription(to: string, pc: RTCPeerConnection) {
    const description = pc.localDescription;
    if (description) this.send({ type: "signal", to, data: { description: { type: description.type, sdp: description.sdp } } });
  }

  private attachRemoteAudio(link: PeerLink, stream: MediaStream) {
    if (!link.audio) {
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "");
      audio.style.display = "none";
      document.body.appendChild(audio);
      link.audio = audio;
    }
    link.audio.srcObject = stream;
    link.audio.play().catch(() => this.onAudioBlocked());

    const ctx = getContext();
    if (ctx) {
      link.source?.disconnect();
      link.source = ctx.createMediaStreamSource(stream);
      link.analyser = ctx.createAnalyser();
      link.analyser.fftSize = 512;
      // Samo mjerenje — zvuk pušta <audio> element
      link.source.connect(link.analyser);
    }
  }

  private rms(analyser: AnalyserNode) {
    analyser.getByteTimeDomainData(this.buffer);
    let sum = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const v = (this.buffer[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / this.buffer.length) * 7);
  }

  private measureLevels = () => {
    const measured = new Map<string, number>();
    if (this.localAnalyser && !this.muted && this.myGuestId) measured.set(this.myGuestId, this.rms(this.localAnalyser));
    for (const link of this.links.values()) {
      if (!link.analyser || !link.guestId) continue;
      measured.set(link.guestId, Math.max(measured.get(link.guestId) ?? 0, this.rms(link.analyser)));
    }
    for (const guestId of new Set([...this.levels.keys(), ...measured.keys()])) {
      const next = (this.levels.get(guestId) ?? 0) * 0.45 + (measured.get(guestId) ?? 0) * 0.55;
      if (next < 0.01 && !measured.has(guestId)) this.levels.delete(guestId);
      else this.levels.set(guestId, next);
    }
  };
}
