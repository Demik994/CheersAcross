import "server-only";

/**
 * Prva neprazna vrijednost od navedenih varijabli okruženja.
 * - Dinamičko čitanje (`process.env[name]`) — vrijednost se uvijek čita u trenutku zahtjeva.
 * - Prazan string se tretira kao "nije postavljeno" (za razliku od `??`), pa npr. prazan
 *   UPSTASH_REDIS_REST_URL ne sakrije ispravan KV_REST_API_URL.
 */
export function readEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export const envNames = {
  redisUrl: ["UPSTASH_REDIS_REST_URL", "KV_REST_API_URL"],
  redisToken: ["UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN"],
  blobToken: ["BLOB_READ_WRITE_TOKEN"],
  partySecret: ["PARTY_SECRET"],
  partyUrl: ["PARTY_URL"],
  partyPublicHost: ["PARTY_PUBLIC_HOST"],
} as const;

export const redisUrl = () => readEnv(...envNames.redisUrl);
export const redisToken = () => readEnv(...envNames.redisToken);
export const blobToken = () => readEnv(...envNames.blobToken);
