"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import AvatarPicker, { DEFAULT_LOOK } from "@/components/avatar/AvatarPicker";
import { Field, FormError, PinInput, inputClass, primaryButtonClass } from "@/components/ui/fields";
import { roomApi, type Look } from "@/lib/roomApi";
import { ROOM_CODE_LENGTH, normalizeRoomCode } from "@/lib/rooms/codes";
import { NAME_MAX_LENGTH, PIN_LENGTH } from "@/lib/rooms/types";
import { saveSession } from "@/lib/session";

export default function HomeForms() {
  return (
    <div className="flex w-full flex-col gap-4">
      <CreateRoomForm />
      <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-foreground/40">
        <span className="h-px flex-1 bg-white/10" />
        ili
        <span className="h-px flex-1 bg-white/10" />
      </div>
      <JoinByCodeForm />
    </div>
  );
}

function CreateRoomForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [usePin, setUsePin] = useState(false);
  const [pin, setPin] = useState("");
  const [look, setLook] = useState<Look>(DEFAULT_LOOK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (usePin && pin.length !== PIN_LENGTH) {
      setError(`PIN mora imati ${PIN_LENGTH} znamenki.`);
      return;
    }
    setBusy(true);
    try {
      const { code, session } = await roomApi.create(name, usePin ? pin : null, look);
      saveSession(code, session);
      router.push(`/soba/${code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nešto je pošlo po krivu.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <h2 className="text-lg font-semibold">Napravi sobu 🥂</h2>
      <Field label="Tvoje ime">
        <input
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NAME_MAX_LENGTH}
          placeholder="npr. Ana"
          autoComplete="given-name"
          required
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground/80">Tvoj lik za stolom</span>
        <AvatarPicker value={look} onChange={setLook} />
      </div>

      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={usePin}
          onChange={(e) => setUsePin(e.target.checked)}
          className="size-5 accent-amber-300"
        />
        Zaštiti sobu PIN-om
      </label>
      {usePin && (
        <Field label="PIN (6 znamenki)" hint="Pošalji ga gostima zajedno s linkom.">
          <PinInput value={pin} onChange={setPin} />
        </Field>
      )}

      <FormError message={error} />
      <button type="submit" disabled={busy} className={primaryButtonClass}>
        {busy ? "Pripremamo sobu…" : "Napravi sobu"}
      </button>
    </form>
  );
}

function JoinByCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const normalized = normalizeRoomCode(code);
    if (!normalized) {
      setError(`Kod sobe ima ${ROOM_CODE_LENGTH} znakova (slova i brojke).`);
      return;
    }
    router.push(`/soba/${normalized}`);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <h2 className="text-lg font-semibold">Imaš kod sobe?</h2>
      <div className="flex gap-2">
        <input
          className={`${inputClass} text-center font-mono text-lg uppercase tracking-[0.3em]`}
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase().slice(0, ROOM_CODE_LENGTH + 2));
            setError(null);
          }}
          placeholder="ABCD23"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-label="Kod sobe"
        />
        <button type="submit" className="h-12 shrink-0 rounded-xl border border-white/15 bg-white/10 px-5 font-semibold active:bg-white/15">
          Uđi
        </button>
      </div>
      <FormError message={error} />
    </form>
  );
}
