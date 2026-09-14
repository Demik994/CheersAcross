/**
 * Kratkotrajni potpisani "tiket" kojim se preglednik spaja na real-time server.
 * Next.js ga izdaje nakon što provjeri token gosta; Worker samo provjeri potpis
 * (HMAC-SHA256) i ne mora pitati bazu tko je gost.
 *
 * Format: base64url(JSON payload) + "." + base64url(HMAC)
 * Web Crypto API radi i u Node.js i na Cloudflare Workersima.
 */
export type TicketPayload = {
  /** kod sobe */
  r: string;
  /** id gosta */
  g: string;
  /** istek (ms od epohe) */
  exp: number;
};

export const TICKET_TTL_MS = 10 * 60 * 1000;

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function importKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signTicket(payload: TicketPayload, secret: string): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign("HMAC", await importKey(secret), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyTicket(ticket: string, secret: string): Promise<TicketPayload | null> {
  const [body, signature] = ticket.split(".");
  if (!body || !signature) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await importKey(secret),
      fromBase64Url(signature),
      encoder.encode(body),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as TicketPayload;
    if (typeof payload.r !== "string" || typeof payload.g !== "string" || typeof payload.exp !== "number") return null;
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}
