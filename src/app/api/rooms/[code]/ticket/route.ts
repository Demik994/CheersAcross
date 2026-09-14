import { issueTicket, partyPublicHost, publishRoomState } from "@/lib/party/server";
import { handle, parseCode, readSession } from "@/lib/rooms/http";
import { authenticate } from "@/lib/rooms/service";

/**
 * Tiket za spajanje na real-time server (vrijedi 10 min; preglednik traži novi
 * pri svakom ponovnom spajanju). Prije izdavanja osvježimo stanje sobe na
 * real-time serveru, da novi gost odmah dobije točan popis gostiju.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/rooms/[code]/ticket">) {
  return handle(async () => {
    const code = parseCode((await ctx.params).code);
    const { me } = await authenticate(code, readSession(request));
    await publishRoomState(code);
    return Response.json(
      { ticket: await issueTicket(code, me.id), host: partyPublicHost(request) },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
