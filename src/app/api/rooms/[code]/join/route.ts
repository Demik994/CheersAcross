import { publishRoomState } from "@/lib/party/server";
import { handle, parseCode, readJson } from "@/lib/rooms/http";
import { joinRoom } from "@/lib/rooms/service";

export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[code]/join">) {
  return handle(async () => {
    const code = parseCode((await ctx.params).code);
    const body = await readJson(request);
    const result = await joinRoom(code, { name: body.name, pin: body.pin, avatar: body.avatar, skin: body.skin });
    await publishRoomState(code);
    return Response.json(result, { status: 201 });
  });
}
