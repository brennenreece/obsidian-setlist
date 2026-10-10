import { App, Modal, Notice, Setting, TFile, normalizePath } from "obsidian";
import type SetlistPlugin from "./main";
import { LyricsResult, searchLyrics } from "./lrclib";

const yamlQuote = (s: string): string => JSON.stringify(s);

/** Characters that are invalid in file names on at least one platform. */
const safeName = (s: string): string => s.replace(/[\\/:*?"<>|#^[\]]/g, "").trim() || "Untitled";

export async function createSongNote(
  app: App,
  folder: string,
  meta: { title: string; artist?: string; key?: string; source?: string },
  body: string,
): Promise<TFile> {
  const dir = normalizePath(folder || "/");
  if (dir !== "/" && !app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir);

  const base = safeName(meta.title);
  let path = normalizePath(`${dir}/${base}.md`);
  for (let i = 2; app.vault.getAbstractFileByPath(path); i++) {
    path = normalizePath(`${dir}/${base} (${i}).md`);
  }

  const fm = ["---", `title: ${yamlQuote(meta.title)}`];
  if (meta.artist) fm.push(`artist: ${yamlQuote(meta.artist)}`);
  if (meta.key) fm.push(`key: ${yamlQuote(meta.key)}`);
  if (meta.source) fm.push(`source: ${yamlQuote(meta.source)}`);
  fm.push("---", "");
  return app.vault.create(path, fm.join("\n") + body.trim() + "\n");
}

/** Lyrics from plain text come as single-spaced lines; markdown needs blank lines or hard breaks to keep stanzas readable. */
function toMarkdownLines(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((stanza) => stanza.split("\n").join("  \n"))
    .join("\n\n");
}

export class LyricsSearchModal extends Modal {
  private resultsEl!: HTMLElement;

  constructor(app: App, private plugin: SetlistPlugin) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("Search online lyrics");
    const { contentEl } = this;
    contentEl.addClass("setlist-search");

    let query = "";
    const run = () => void this.search(query);
    new Setting(contentEl)
      .setName("Song or artist")
      .addText((t) => {
        t.setPlaceholder("e.g. title and artist").onChange((v) => (query = v));
        t.inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") run();
        });
        window.setTimeout(() => t.inputEl.focus(), 0);
      })
      .addButton((b) => b.setButtonText("Search").setCta().onClick(run));

    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "Results come from LRCLIB (lyrics only). Lyrics are copyrighted; use downloads for your own personal reference.",
    });
    this.resultsEl = contentEl.createDiv("setlist-search-results");
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async search(query: string): Promise<void> {
    if (!query.trim()) return;
    this.resultsEl.empty();
    this.resultsEl.createEl("p", { text: "Searching…" });
    let results: LyricsResult[];
    try {
      results = await searchLyrics(query.trim());
    } catch (e) {
      this.resultsEl.empty();
      this.resultsEl.createEl("p", { text: `Search failed: ${(e as Error).message}` });
      return;
    }
    this.resultsEl.empty();
    if (results.length === 0) {
      this.resultsEl.createEl("p", { text: "No results." });
      return;
    }
    for (const r of results.slice(0, 25)) {
      const mins = Math.floor(r.duration / 60);
      const secs = String(Math.round(r.duration % 60)).padStart(2, "0");
      new Setting(this.resultsEl)
        .setName(r.trackName)
        .setDesc(`${r.artistName}${r.albumName ? " · " + r.albumName : ""} · ${mins}:${secs}`)
        .addButton((b) => b.setButtonText("Download").onClick(() => void this.download(r)));
    }
  }

  private async download(r: LyricsResult): Promise<void> {
    const file = await createSongNote(
      this.app,
      this.plugin.settings.songFolder,
      { title: r.trackName, artist: r.artistName, source: "lrclib.net" },
      toMarkdownLines(r.plainLyrics ?? ""),
    );
    new Notice(`Saved “${file.basename}”`);
    this.close();
    await this.app.workspace.getLeaf(false).openFile(file);
  }
}

/** Splits ChordPro-style {directives} into metadata; everything else stays in the body so inline [C] chords are preserved. */
function parseImport(text: string): { title?: string; artist?: string; key?: string; body: string } {
  const meta: Record<string, string> = {};
  const lines: string[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const m = line.match(/^\s*\{\s*(\w+)\s*:\s*(.*?)\s*\}\s*$/);
    if (m && ["title", "t", "artist", "key", "subtitle", "st"].includes(m[1].toLowerCase())) {
      const k = m[1].toLowerCase();
      meta[k === "t" ? "title" : k === "st" || k === "subtitle" ? "artist" : k] ||= m[2];
    } else if (/^\s*\{\s*(start|end)_of_\w+\s*\}\s*$/i.test(line) || /^\s*\{\s*(sov|eov|soc|eoc|sob|eob)\s*\}\s*$/i.test(line)) {
      continue;
    } else {
      const c = line.match(/^\s*\{\s*(?:comment|c)\s*:\s*(.*?)\s*\}\s*$/i);
      lines.push(c ? `**${c[1]}**` : line);
    }
  }
  return { title: meta.title, artist: meta.artist, key: meta.key, body: lines.join("\n") };
}

export class ImportSongModal extends Modal {
  constructor(app: App, private plugin: SetlistPlugin, private initialText = "") {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("Import song");
    const { contentEl } = this;
    let title = "";
    let artist = "";
    let key = "";
    let text = this.initialText;

    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: "Paste lyrics or ChordPro text. {title:}, {artist:} and {key:} lines fill in the fields below; inline [C] chords are kept as written.",
    });
    new Setting(contentEl).setName("Title").addText((t) => t.onChange((v) => (title = v)));
    new Setting(contentEl).setName("Artist").addText((t) => t.onChange((v) => (artist = v)));
    new Setting(contentEl).setName("Key").addText((t) => t.onChange((v) => (key = v)));
    const area = contentEl.createEl("textarea", { cls: "setlist-import-text" });
    area.rows = 12;
    area.value = text;
    area.addEventListener("input", () => (text = area.value));

    new Setting(contentEl).addButton((b) =>
      b
        .setButtonText("Import")
        .setCta()
        .onClick(async () => {
          const parsed = parseImport(text);
          const finalTitle = (title || parsed.title || "").trim();
          if (!finalTitle) {
            new Notice("Please enter a title.");
            return;
          }
          const file = await createSongNote(
            this.app,
            this.plugin.settings.songFolder,
            { title: finalTitle, artist: artist || parsed.artist, key: key || parsed.key },
            parsed.body,
          );
          new Notice(`Saved “${file.basename}”`);
          this.close();
          await this.app.workspace.getLeaf(false).openFile(file);
        }),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
