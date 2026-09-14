import { publishRoomState } from "@/lib/party/server";
import { handle, parseCode, readSession } from "@/lib/rooms/http";
import { kickGuest } from "@/lib/rooms/service";

/** Domaćin uklanja gosta (npr. nekoga tko je otišao, a nazdravljanje čeka na njega) */
export async function DELETE(request: Request, ctx: RouteContext<"/api/rooms/[code]/guests/[guestId]">) {
  return handle(async () => {
    const params = await ctx.params;
    const code = parseCode(params.code);
    await kickGuest(code, readSession(request), params.guestId);
    await publishRoomState(code);
    return new Response(null, { status: 204 });
  });
}
