import HomeForms from "@/components/home/HomeForms";

export default function Home() {
  return (
    <main className="flex min-h-dvh w-full justify-center bg-[radial-gradient(ellipse_at_top,#3a2416_0%,#1a120d_60%)] px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <div className="flex w-full max-w-md flex-col items-center gap-8">
        <header className="flex flex-col items-center gap-2 text-center">
          <div className="text-5xl" aria-hidden>
            🥂
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">CheersAcross</h1>
          <p className="text-foreground/70">
            Nazdravi s prijateljima, gdje god bili. Napravi sobu, pošalji link i kucnite se čašama.
          </p>
        </header>
        <HomeForms />
      </div>
    </main>
  );
}
