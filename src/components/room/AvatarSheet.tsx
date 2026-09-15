"use client";

import { useState } from "react";
import AvatarPicker from "@/components/avatar/AvatarPicker";
import { primaryButtonClass } from "@/components/ui/fields";
import type { Look } from "@/lib/roomApi";

type Props = {
  initial: Look;
  color: string;
  onSave: (look: Look) => Promise<void>;
  onClose: () => void;
};

/** Promjena vlastitog lika u sobi */
export default function AvatarSheet({ initial, color, onSave, onClose }: Props) {
  const [look, setLook] = useState<Look>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = look.avatar !== initial.avatar || look.skin !== initial.skin;

  async function save() {
    setError(null);
    setBusy(true);
    try {
      await onSave(look);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Spremanje nije uspjelo.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Moj lik"
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-stone-900 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Moj lik</h2>
          <button type="button" onClick={onClose} aria-label="Zatvori" className="size-10 rounded-full text-xl active:bg-white/10">
            ✕
          </button>
        </div>
        <AvatarPicker value={look} onChange={setLook} previewColor={color} />
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-300">
            {error}
          </p>
        )}
        <button type="button" disabled={!changed || busy} onClick={() => void save()} className={`${primaryButtonClass} mt-4`}>
          {busy ? "Spremanje…" : "Spremi"}
        </button>
      </div>
    </div>
  );
}
