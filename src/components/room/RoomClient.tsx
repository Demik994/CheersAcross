"use client";

import { useGuestSession } from "@/lib/session";
import JoinForm from "./JoinForm";
import RoomView from "./RoomView";

export default function RoomClient({ code, hasPin }: { code: string; hasPin: boolean }) {
  const session = useGuestSession(code);

  if (session === undefined) {
    return <FullscreenMessage text="Ulazimo u sobu…" />;
  }
  if (!session) {
    return <JoinForm code={code} hasPin={hasPin} />;
  }
  return <RoomView code={code} session={session} />;
}

export function FullscreenMessage({ text }: { text: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 text-center text-sm text-foreground/60">
      {text}
    </main>
  );
}
