"use client";

/**
 * "Pijani" glas: pomak visine tona (gore = "vjeverica", dolje = "medvjed").
 *
 * Web Audio nema gotov pitch shifter, pa ga radimo u AudioWorkletu (zaseban audio thread):
 * granularni pomak visine — dvije "glave" čitaju nedavni zvuk brže ili sporije od stvarnog
 * vremena i međusobno se pretapaju (sin² prozori), pa se tempo ne mijenja, samo visina.
 * Kad je pomak nula, obje glave čitaju sadašnji uzorak — nema jeke.
 */
export const DRUNK_PITCH_PROCESSOR = "cheers-drunk-pitch";

const WORKLET_SOURCE = /* js */ `
const GRAINS_PER_SECOND = 9;
const MAX_DELAY_SECONDS = 0.12;

class DrunkPitchProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // pomak u polutonovima: pozitivno = viši glas, negativno = dublji (0 = bez efekta)
      { name: "semitones", defaultValue: 0, minValue: -12, maxValue: 12, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();
    this.length = Math.ceil(sampleRate * MAX_DELAY_SECONDS) + 2;
    this.buffer = new Float32Array(this.length);
    this.write = 0;
    this.grain = 0;
  }

  read(delay) {
    let position = this.write - 1 - delay;
    while (position < 0) position += this.length;
    const i0 = Math.floor(position);
    const frac = position - i0;
    const i1 = (i0 + 1) % this.length;
    return this.buffer[i0] * (1 - frac) + this.buffer[i1] * frac;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0] && inputs[0][0];
    const output = outputs[0];
    if (!output || output.length === 0) return true;
    const frames = output[0].length;

    const ratio = Math.pow(2, parameters.semitones[0] / 12);
    const maxDelay = this.length - 3;
    const span = Math.min(maxDelay, (Math.abs(ratio - 1) * sampleRate) / GRAINS_PER_SECOND);
    const grainStep = GRAINS_PER_SECOND / sampleRate;

    for (let i = 0; i < frames; i++) {
      this.buffer[this.write] = input ? input[i] : 0;
      this.write = (this.write + 1) % this.length;
      this.grain = (this.grain + grainStep) % 1;

      let sample = 0;
      for (let k = 0; k < 2; k++) {
        const phase = (this.grain + k * 0.5) % 1;
        // viši glas: kašnjenje se smanjuje (čitamo brže); dublji: raste
        const delay = ratio > 1 ? span * (1 - phase) : span * phase;
        const window = Math.sin(Math.PI * phase);
        sample += this.read(delay) * window * window;
      }
      for (let c = 0; c < output.length; c++) output[c][i] = sample;
    }
    return true;
  }
}

registerProcessor("${DRUNK_PITCH_PROCESSOR}", DrunkPitchProcessor);
`;

const loaded = new WeakMap<BaseAudioContext, Promise<boolean>>();

/** Učita procesor u zadani AudioContext (jednom). false = preglednik ne podržava AudioWorklet */
export function loadDrunkPitch(ctx: BaseAudioContext): Promise<boolean> {
  let promise = loaded.get(ctx);
  if (!promise) {
    if (!ctx.audioWorklet) {
      promise = Promise.resolve(false);
    } else {
      const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "text/javascript" }));
      promise = ctx.audioWorklet
        .addModule(url)
        .then(() => true)
        .catch((err) => {
          console.warn("Pijani glas: AudioWorklet se nije učitao", err);
          return false;
        })
        .finally(() => URL.revokeObjectURL(url));
    }
    loaded.set(ctx, promise);
  }
  return promise;
}
