/**
 * YouTube linkovi → id videa (11 znakova). Bez ovisnosti — koriste ga i preglednik i real-time server.
 * Podržano: youtube.com/watch?v=, youtu.be/, /shorts/, /embed/, /live/, m. i music. poddomene.
 */
const ID = /^[A-Za-z0-9_-]{11}$/;

export function parseYouTubeId(input: string): string | null {
  const text = input.trim();
  if (ID.test(text)) return text;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.split("/")[1] ?? "";
    return ID.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const v = url.searchParams.get("v");
    if (v && ID.test(v)) return v;
    const [, kind, id] = url.pathname.split("/");
    if (["shorts", "embed", "live", "v"].includes(kind ?? "") && id && ID.test(id)) return id;
  }
  return null;
}

export const youTubeWatchUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`;
export const youTubeThumbnail = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
