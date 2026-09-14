import { deletePhoto, storePhoto } from "@/lib/photos";
import { publishRoomState } from "@/lib/party/server";
import { handle, parseCode, readSession } from "@/lib/rooms/http";
import { RoomError, requireHost, setPhotoUrl } from "@/lib/rooms/service";

/** Domaćin postavlja sliku razloga slavlja */
export async function POST(request: Request, ctx: RouteContext<"/api/rooms/[code]/photo">) {
  return handle(async () => {
    const code = parseCode((await ctx.params).code);
    // Autorizacija prije čitanja tijela — ne primamo datoteke od ne-domaćina
    const { room } = await requireHost(code, readSession(request));

    let file: FormDataEntryValue | null;
    try {
      file = (await request.formData()).get("file");
    } catch {
      throw new RoomError(400, "Neispravan zahtjev.");
    }

    const url = await storePhoto(file, code);
    await setPhotoUrl(room, url);
    await publishRoomState(code);
    await deletePhoto(room.photoUrl);
    return Response.json({ photoUrl: url });
  });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/rooms/[code]/photo">) {
  return handle(async () => {
    const code = parseCode((await ctx.params).code);
    const { room } = await requireHost(code, readSession(request));
    await setPhotoUrl(room, null);
    await publishRoomState(code);
    await deletePhoto(room.photoUrl);
    return new Response(null, { status: 204 });
  });
}
