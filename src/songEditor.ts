import { App, Modal, Notice, Setting, TFile } from "obsidian";
import { ConfirmModal } from "./modals";

const FM_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

export function readTags(fm: Record<string, unknown> | undefined): string[] {
  const t = fm?.tags;
  if (Array.isArray(t)) return t.map((x) => String(x).replace(/^#/, ""));
  if (typeof t === "string") return t.split(/[,\s]+/).filter(Boolean).map((x) => x.replace(/^#/, ""));
  return [];
}

export class SongEditModal extends Modal {
  constructor(
    app: App,
    private file: TFile,
    private onSaved: () => void,
  ) {
    super(app);
  }

  async onOpen(): Promise<void> {
    const fm = (this.app.metadataCache.getFileCache(this.file)?.frontmatter ?? {}) as Record<string, unknown>;
    const raw = await this.app.vault.read(this.file);
    const originalBody = raw.replace(FM_RE, "");

    let title = String(fm.title ?? this.file.basename);
    let artist = fm.artist != null ? String(fm.artist) : "";
    let key = fm.key != null ? String(fm.key) : "";
    let tempo = fm.tempo != null ? String(fm.tempo) : "";
    let tags = readTags(fm).join(", ");
    let body = originalBody;

    this.titleEl.setText("Edit song");
    const { contentEl } = this;
    contentEl.addClass("setlist-song-edit");

    new Setting(contentEl).setName("Title").addText((t) => t.setValue(title).onChange((v) => (title = v)));
    new Setting(contentEl).setName("Artist").addText((t) => t.setValue(artist).onChange((v) => (artist = v)));
    new Setting(contentEl).setName("Key").addText((t) => t.setValue(key).onChange((v) => (key = v)));
    new Setting(contentEl)
      .setName("Tempo (BPM)")
      .addText((t) => t.setValue(tempo).onChange((v) => (tempo = v)));
    new Setting(contentEl)
      .setName("Tags")
      .setDesc("Comma separated")
      .addText((t) => t.setValue(tags).onChange((v) => (tags = v)));

    contentEl.createEl("div", { cls: "setting-item-name", text: "Lyrics" });
    const area = contentEl.createEl("textarea", { cls: "setlist-import-text" });
    area.rows = 14;
    area.value = body;
    area.addEventListener("input", () => (body = area.value));

    new Setting(contentEl)
      .addButton((b) =>
        b
          .setButtonText("Delete song")
          .setWarning()
          .onClick(() =>
            new ConfirmModal(this.app, `Move “${this.file.basename}” to trash?`, "Delete", async () => {
              await this.app.fileManager.trashFile(this.file);
              this.close();
              this.onSaved();
            }).open(),
          ),
      )
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText("Save")
          .setCta()
          .onClick(async () => {
            if (!title.trim()) {
              new Notice("Title is required.");
              return;
            }
            const tagList = tags
              .split(",")
              .map((s) => s.trim().replace(/^#/, ""))
              .filter(Boolean);
            await this.app.fileManager.processFrontMatter(this.file, (f: Record<string, unknown>) => {
              const set = (k: string, v: string) => (v.trim() ? (f[k] = v.trim()) : delete f[k]);
              f.title = title.trim();
              set("artist", artist);
              set("key", key);
              const n = Number(tempo);
              if (tempo.trim() && !Number.isNaN(n)) f.tempo = n;
              else delete f.tempo;
              if (tagList.length) f.tags = tagList;
              else delete f.tags;
            });
            if (body !== originalBody) {
              await this.app.vault.process(this.file, (data) => {
                const front = data.match(FM_RE)?.[0] ?? "";
                return front + body;
              });
            }
            this.close();
            this.onSaved();
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
