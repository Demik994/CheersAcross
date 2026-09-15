import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { normalizeRoomCode } from "@/lib/rooms/codes";
import { getRoomInvite } from "@/lib/rooms/service";

export const alt = "Pozivnica na nazdravljanje u CheersAcross";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Ime domaćina se čita iz baze, pa slika ne smije biti generirana samo jednom pri buildu
export const dynamic = "force-dynamic";

const SUBTITLE = "Odaberi lik i piće i kucnite se čašama za 3D stolom";
const BRAND = "CheersAcross";

/**
 * Inter s Google Fontsa, samo za znakove koji se pojavljuju na slici (nekoliko KB).
 * Jedna datoteka sadrži i č, ć, ž, š, đ — generator slike s podijeljenim datotekama
 * (latin / latin-ext) riječi s tim slovima iscrtava krivim fontom.
 */
async function loadInter(text: string): Promise<ArrayBuffer | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=Inter:wght@700&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(url, { signal: AbortSignal.timeout(3000) })).text();
    const source = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    if (!source) return null;
    const res = await fetch(source, { signal: AbortSignal.timeout(3000) });
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** Rezerva bez interneta: lokalni Inter (OFL), latin + latin-ext */
async function localInter() {
  const dir = join(process.cwd(), "assets/fonts");
  return Promise.all([
    readFile(join(dir, "inter-latin-700-normal.woff")),
    readFile(join(dir, "inter-latin-ext-700-normal.woff")),
  ]);
}

/**
 * Slika za pregled linka. Namjerno NE prikazuje sliku slavlja — ona je iznenađenje za zdravicu.
 */
export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  const code = normalizeRoomCode(decodeURIComponent((await params).code));
  const invite = code ? await getRoomInvite(code).catch(() => null) : null;
  const headline = invite?.hostName ? `${invite.hostName} te zove na nazdravljanje` : "Pozvan si na nazdravljanje";

  const subset = await loadInter(headline + SUBTITLE + BRAND);
  const fonts = subset
    ? [{ name: "Inter", data: subset, weight: 700 as const, style: "normal" as const }]
    : (await localInter()).map((data) => ({ name: "Inter", data, weight: 700 as const, style: "normal" as const }));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(circle at 50% 35%, #5a3520 0%, #2a1a10 55%, #140d08 100%)",
          color: "#f5ede4",
          fontFamily: "Inter",
          padding: "60px 80px",
        }}
      >
        <div style={{ display: "flex", fontSize: 150, lineHeight: 1 }}>🥂</div>
        <div
          style={{
            display: "flex",
            marginTop: 36,
            fontSize: headline.length > 32 ? 58 : 68,
            fontWeight: 700,
            textAlign: "center",
            lineHeight: 1.15,
          }}
        >
          {headline}
        </div>
        <div style={{ display: "flex", marginTop: 22, fontSize: 31, fontWeight: 700, color: "#d9c2a6" }}>{SUBTITLE}</div>
        <div
          style={{
            display: "flex",
            marginTop: 44,
            padding: "14px 34px",
            borderRadius: 999,
            background: "#fcd34d",
            color: "#1c1917",
            fontSize: 34,
            fontWeight: 700,
          }}
        >
          {BRAND}
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
