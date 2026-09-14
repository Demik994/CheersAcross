import { handle, parseCode, readJson, readSession } from "@/lib/rooms/http";
import { leaveRoom, setDrink } from "@/lib/rooms/service";

/** Promjena vlastitog pića */
export async function PATCH(request: Request, ctx: RouteContext<"/api/rooms/[code]/me">) {
  return handle(async () => {
    const code = parseCode((await ctx.params).code);
    const body = await readJson(request);
    await setDrink(code, readSession(request), body.drink);
    return new Response(null, { status: 204 });
  });
}

/** Izlazak iz sobe */
export async function DELETE(request: Request, ctx: RouteContext<"/api/rooms/[code]/me">) {
  return handle(async () => {
    const code = parseCode((await ctx.params).code);
    await leaveRoom(code, readSession(request));
    return new Response(null, { status: 204 });
  });
}
