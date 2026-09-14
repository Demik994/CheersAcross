import { blobToken, envNames, readEnv, redisToken, redisUrl } from "@/lib/env";
import { PARTY_NAME } from "@/lib/party/protocol";

/**
 * Brza provjera konfiguracije nakon deploya: /api/health
 * Vraća samo da/ne i duljine vrijednosti — nikad same tajne.
 */
export async function GET() {
  const redis = Boolean(redisUrl() && redisToken());
  const blob = Boolean(blobToken());
  const partyUrl = readEnv(...envNames.partyUrl);
  const partySecretValue = readEnv(...envNames.partySecret);

  let partyReachable = false;
  let secretMatches = false;
  if (partyUrl) {
    try {
      // Namjerno neispravno tijelo s pravom tajnom: 400 = tajna prihvaćena, 401 = tajne se ne podudaraju.
      // Server odbije zahtjev prije ikakve promjene stanja.
      const res = await fetch(`${partyUrl.replace(/\/$/, "")}/parties/${PARTY_NAME}/health-check`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${partySecretValue ?? ""}` },
        body: "{}",
        signal: AbortSignal.timeout(4000),
        cache: "no-store",
      });
      partyReachable = res.status < 500;
      secretMatches = Boolean(partySecretValue) && res.status === 400;
    } catch {
      partyReachable = false;
    }
  }

  // Dijagnostika: za varijable baze i spremišta samo duljina vrijednosti (0 = prazno)
  const storageEnvLengths = Object.fromEntries(
    [...envNames.redisUrl, ...envNames.redisToken, ...envNames.blobToken].map((name) => [
      name,
      process.env[name]?.trim().length ?? null,
    ]),
  );

  const ok = redis && blob && secretMatches;
  return Response.json(
    {
      ok,
      redis,
      blob,
      storageEnvLengths,
      deployment: process.env.VERCEL_ENV ?? "local",
      party: { url: Boolean(partyUrl), secret: Boolean(partySecretValue), reachable: partyReachable, secretMatches },
    },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
