import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import RoomClient from "@/components/room/RoomClient";
import { normalizeRoomCode } from "@/lib/rooms/codes";
import { getRoomInfo } from "@/lib/rooms/service";

// Pregled linka u WhatsAppu/Viberu kad domaćin pošalje pozivnicu
export const metadata: Metadata = {
  title: "Pozvan si na nazdravljanje 🥂 | CheersAcross",
  description: "Otvori link, upiši ime, odaberi piće i nazdravi s ostalima.",
};

export default async function RoomPage({ params }: PageProps<"/soba/[code]">) {
  const { code: rawCode } = await params;
  const code = normalizeRoomCode(decodeURIComponent(rawCode));
  if (!code) notFound();
  if (code !== rawCode) redirect(`/soba/${code}`);

  const info = await getRoomInfo(code);
  if (!info) notFound();

  return <RoomClient code={code} hasPin={info.hasPin} />;
}
