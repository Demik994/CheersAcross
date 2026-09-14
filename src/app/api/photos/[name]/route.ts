import { readFile } from "node:fs/promises";
import path from "node:path";
import { LOCAL_UPLOAD_DIR, LOCAL_UPLOAD_NAME, TYPE_BY_EXTENSION } from "@/lib/photos";

/** Poslužuje lokalno spremljene slike (samo razvoj bez Vercel Bloba). */
export async function GET(_request: Request, ctx: RouteContext<"/api/photos/[name]">) {
  const { name } = await ctx.params;
  if (process.env.NODE_ENV === "production" || !LOCAL_UPLOAD_NAME.test(name)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const data = await readFile(path.join(LOCAL_UPLOAD_DIR, name));
    const extension = name.split(".").pop()!;
    return new Response(data, {
      headers: {
        "Content-Type": TYPE_BY_EXTENSION[extension],
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
