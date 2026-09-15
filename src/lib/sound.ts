"use client";

/**
 * Zvukovi generirani u pregledniku (Web Audio) — bez datoteka za preuzimanje.
 *
 * Preglednici (posebno iOS Safari) puštaju zvuk tek nakon korisnikove interakcije,
 * zato `unlockAudio()` treba pozvati na prvi dodir/klik na stranici.
 * Napomena: na iPhoneu s uključenim "tihim" prekidačem Web Audio je utišan.
 */
let context: AudioContext | null = null;

/** Zajednički AudioContext (koristi ga i glasovni chat za mjerenje glasnoće) */
export function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!context) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
  }
  return context;
}

export function unlockAudio() {
  const ctx = getContext();
  if (ctx?.state === "suspended") void ctx.resume();
}

/** Jedan "zvon" staklene čaše: nekoliko neharmonijskih prizvuka koji brzo zamiru */
function ring(ctx: AudioContext, start: number, baseFreq: number, gain: number, decay: number) {
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, start);
  master.gain.linearRampToValueAtTime(gain, start + 0.004);
  master.gain.exponentialRampToValueAtTime(0.0001, start + decay);
  master.connect(ctx.destination);

  // Omjeri prizvuka približno odgovaraju tankostijenoj čaši
  const partials: [number, number][] = [
    [1, 1],
    [2.32, 0.55],
    [4.25, 0.3],
    [6.63, 0.16],
  ];
  for (const [ratio, amplitude] of partials) {
    const osc = ctx.createOscillator();
    const partialGain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(baseFreq * ratio * (1 + (Math.random() - 0.5) * 0.004), start);
    // viši prizvuci zamiru brže
    partialGain.gain.setValueAtTime(amplitude, start);
    partialGain.gain.exponentialRampToValueAtTime(0.0001, start + decay / Math.sqrt(ratio));
    osc.connect(partialGain).connect(master);
    osc.start(start);
    osc.stop(start + decay + 0.05);
  }
}

/** "Cling!" — dvije čaše se kucnu (dva gotovo istovremena udarca, blago različite visine) */
export function playClink(volume = 1) {
  const ctx = getContext();
  if (!ctx || ctx.state !== "running") return;
  const now = ctx.currentTime + 0.01;
  const base = 1900 + Math.random() * 500;
  ring(ctx, now, base, 0.22 * volume, 1.4);
  ring(ctx, now + 0.012, base * 1.07, 0.16 * volume, 1.1);
}

/** "Bleeergh" — filtrirani šum koji klizi prema dolje (crtićko povraćanje) */
export function playVomit() {
  const ctx = getContext();
  if (!ctx || ctx.state !== "running") return;
  const duration = 1.3;
  const now = ctx.currentTime + 0.02;

  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    // "smeđi" šum — dublji i mekši od bijelog
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 3;
  filter.frequency.setValueAtTime(900, now);
  filter.frequency.exponentialRampToValueAtTime(220, now + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.9, now + 0.08);
  gain.gain.setValueAtTime(0.9, now + 0.5);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start(now);
  noise.stop(now + duration);
}

/** Tup udarac tijela o pod (pad sa stola) */
export function playThud() {
  const ctx = getContext();
  if (!ctx || ctx.state !== "running") return;
  const now = ctx.currentTime + 0.02;

  // duboki "bum": sinus koji brzo pada po visini
  const body = ctx.createOscillator();
  body.type = "sine";
  body.frequency.setValueAtTime(110, now);
  body.frequency.exponentialRampToValueAtTime(38, now + 0.35);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.0001, now);
  bodyGain.gain.exponentialRampToValueAtTime(1, now + 0.012);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  body.connect(bodyGain).connect(ctx.destination);
  body.start(now);
  body.stop(now + 0.55);

  // kratak šum udarca
  const length = Math.floor(ctx.sampleRate * 0.12);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.6;
  noise.connect(filter).connect(noiseGain).connect(ctx.destination);
  noise.start(now);
}

/** Kratka svečana melodija kad se otkrije slika */
export function playCelebration() {
  const ctx = getContext();
  if (!ctx || ctx.state !== "running") return;
  const now = ctx.currentTime + 0.02;
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => ring(ctx, now + i * 0.11, freq, 0.12, 1.6));
}
