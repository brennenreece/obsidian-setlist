import { ItemView, Notice, TFile, WorkspaceLeaf, normalizePath, setIcon } from "obsidian";
import type SetlistPlugin from "./main";
import { ImportSongModal, downloadLyrics } from "./importer";
import { LyricsResult, searchLyrics } from "./lrclib";
import { ConfirmModal, TextPromptModal } from "./modals";
import { getSetlists, isSetlist } from "./setlist";
import { SetlistItem, editSetlist, moveItem, parseSetlist } from "./setlistModel";
import { SongEditModal, readTags } from "./songEditor";

export const VIEW_TYPE_DASHBOARD = "setlist-dashboard";

export class DashboardView extends ItemView {
  private setlistPath = "";
  private search = "";
  private tag = "";
  private libraryEl!: HTMLElement;
  private setlistEl!: HTMLElement;
  private tagSelect!: HTMLSelectElement;
  private onlineEl!: HTMLElement;
  private onlineToken = 0;
  private onlineQuery = "";
  private onlineResults: LyricsResult[] | null = null;
  private onlineStatus = "";
  private refreshTimer: number | null = null;
  private dragFrom = -1;

  constructor(leaf: WorkspaceLeaf, private plugin: SetlistPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_DASHBOARD;
  }
  getDisplayText(): string {
    return "Setlist dashboard";
  }
  getIcon(): string {
    return "list-music";
  }

  getState(): Record<string, unknown> {
    return { setlistPath: this.setlistPath };
  }

  async setState(state: { setlistPath?: string }, result: Parameters<ItemView["setState"]>[1]): Promise<void> {
    if (state?.setlistPath) this.setlistPath = state.setlistPath;
    await super.setState(state, result);
    if (this.libraryEl) void this.renderAll();
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("setlist-dash");

    const toolbar = root.createDiv("setlist-dash-toolbar");
    this.button(toolbar, "file-down", "Import song", () => new ImportSongModal(this.app, this.plugin).open());
    this.button(toolbar, "plus", "New song", () => this.newSong());

    const panes = root.createDiv("setlist-dash-panes");
    const left = panes.createDiv("setlist-dash-pane");
    left.createEl("h3", { text: "Songs" });
    const filters = left.createDiv("setlist-dash-filters");
    const input = filters.createEl("input", {
      type: "search",
      placeholder: "Search library · Enter to search online",
    });
    input.addEventListener("input", () => {
      this.search = input.value.toLowerCase();
      this.renderLibrary();
      if (input.value.trim() !== this.onlineQuery) {
        this.onlineResults = null;
        this.onlineStatus = "";
        this.renderOnline();
      }
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void this.searchOnline(input.value);
    });
    this.tagSelect = filters.createEl("select");
    this.tagSelect.addEventListener("change", () => {
      this.tag = this.tagSelect.value;
      this.renderLibrary();
    });
    this.libraryEl = left.createDiv("setlist-dash-list");
    this.onlineEl = left.createDiv("setlist-dash-list setlist-dash-online");

    this.setlistEl = panes.createDiv("setlist-dash-pane");

    const refresh = () => this.scheduleRefresh();
    this.registerEvent(this.app.metadataCache.on("changed", refresh));
    this.registerEvent(this.app.vault.on("create", refresh));
    this.registerEvent(this.app.vault.on("delete", refresh));
    this.registerEvent(this.app.vault.on("rename", refresh));

    await this.renderAll();
  }

  async onClose(): Promise<void> {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => void this.renderAll(), 300);
  }

  private button(parent: HTMLElement, icon: string, label: string, onClick: () => void, cls = ""): HTMLButtonElement {
    const b = parent.createEl("button", { cls: `setlist-dash-btn ${cls}`.trim(), attr: { "aria-label": label } });
    setIcon(b, icon);
    b.createSpan({ text: ` ${label}` });
    b.onclick = onClick;
    return b;
  }

  private iconButton(parent: HTMLElement, icon: string, label: string, onClick: () => void, disabled = false): void {
    const b = parent.createEl("button", { cls: "setlist-dash-icon", attr: { "aria-label": label } });
    setIcon(b, icon);
    b.disabled = disabled;
    b.onclick = (e) => {
      e.stopPropagation();
      onClick();
    };
  }

  private getSongFiles(): TFile[] {
    const folder = normalizePath(this.plugin.settings.songFolder || "/");
    return this.app.vault
      .getMarkdownFiles()
      .filter((f) => !isSetlist(this.app, f) && (folder === "/" || f.path.startsWith(folder + "/")))
      .sort((a, b) => this.songTitle(a).localeCompare(this.songTitle(b)));
  }

  private fm(file: TFile): Record<string, unknown> {
    return (this.app.metadataCache.getFileCache(file)?.frontmatter ?? {}) as Record<string, unknown>;
  }

  private songTitle(file: TFile): string {
    return String(this.fm(file).title ?? file.basename);
  }

  private async renderAll(): Promise<void> {
    this.renderLibrary();
    this.renderOnline();
    this.renderSetlist();
  }

  private async searchOnline(raw: string): Promise<void> {
    const query = raw.trim();
    if (!query) return;
    const token = ++this.onlineToken;
    this.onlineQuery = query;
    this.onlineResults = null;
    this.onlineStatus = "Searching online…";
    this.renderOnline();
    try {
      const results = await searchLyrics(query);
      if (token !== this.onlineToken) return;
      this.onlineResults = results.slice(0, 20);
      this.onlineStatus = results.length ? "" : "No online results.";
    } catch (e) {
      if (token !== this.onlineToken) return;
      this.onlineStatus = `Online search failed: ${(e as Error).message}`;
    }
    this.renderOnline();
  }

  private renderOnline(): void {
    const el = this.onlineEl;
    el.empty();
    const typed = this.search.trim();
    if (!typed && !this.onlineResults && !this.onlineStatus) return;

    if (!this.onlineResults && !this.onlineStatus) {
      const row = el.createDiv("setlist-dash-row setlist-dash-online-prompt");
      const info = row.createDiv("setlist-dash-info");
      info.createDiv({ cls: "setlist-dash-title", text: `Search online for “${typed}”` });
      info.createDiv({ cls: "setlist-dash-meta", text: "LRCLIB · lyrics only" });
      info.onclick = () => void this.searchOnline(typed);
      this.iconButton(row, "globe", "Search online", () => void this.searchOnline(typed));
      return;
    }

    el.createEl("h4", { text: "Online results" });
    if (this.onlineStatus) el.createEl("p", { cls: "setlist-dash-empty", text: this.onlineStatus });
    for (const r of this.onlineResults ?? []) {
      const row = el.createDiv("setlist-dash-row");
      const info = row.createDiv("setlist-dash-info");
      info.createDiv({ cls: "setlist-dash-title", text: r.trackName });
      info.createDiv({
        cls: "setlist-dash-meta",
        text: [r.artistName, r.albumName].filter(Boolean).join(" · "),
      });
      this.iconButton(row, "download", "Download to library", async () => {
        await downloadLyrics(this.app, this.plugin.settings.songFolder, r);
        this.scheduleRefresh();
      });
    }
  }

  private renderLibrary(): void {
    const songs = this.getSongFiles();

    const tags = new Set<string>();
    songs.forEach((s) => readTags(this.fm(s)).forEach((t) => tags.add(t)));
    this.tagSelect.empty();
    this.tagSelect.createEl("option", { value: "", text: "All tags" });
    [...tags].sort().forEach((t) => this.tagSelect.createEl("option", { value: t, text: t }));
    if (this.tag && !tags.has(this.tag)) this.tag = "";
    this.tagSelect.value = this.tag;

    this.libraryEl.empty();
    const shown = songs.filter((s) => {
      const fm = this.fm(s);
      const songTags = readTags(fm);
      if (this.tag && !songTags.includes(this.tag)) return false;
      if (!this.search) return true;
      const hay = [this.songTitle(s), fm.artist, fm.key, ...songTags].join(" ").toLowerCase();
      return hay.includes(this.search);
    });
    if (shown.length === 0) {
      this.libraryEl.createEl("p", { cls: "setlist-dash-empty", text: "No songs found." });
      return;
    }
    const current = this.currentSetlist();
    for (const song of shown) {
      const fm = this.fm(song);
      const row = this.libraryEl.createDiv("setlist-dash-row");
      const info = row.createDiv("setlist-dash-info");
      info.createDiv({ cls: "setlist-dash-title", text: this.songTitle(song) });
      const meta = [fm.artist, fm.key ? `Key ${fm.key}` : null, fm.tempo ? `${fm.tempo} BPM` : null]
        .filter(Boolean)
        .join(" · ");
      if (meta) info.createDiv({ cls: "setlist-dash-meta", text: meta });
      info.onclick = () => new SongEditModal(this.app, song, () => this.scheduleRefresh()).open();
      this.iconButton(row, "pencil", "Edit song", () =>
        new SongEditModal(this.app, song, () => this.scheduleRefresh()).open(),
      );
      this.iconButton(row, "plus", "Add to setlist", () => void this.addToSetlist(song), !current);
    }
  }

  private currentSetlist(): TFile | null {
    const f = this.app.vault.getAbstractFileByPath(this.setlistPath);
    return f instanceof TFile && isSetlist(this.app, f) ? f : null;
  }

  private renderSetlist(): void {
    const el = this.setlistEl;
    el.empty();
    const setlists = getSetlists(this.app);
    let current = this.currentSetlist();
    if (!current && setlists.length) {
      current = setlists[0];
      this.setlistPath = current.path;
    }

    el.createEl("h3", { text: "Setlist" });
    const head = el.createDiv("setlist-dash-filters");
    const select = head.createEl("select");
    if (!setlists.length) select.createEl("option", { text: "No setlists yet" });
    setlists.forEach((s) => select.createEl("option", { value: s.path, text: s.basename }));
    if (current) select.value = current.path;
    select.onchange = () => {
      this.setlistPath = select.value;
      this.app.workspace.requestSaveLayout();
      this.renderAll();
    };
    this.iconButton(head, "plus", "New setlist", () => this.newSetlist());

    if (!current) return;
    const setlist = current;

    const actions = el.createDiv("setlist-dash-actions");
    this.button(actions, "play", "Perform", () => void this.plugin.perform(setlist), "mod-cta");
    this.button(actions, "heading", "Add section", () =>
      new TextPromptModal(this.app, "Section name", "Set 1", (name) =>
        void editSetlist(this.app, setlist, (items) => items.push({ kind: "section", text: name })),
      ).open(),
    );
    this.button(actions, "pencil-line", "Rename", () =>
      new TextPromptModal(this.app, "Rename setlist", setlist.basename, async (name) => {
        const path = normalizePath(`${setlist.parent?.path ?? ""}/${name}.md`);
        if (this.app.vault.getAbstractFileByPath(path)) return void new Notice("A note with that name exists.");
        await this.app.fileManager.renameFile(setlist, path);
        this.setlistPath = path;
        this.scheduleRefresh();
      }).open(),
    );
    this.button(actions, "copy", "Duplicate", () => void this.duplicateSetlist(setlist));
    this.button(actions, "trash", "Delete", () =>
      new ConfirmModal(this.app, `Move “${setlist.basename}” to trash? Songs are not deleted.`, "Delete", async () => {
        await this.app.fileManager.trashFile(setlist);
        this.setlistPath = "";
        this.scheduleRefresh();
      }).open(),
    );

    const list = el.createDiv("setlist-dash-list");
    void this.app.vault.cachedRead(setlist).then((data) => this.renderItems(list, setlist, parseSetlist(data).items));

  }

  private renderItems(list: HTMLElement, setlist: TFile, items: SetlistItem[]): void {
    list.empty();
    if (items.length === 0) {
      list.createEl("p", { cls: "setlist-dash-empty", text: "Empty. Use + on a song to add it." });
      return;
    }
    let songNo = 0;
    let playable = 0;
    items.forEach((item, i) => {
      const row = list.createDiv("setlist-dash-row");
      row.draggable = true;
      row.addEventListener("dragstart", () => (this.dragFrom = i));
      row.addEventListener("dragover", (e) => e.preventDefault());
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        const from = this.dragFrom;
        this.dragFrom = -1;
        if (from >= 0 && from !== i) void editSetlist(this.app, setlist, (arr) => moveItem(arr, from, i));
      });

      const info = row.createDiv("setlist-dash-info");
      if (item.kind === "section") {
        row.addClass("is-section");
        info.createDiv({ cls: "setlist-dash-title", text: item.text });
      } else if (item.kind === "song") {
        songNo++;
        const file = this.app.metadataCache.getFirstLinkpathDest(item.link, setlist.path);
        info.createDiv({
          cls: "setlist-dash-title",
          text: `${songNo}. ${file ? this.songTitle(file) : item.link}`,
        });
        if (!file) {
          row.addClass("is-missing");
          info.createDiv({ cls: "setlist-dash-meta", text: "Song not found" });
        } else {
          const fm = this.fm(file);
          const meta = [fm.artist, fm.key ? `Key ${fm.key}` : null].filter(Boolean).join(" · ");
          if (meta) info.createDiv({ cls: "setlist-dash-meta", text: meta });
          info.onclick = () => new SongEditModal(this.app, file, () => this.scheduleRefresh()).open();
          const startAt = playable++;
          this.iconButton(row, "play", "Start from here", () => void this.plugin.perform(setlist, startAt));
        }
      } else {
        info.createDiv({ cls: "setlist-dash-meta", text: item.text });
      }

      this.iconButton(row, "arrow-up", "Move up", () => void editSetlist(this.app, setlist, (a) => moveItem(a, i, i - 1)), i === 0);
      this.iconButton(
        row,
        "arrow-down",
        "Move down",
        () => void editSetlist(this.app, setlist, (a) => moveItem(a, i, i + 1)),
        i === items.length - 1,
      );
      if (item.kind === "section") {
        this.iconButton(row, "pencil", "Rename section", () =>
          new TextPromptModal(this.app, "Section name", item.text, (name) =>
            void editSetlist(this.app, setlist, (a) => {
              const target = a[i];
              if (target?.kind === "section") target.text = name;
            }),
          ).open(),
        );
      }
      this.iconButton(row, "x", "Remove", () => void editSetlist(this.app, setlist, (a) => void a.splice(i, 1)));
    });
  }

  private async addToSetlist(song: TFile): Promise<void> {
    const setlist = this.currentSetlist();
    if (!setlist) return;
    const link = this.app.metadataCache.fileToLinktext(song, setlist.path);
    await editSetlist(this.app, setlist, (items) => items.push({ kind: "song", link }));
    new Notice(`Added “${this.songTitle(song)}”`);
  }

  private newSetlist(): void {
    new TextPromptModal(this.app, "New setlist", "New Setlist", async (name) => {
      const folder = normalizePath(this.plugin.settings.setlistFolder || "/");
      if (folder !== "/" && !this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
      const path = normalizePath(`${folder}/${name}.md`);
      if (this.app.vault.getAbstractFileByPath(path)) return void new Notice("A note with that name exists.");
      await this.app.vault.create(path, "---\ntype: setlist\n---\n\n");
      this.setlistPath = path;
      this.scheduleRefresh();
    }).open();
  }

  private async duplicateSetlist(setlist: TFile): Promise<void> {
    const dir = setlist.parent?.path ?? "";
    let path = normalizePath(`${dir}/${setlist.basename} copy.md`);
    for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) {
      path = normalizePath(`${dir}/${setlist.basename} copy ${i}.md`);
    }
    const copy = await this.app.vault.copy(setlist, path);
    this.setlistPath = copy.path;
    this.scheduleRefresh();
  }

  private newSong(): void {
    new ImportSongModal(this.app, this.plugin).open();
  }
}
