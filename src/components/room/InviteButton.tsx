"use client";

import { useState } from "react";

/** Na mobitelu otvara sistemski "Podijeli" (WhatsApp, Viber…), inače kopira link */
export default function InviteButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function invite() {
    const url = `${window.location.origin}/soba/${code}`;
    const text = `Pridruži se nazdravljanju na CheersAcross! Kod sobe: ${code}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: "CheersAcross", text, url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return; // korisnik je zatvorio dijalog
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Kopiraj link sobe:", url);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void invite()}
      className="pointer-events-auto flex h-10 items-center gap-2 rounded-full bg-amber-300 px-4 text-sm font-semibold text-stone-900 shadow-lg active:bg-amber-200"
    >
      {copied ? "Link kopiran ✓" : "Pozovi goste"}
    </button>
  );
}
