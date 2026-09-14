import { handle, parseCode, readSession } from "@/lib/rooms/http";
import { authenticate, toRoomState } from "@/lib/rooms/service";

/** Stanje sobe za članove: slika i svi gosti s pićima (Faza 3: klijent ovo "polla") */
export async function GET(request: Request, ctx: RouteContext<"/api/rooms/[code]/state">) {
  return handle(async () => {
    const code = parseCode((await ctx.params).code);
    const { room, guests, me } = await authenticate(code, readSession(request));
    return Response.json(
      { state: toRoomState(room, guests), meId: me.id },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
