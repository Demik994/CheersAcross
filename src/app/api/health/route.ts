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
  if (partyUrl) {
    try {
      // Worker odgovara (i s 404) — važno je samo da je dostupan
      const res = await fetch(partyUrl, { signal: AbortSignal.timeout(3000), cache: "no-store" });
      partyReachable = res.status < 500;
    } catch {
      partyReachable = false;
    }
  }

  const ok = redis && blob && partySecret && partyReachable;
  return Response.json(
    { ok, redis, blob, party: { url: Boolean(partyUrl), secret: partySecret, reachable: partyReachable } },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
