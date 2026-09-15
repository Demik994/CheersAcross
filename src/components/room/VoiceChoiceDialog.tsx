"use client";

import type { VoiceMode } from "@/lib/voicePreference";

type Props = {
  current: VoiceMode | null;
  onChoose: (mode: VoiceMode) => void;
  /** Samo kad gost već ima odabir (promjena iz zaglavlja) */
  onClose?: () => void;
};

/** Pri ulasku u sobu: razgovor mikrofonom (otvoren cijelo vrijeme) ili samo tipkanjem */
export default function VoiceChoiceDialog({ current, onChoose, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Kako želiš razgovarati?"
        className="w-full max-w-md rounded-t-3xl border border-white/10 bg-stone-900 px-4 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-center text-lg font-semibold">Kako želiš razgovarati?</h2>
        <p className="mt-1 text-center text-sm text-foreground/60">Uvijek možeš pisati poruke u oblačiću iznad svog lika.</p>

        <div className="mt-4 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => onChoose("mic")}
            className={`flex items-center gap-4 rounded-2xl border p-4 text-left active:bg-white/10 ${
              current === "mic" ? "border-amber-300/80 bg-amber-300/10" : "border-white/10 bg-white/[0.04]"
            }`}
          >
            <span className="text-3xl" aria-hidden>
              🎤
            </span>
            <span className="flex flex-col">
              <span className="font-semibold">Mikrofon</span>
              <span className="text-sm text-foreground/60">Pričaj s ostalima cijelo vrijeme. Utišati se možeš gumbom gore.</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => onChoose("text")}
            className={`flex items-center gap-4 rounded-2xl border p-4 text-left active:bg-white/10 ${
              current === "text" ? "border-amber-300/80 bg-amber-300/10" : "border-white/10 bg-white/[0.04]"
            }`}
          >
            <span className="text-3xl" aria-hidden>
              ⌨️
            </span>
            <span className="flex flex-col">
              <span className="font-semibold">Samo tipkanje</span>
              <span className="text-sm text-foreground/60">Ne šalješ zvuk, ali i dalje čuješ one koji pričaju.</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
