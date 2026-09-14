import { handle, jsonError, parseCode } from "@/lib/rooms/http";
import { getRoomInfo } from "@/lib/rooms/service";

/** Javni podaci o sobi (postoji li, treba li PIN) — bez popisa gostiju */
export async function GET(_request: Request, ctx: RouteContext<"/api/rooms/[code]">) {
  return handle(async () => {
    const info = await getRoomInfo(parseCode((await ctx.params).code));
    return info ? Response.json(info) : jsonError("Soba ne postoji ili je istekla.", 404);
  });
}
