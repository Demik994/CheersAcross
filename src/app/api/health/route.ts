import { PARTY_NAME } from "@/lib/party/protocol";

/**
 * Brza provjera konfiguracije nakon deploya: /api/health
 * Vraća samo da/ne za svaki servis — nikad vrijednosti tajni.
 */
export async function GET() {
  const redis = Boolean(
    (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL) &&
      (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN),
  );
  const blob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const partyUrl = process.env.PARTY_URL;
  const partySecret = Boolean(process.env.PARTY_SECRET);

  let partyReachable = false;
  let secretMatches = false;
  if (partyUrl) {
    try {
      // Namjerno neispravno tijelo s pravom tajnom: 400 = tajna prihvaćena, 401 = tajne se ne podudaraju.
      // Server odbije zahtjev prije ikakve promjene stanja.
      const res = await fetch(`${partyUrl.replace(/\/$/, "")}/parties/${PARTY_NAME}/health-check`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${process.env.PARTY_SECRET ?? ""}` },
        body: "{}",
        signal: AbortSignal.timeout(4000),
        cache: "no-store",
      });
      partyReachable = res.status < 500;
      secretMatches = partySecret && res.status === 400;
    } catch {
      partyReachable = false;
    }
  }

  const ok = redis && blob && secretMatches;
  // Dijagnostika: samo IMENA varijabli za bazu i spremište (bez vrijednosti), da se vidi
  // je li Vercel integracija spojena na baš ovaj projekt i s kojim prefiksom
  const storageEnvNames = Object.keys(process.env)
    .filter((name) => /(^|_)(KV|REDIS|UPSTASH|BLOB)(_|$)|READ_WRITE_TOKEN/.test(name))
    .sort();

  return Response.json(
    {
      ok,
      redis,
      blob,
      storageEnvNames,
      deployment: process.env.VERCEL_ENV ?? "local",
      party: { url: Boolean(partyUrl), secret: partySecret, reachable: partyReachable, secretMatches },
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
