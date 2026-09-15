"use client";

import { useState, type FormEvent } from "react";
import AvatarPicker, { DEFAULT_LOOK } from "@/components/avatar/AvatarPicker";
import { Field, FormError, PinInput, inputClass, primaryButtonClass } from "@/components/ui/fields";
import { roomApi, type Look } from "@/lib/roomApi";
import { NAME_MAX_LENGTH, PIN_LENGTH } from "@/lib/rooms/types";
import { saveSession } from "@/lib/session";

export default function JoinForm({ code, hasPin }: { code: string; hasPin: boolean }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [look, setLook] = useState<Look>(DEFAULT_LOOK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (hasPin && pin.length !== PIN_LENGTH) {
      setError(`Upiši PIN od ${PIN_LENGTH} znamenki.`);
      return;
    }
    setBusy(true);
    try {
      const { session } = await roomApi.join(code, name, hasPin ? pin : null, look);
      saveSession(code, session); // RoomClient se sam prebaci na pogled sobe
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nešto je pošlo po krivu.");
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh w-full justify-center bg-[radial-gradient(ellipse_at_top,#3a2416_0%,#1a120d_60%)] px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="flex w-full max-w-md flex-col gap-6">
        <header className="flex flex-col items-center gap-2 text-center">
          <div className="text-5xl" aria-hidden>
            🥂
          </div>
          <h1 className="text-2xl font-semibold">Pozvan si na nazdravljanje!</h1>
          <p className="text-foreground/70">
            Soba <span className="font-mono font-semibold tracking-widest text-amber-200">{code}</span>
          </p>
        </header>

        <form onSubmit={submit} className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <Field label="Kako se zoveš?" hint="Ime će biti iznad tvog lika za stolom.">
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={NAME_MAX_LENGTH}
              placeholder="npr. Marko"
              autoComplete="given-name"
              autoFocus
              required
            />
          </Field>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground/80">Odaberi svoj lik</span>
            <AvatarPicker value={look} onChange={setLook} />
          </div>

          {hasPin && (
            <Field label="PIN sobe" hint="Domaćin ti ga je trebao poslati uz link.">
              <PinInput value={pin} onChange={setPin} />
            </Field>
          )}

          <FormError message={error} />
          <button type="submit" disabled={busy} className={primaryButtonClass}>
            {busy ? "Ulazimo…" : "Sjedni za stol"}
          </button>
        </form>
      </div>
    </main>
  );
}
