# CheersAcross 🥂

Virtualno nazdravljanje za rođendane, proslave i druženja na daljinu. Domaćin napravi sobu,
pošalje link, gosti sjednu za 3D stol kao čovječuljci, odaberu piće i — kad su svi spremni —
kucnu se čašama.

## Tehnologije

- **Next.js 16** (App Router, TypeScript, Tailwind CSS) — UI i REST API
- **React Three Fiber + drei** — 3D scena (stol, čaše, likovi)
- **PartyServer** na Cloudflare Workersima (Durable Objects) — real-time: prisutnost, spremnost, vučenje čaša
- **Upstash Redis** — sobe i gosti (brišu se 24 h nakon kreiranja)
- **Vercel Blob** — slika razloga slavlja

## Pokretanje lokalno

```bash
npm install
cp party/.dev.vars.example party/.dev.vars
npm run dev
```

`npm run dev` pokreće Next.js na <http://localhost:3000> i real-time server na portu 1999.
Za lokalni razvoj ne trebaju nikakvi računi: sobe se drže u memoriji, a slike u `.local-uploads/`.

Za testiranje s mobitela na istoj Wi-Fi mreži otvori `http://<IP-računala>:3000`.

## Korisne naredbe

| Naredba | Opis |
| --- | --- |
| `npm run dev` | Next.js + real-time server |
| `npm run typecheck` | TypeScript provjera (app i Worker) |
| `npm run lint` | ESLint |
| `npm run party:types` | Regenerira Cloudflare tipove nakon promjene `party/wrangler.jsonc` |
| `npm run party:deploy` | Deploy real-time servera na Cloudflare |

## Struktura

```
src/app/            stranice i API rute (/soba/[code], /api/rooms/...)
src/components/     scene/ (3D), room/ (soba), ui/ (zajednički UI)
src/lib/rooms/      sobe, gosti, PIN, spremište (Redis / memorija)
src/lib/party/      protokol i tiketi za real-time server
party/              Cloudflare Worker s PartyServerom
```

Varijable okruženja za produkciju opisane su u [.env.example](.env.example).

## Deploy

1. **Real-time server (Cloudflare):** `npx wrangler login`, zatim `npm run party:deploy`
   i `npx wrangler secret put PARTY_SECRET --config party/wrangler.jsonc`.
2. **Vercel:** u projektu dodaj *Storage → Upstash Redis* i *Storage → Blob (public)*,
   te varijable `PARTY_SECRET` (ista kao u Cloudflareu) i `PARTY_URL` (adresa Workera).
3. Redeploy na Vercelu i provjeri `https://<tvoja-domena>/api/health` — sve mora biti `true`.
