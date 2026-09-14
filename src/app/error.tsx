"use client"; // Error boundary mora biti klijentska komponenta

import Link from "next/link";
import { useEffect } from "react";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="text-5xl" aria-hidden>
        😵
      </div>
      <h1 className="text-2xl font-semibold">Ups, nešto je pošlo po krivu</h1>
      <p className="max-w-sm text-foreground/70">
        Pokušaj ponovno za trenutak. Ako se greška ponavlja, provjeri internetsku vezu.
      </p>
      <div className="mt-2 flex gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-xl bg-amber-300 px-5 py-3 font-semibold text-stone-900 active:bg-amber-200"
        >
          Pokušaj ponovno
        </button>
        <Link href="/" className="rounded-xl border border-white/15 px-5 py-3 font-semibold active:bg-white/10">
          Početna
        </Link>
      </div>
    </main>
  );
}
