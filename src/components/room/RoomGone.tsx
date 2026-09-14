import Link from "next/link";

export default function RoomGone() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="text-5xl" aria-hidden>
        🤷
      </div>
      <h1 className="text-2xl font-semibold">Soba ne postoji</h1>
      <p className="max-w-sm text-foreground/70">
        Provjeri je li link ispravan. Sobe se automatski brišu 24 sata nakon što su napravljene.
      </p>
      <Link href="/" className="mt-2 rounded-xl bg-amber-300 px-5 py-3 font-semibold text-stone-900 active:bg-amber-200">
        Napravi novu sobu
      </Link>
    </main>
  );
}
