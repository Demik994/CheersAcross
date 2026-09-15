import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import RoomClient from "@/components/room/RoomClient";
import { normalizeRoomCode } from "@/lib/rooms/codes";
import { getRoomInfo, getRoomInvite } from "@/lib/rooms/service";

const DESCRIPTION = "Otvori link, odaberi lik i piće i nazdravi s ostalima za 3D stolom.";

/** Pregled linka u WhatsAppu/Viberu kad domaćin pošalje pozivnicu (slika: opengraph-image.tsx) */
export async function generateMetadata({ params }: PageProps<"/soba/[code]">): Promise<Metadata> {
  const code = normalizeRoomCode(decodeURIComponent((await params).code));
  const invite = code ? await getRoomInvite(code).catch(() => null) : null;
  const title = invite?.hostName ? `${invite.hostName} te zove na nazdravljanje 🥂` : "Pozvan si na nazdravljanje 🥂";
  return {
    title: `${title} | CheersAcross`,
    description: DESCRIPTION,
    openGraph: { title, description: DESCRIPTION, siteName: "CheersAcross", type: "website", locale: "hr_HR" },
    twitter: { card: "summary_large_image", title, description: DESCRIPTION },
  };
}

export default async function RoomPage({ params }: PageProps<"/soba/[code]">) {
  const { code: rawCode } = await params;
  const code = normalizeRoomCode(decodeURIComponent(rawCode));
  if (!code) notFound();
  if (code !== rawCode) redirect(`/soba/${code}`);

  const info = await getRoomInfo(code);
  if (!info) notFound();

  return <RoomClient code={code} hasPin={info.hasPin} />;
}
