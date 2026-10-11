import { requestUrl } from "obsidian";

export interface SongInfo {
  path: string;
  title: string;
  artist: string;
  key: string;
  tempo: number | null;
  tags: string[];
}

export interface LibrarySuggestion {
  song: SongInfo;
  reason: string;
}

export interface OnlineSuggestion {
  title: string;
  artist: string;
  because: string;
}

export const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, "")
    .replace(/[^a-z0-9]+/g, "");

export const songKey = (artist: string, title: string): string => `${normalize(artist)}|${normalize(title)}`;

/** Ranks songs not yet in the setlist by how much they have in common with it. */
export function recommendFromLibrary(inSet: SongInfo[], candidates: SongInfo[], limit = 8): LibrarySuggestion[] {
  const tagCounts = new Map<string, number>();
  const artists = new Set<string>();
  const keys = new Set<string>();
  const tempos: number[] = [];
  for (const s of inSet) {
    s.tags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1));
    if (s.artist) artists.add(normalize(s.artist));
    if (s.key) keys.add(s.key.toLowerCase());
    if (s.tempo) tempos.push(s.tempo);
  }
  const avgTempo = tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null;

  const out: (LibrarySuggestion & { score: number })[] = [];
  for (const c of candidates) {
    let score = 0;
    const reasons: string[] = [];
    const sharedTags = c.tags.filter((t) => tagCounts.has(t));
    if (sharedTags.length) {
      score += sharedTags.reduce((n, t) => n + 2 + (tagCounts.get(t) ?? 0) * 0.5, 0);
      reasons.push(`tags: ${sharedTags.join(", ")}`);
    }
    if (c.artist && artists.has(normalize(c.artist))) {
      score += 2;
      reasons.push("same artist");
    }
    if (avgTempo && c.tempo && Math.abs(c.tempo - avgTempo) <= 15) {
      score += 1;
      reasons.push("similar tempo");
    }
    if (c.key && keys.has(c.key.toLowerCase())) {
      score += 1;
      reasons.push(`key ${c.key}`);
    }
    if (score > 0) out.push({ song: c, reason: reasons.join(" · "), score });
  }
  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ song, reason }) => ({ song, reason }));
}

interface DeezerArtist {
  id: number;
  name: string;
}
interface DeezerTrack {
  title: string;
  artist: { name: string };
}

async function deezer<T>(path: string): Promise<T[]> {
  const res = await requestUrl({ url: `https://api.deezer.com${path}`, throw: false });
  if (res.status !== 200) throw new Error(`Deezer request failed (HTTP ${res.status})`);
  return ((res.json as { data?: T[] }).data ?? []) as T[];
}

/**
 * Finds artists related to the setlist's main artists (via Deezer's public API,
 * no key needed) and suggests their top tracks that aren't already known.
 */
export async function recommendOnline(
  seedArtists: string[],
  known: Set<string>,
  limit = 12,
): Promise<OnlineSuggestion[]> {
  const seeds = seedArtists.slice(0, 3);
  const seedIds = new Set<number>();
  const related = new Map<number, { name: string; score: number; seeds: Set<string> }>();

  const lists = await Promise.all(
    seeds.map(async (name) => {
      const [found] = await deezer<DeezerArtist>(`/search/artist?q=${encodeURIComponent(name)}&limit=1`);
      if (!found) return null;
      seedIds.add(found.id);
      return { name, related: await deezer<DeezerArtist>(`/artist/${found.id}/related?limit=10`) };
    }),
  );

  for (const l of lists) {
    l?.related.forEach((a, rank) => {
      const entry = related.get(a.id) ?? { name: a.name, score: 0, seeds: new Set<string>() };
      entry.score += 10 - rank;
      entry.seeds.add(l.name);
      related.set(a.id, entry);
    });
  }

  const top = [...related.entries()]
    .filter(([id]) => !seedIds.has(id))
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 6);

  const tracks = await Promise.all(
    top.map(async ([id, info]) => ({ info, tracks: await deezer<DeezerTrack>(`/artist/${id}/top?limit=3`) })),
  );

  const out: OnlineSuggestion[] = [];
  for (const { info, tracks: ts } of tracks) {
    for (const t of ts) {
      if (known.has(songKey(t.artist.name, t.title))) continue;
      out.push({ title: t.title, artist: t.artist.name, because: `Similar to ${[...info.seeds].join(", ")}` });
    }
  }
  return out.slice(0, limit);
}
