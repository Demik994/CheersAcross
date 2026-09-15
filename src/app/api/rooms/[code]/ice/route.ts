import { envNames, readEnv } from "@/lib/env";
import { handle, parseCode, readSession } from "@/lib/rooms/http";
import { authenticate } from "@/lib/rooms/service";

/** Kratkotrajni TURN podaci traju dulje od najduže proslave, ali ne cijelu sobu */
const TURN_TTL_SECONDS = 8 * 60 * 60;
const STUN_ONLY: RTCIceServer[] = [{ urls: ["stun:stun.cloudflare.com:3478"] }];

type IceServer = { urls: string | string[]; username?: string; credential?: string };

/**
 * ICE poslužitelji za glasovni chat (samo za članove sobe).
 * S Cloudflare TURN ključem glas radi i na mobilnim mrežama iza strožih NAT-ova;
 * bez ključa (lokalni razvoj) koristi se samo STUN.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/rooms/[code]/ice">) {
  return handle(async () => {
    const code = parseCode((await ctx.params).code);
    await authenticate(code, readSession(request));

    const keyId = readEnv(...envNames.turnKeyId);
    const apiToken = readEnv(...envNames.turnApiToken);
    if (!keyId || !apiToken) {
      return Response.json({ iceServers: STUN_ONLY, turn: false }, { headers: { "Cache-Control": "no-store" } });
    }

    try {
      const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
        method: "POST",
        headers: { authorization: `Bearer ${apiToken}`, "content-type": "application/json" },
        body: JSON.stringify({ ttl: TURN_TTL_SECONDS }),
        signal: AbortSignal.timeout(4000),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Cloudflare TURN ${res.status}`);
      const data = (await res.json()) as { iceServers?: IceServer[] };
      // Port 53 preglednici blokiraju — samo bi usporio spajanje
      const iceServers = (data.iceServers ?? []).map((server) => ({
        ...server,
        urls: (Array.isArray(server.urls) ? server.urls : [server.urls]).filter((url) => !/:53(\?|$)/.test(url)),
      }));
      return Response.json({ iceServers, turn: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      console.warn("TURN podaci nisu dostupni, koristi se samo STUN", err instanceof Error ? err.message : err);
      return Response.json({ iceServers: STUN_ONLY, turn: false }, { headers: { "Cache-Control": "no-store" } });
    }
  });
}
