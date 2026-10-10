import { App, TFile } from "obsidian";

export type SetlistItem =
  | { kind: "song"; link: string }
  | { kind: "section"; text: string }
  | { kind: "raw"; text: string };

const FM_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const HEADING_RE = /^#{1,6}\s+(.*?)\s*$/;
const SONG_RE = /^\s*(?:[-*+]|\d+\.)\s*\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]\s*$/;

export function parseSetlist(data: string): { frontmatter: string; items: SetlistItem[] } {
  const frontmatter = data.match(FM_RE)?.[0] ?? "";
  const items: SetlistItem[] = [];
  for (const line of data.slice(frontmatter.length).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const h = line.match(HEADING_RE);
    const s = line.match(SONG_RE);
    if (h) items.push({ kind: "section", text: h[1] });
    else if (s) items.push({ kind: "song", link: s[1].trim() });
    else items.push({ kind: "raw", text: line });
  }
  return { frontmatter, items };
}

export function serializeSetlist(frontmatter: string, items: SetlistItem[]): string {
  const fm = frontmatter ? (frontmatter.endsWith("\n") ? frontmatter : frontmatter + "\n") : "";
  const out: string[] = [];
  items.forEach((it, i) => {
    if (it.kind === "section") {
      if (i > 0) out.push("");
      out.push(`## ${it.text}`);
    } else if (it.kind === "song") {
      out.push(`- [[${it.link}]]`);
    } else {
      out.push(it.text);
    }
  });
  return `${fm}\n${out.join("\n")}\n`;
}

export async function editSetlist(
  app: App,
  file: TFile,
  mutate: (items: SetlistItem[]) => void,
): Promise<void> {
  await app.vault.process(file, (data) => {
    const { frontmatter, items } = parseSetlist(data);
    mutate(items);
    return serializeSetlist(frontmatter, items);
  });
}

export function moveItem<T>(arr: T[], from: number, to: number): void {
  if (to < 0 || to >= arr.length || from === to) return;
  const [x] = arr.splice(from, 1);
  arr.splice(to, 0, x);
}
