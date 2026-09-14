"use client";

import { useRef, useState } from "react";
import { compressImage } from "@/lib/compressImage";

type Props = {
  photoUrl: string | null;
  onUpload: (photo: Blob) => Promise<void>;
  onRemove: () => Promise<void>;
};

export default function PhotoUpload({ photoUrl, onUpload, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nešto je pošlo po krivu.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Odaberi sliku (JPG, PNG…).");
      return;
    }
    void run(async () => onUpload(await compressImage(file)));
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      <div className="flex items-center gap-2">
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- mali thumbnail s Blob/lokalnog URL-a
          <img src={photoUrl} alt="Slika slavlja" className="size-11 shrink-0 rounded-lg border border-white/15 object-cover" />
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="h-11 min-w-0 flex-1 truncate rounded-xl border border-white/15 bg-white/5 px-3 text-sm font-medium active:bg-white/10 disabled:opacity-60"
        >
          {busy ? "Učitavanje…" : photoUrl ? "Promijeni" : "📷 Dodaj sliku slavlja"}
        </button>
        {photoUrl && !busy && (
          <button
            type="button"
            onClick={() => void run(onRemove)}
            aria-label="Ukloni sliku"
            className="size-11 shrink-0 rounded-xl border border-white/15 bg-white/5 text-lg active:bg-white/10"
          >
            ✕
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
