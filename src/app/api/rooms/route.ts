import { handle, readJson } from "@/lib/rooms/http";
import { createRoom } from "@/lib/rooms/service";

/** Kreiranje sobe — domaćin postaje prvi gost */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request);
    const result = await createRoom({ hostName: body.name, pin: body.pin });
    return Response.json(result, { status: 201 });
  });
}
