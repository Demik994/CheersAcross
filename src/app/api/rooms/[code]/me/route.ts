import { publishRoomState } from "@/lib/party/server";
import { handle, parseCode, readJson, readSession } from "@/lib/rooms/http";
import { leaveRoom, updateMe } from "@/lib/rooms/service";

/** Promjena vlastitog pića i/ili izgleda */
export async function PATCH(request: Request, ctx: RouteContext<"/api/rooms/[code]/me">) {
  return handle(async () => {
    const code = parseCode((await ctx.params).code);
    const body = await readJson(request);
    await updateMe(code, readSession(request), { drink: body.drink, avatar: body.avatar, skin: body.skin });
    await publishRoomState(code);
    return new Response(null, { status: 204 });
  });
}

/** Izlazak iz sobe */
export async function DELETE(request: Request, ctx: RouteContext<"/api/rooms/[code]/me">) {
  return handle(async () => {
    const code = parseCode((await ctx.params).code);
    await leaveRoom(code, readSession(request));
    await publishRoomState(code);
    return new Response(null, { status: 204 });
  });
}
