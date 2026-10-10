import { requestUrl } from "obsidian";

export interface LyricsResult {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
}

export async function searchLyrics(query: string): Promise<LyricsResult[]> {
  const res = await requestUrl({
    url: `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`,
    headers: { "Lri-Client": "obsidian-setlist" },
    throw: false,
  });
  if (res.status !== 200) throw new Error(`Lyrics search failed (HTTP ${res.status})`);
  const items = res.json as LyricsResult[];
  return items.filter((r) => !r.instrumental && r.plainLyrics);
}
