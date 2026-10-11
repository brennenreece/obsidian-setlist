import { requestUrl } from "obsidian";
import { OnlineSuggestion, SongInfo, songKey, verifyTrack } from "./recommend";

/**
 * Asks Gemini for songs that would fit the setlist. Each suggestion is checked
 * against Deezer and dropped if it can't be found, since models can invent songs.
 */
export async function suggestWithGemini(
  apiKey: string,
  model: string,
  inSet: SongInfo[],
  known: Set<string>,
): Promise<OnlineSuggestion[]> {
  const list = inSet
    .map((s, i) => `${i + 1}. "${s.title}" by ${s.artist || "unknown"}${s.key ? `, key ${s.key}` : ""}${s.tempo ? `, ${s.tempo} BPM` : ""}`)
    .join("\n");
  const prompt =
    `A musician is building a live setlist with these songs, in order:\n${list}\n\n` +
    `Suggest 10 other real, well-known songs that fit this set in style, mood and energy. ` +
    `Do not repeat songs already listed. Give the exact original title and artist. ` +
    `For each, give a short reason (under 15 words).`;

  const res = await requestUrl({
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    method: "POST",
    contentType: "application/json",
    headers: { "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              artist: { type: "STRING" },
              reason: { type: "STRING" },
            },
            required: ["title", "artist", "reason"],
          },
        },
      },
    }),
    throw: false,
  });
  if (res.status !== 200) {
    const msg = (res.json as { error?: { message?: string } } | undefined)?.error?.message;
    throw new Error(msg ?? `Gemini request failed (HTTP ${res.status})`);
  }
  const text = (res.json as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates?.[0]
    ?.content?.parts?.[0]?.text;
  let picks: { title: string; artist: string; reason?: string }[] = [];
  try {
    picks = JSON.parse(text ?? "[]");
  } catch {
    throw new Error("Gemini returned an unreadable response.");
  }

  const verified = await Promise.all(
    picks.slice(0, 12).map(async (p) => {
      const v = await verifyTrack(p.title, p.artist);
      return v ? { v, reason: p.reason } : null;
    }),
  );
  const out: OnlineSuggestion[] = [];
  for (const item of verified) {
    if (!item || known.has(songKey(item.v.artist, item.v.title))) continue;
    out.push({ title: item.v.title, artist: item.v.artist, because: item.reason || "AI pick" });
  }
  return out;
}
