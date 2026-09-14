import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, put } from "@vercel/blob";
import { blobToken } from "@/lib/env";
import { RoomError } from "@/lib/rooms/service";

/**
 * Pohrana slika slavlja: Vercel Blob kad postoji BLOB_READ_WRITE_TOKEN,
 * inače (samo u razvoju) lokalni folder `.local-uploads/` posluživan preko /api/photos/[name].
 */
export const LOCAL_UPLOAD_DIR = path.join(process.cwd(), ".local-uploads");
export const LOCAL_UPLOAD_NAME = /^[a-f0-9-]{36}\.(jpg|png|webp)$/;
const LOCAL_URL_PREFIX = "/api/photos/";

// Klijent već kompresira sliku na ~1600px JPEG, pa je ovo velikodušna granica
// (i ispod 4.5 MB limita za body Vercel funkcija).
const MAX_BYTES = 4 * 1024 * 1024;

const EXTENSION_BY_TYPE: Record<string, "jpg" | "png" | "webp"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export async function storePhoto(file: FormDataEntryValue | null, roomCode: string): Promise<string> {
  if (!(file instanceof File)) throw new RoomError(400, "Nije poslana slika.");
  const extension = EXTENSION_BY_TYPE[file.type];
  if (!extension) throw new RoomError(415, "Podržani formati su JPG, PNG i WebP.");
  if (file.size > MAX_BYTES) throw new RoomError(413, "Slika je prevelika (max 4 MB).");

  const name = `${randomUUID()}.${extension}`;

  const token = blobToken();
  if (token) {
    try {
      const blob = await put(`rooms/${roomCode}/${name}`, file, { access: "public", contentType: file.type, token });
      return blob.url;
    } catch (err) {
      console.error("Vercel Blob upload nije uspio", err);
      throw new RoomError(502, "Upload slike nije uspio. Pokušaj ponovno.");
    }
  }

  if (process.env.NODE_ENV === "production") {
    throw new RoomError(503, "Upload slika nije konfiguriran na serveru.");
  }

  await mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(LOCAL_UPLOAD_DIR, name), Buffer.from(await file.arrayBuffer()));
  return `${LOCAL_URL_PREFIX}${name}`;
}

/** Brisanje stare slike — "best effort", greška ne smije srušiti zahtjev */
export async function deletePhoto(url: string | null) {
  if (!url) return;
  try {
    if (url.startsWith(LOCAL_URL_PREFIX)) {
      const name = url.slice(LOCAL_URL_PREFIX.length);
      if (LOCAL_UPLOAD_NAME.test(name)) await unlink(path.join(LOCAL_UPLOAD_DIR, name));
    } else {
      const token = blobToken();
      if (token) await del(url, { token });
    }
  } catch (err) {
    console.warn("Brisanje stare slike nije uspjelo", err);
  }
}
