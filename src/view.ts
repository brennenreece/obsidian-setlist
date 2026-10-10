import {
  Component,
  ItemView,
  MarkdownRenderer,
  Menu,
  TFile,
  ViewStateResult,
  WorkspaceLeaf,
  setIcon,
} from "obsidian";
import type SetlistPlugin from "./main";
import { getSongs } from "./setlist";

export const VIEW_TYPE_PERFORMANCE = "setlist-performance";

interface WakeLockSentinelLike {
  release(): Promise<void>;
}

export class PerformanceView extends ItemView {
  private setlistPath = "";
  private index = 0;
  private songs: TFile[] = [];
  private renderer: Component | null = null;
  private wakeLock: WakeLockSentinelLike | null = null;
  private barVisible = true;

  private barEl!: HTMLElement;
  private titleEl!: HTMLElement;
  private counterEl!: HTMLElement;
  private headerEl!: HTMLElement;
  private bodyEl!: HTMLElement;
  private footerEl!: HTMLElement;
  private scrollEl!: HTMLElement;
  private prevBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;

  constructor(leaf: WorkspaceLeaf, private plugin: SetlistPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_PERFORMANCE;
  }

  getDisplayText(): string {
    return "Performance";
  }

  getIcon(): string {
    return "music";
  }

  getState(): Record<string, unknown> {
    return { setlistPath: this.setlistPath, index: this.index };
  }

  async setState(state: { setlistPath?: string; index?: number }, result: ViewStateResult): Promise<void> {
    if (state?.setlistPath) {
      this.setlistPath = state.setlistPath;
      this.index = state.index ?? 0;
      await this.reload();
    }
    await super.setState(state, result);
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("setlist-stage");
    this.applyTheme();

    this.barEl = root.createDiv("setlist-bar");
    const exitBtn = this.barEl.createEl("button", { cls: "setlist-btn", attr: { "aria-label": "Exit" } });
    setIcon(exitBtn, "x");
    exitBtn.onclick = () => this.exit();

    this.prevBtn = this.barEl.createEl("button", { cls: "setlist-btn", attr: { "aria-label": "Previous song" } });
    setIcon(this.prevBtn, "chevron-left");
    this.prevBtn.onclick = () => void this.go(-1);

    const mid = this.barEl.createDiv("setlist-bar-mid");
    this.titleEl = mid.createDiv("setlist-bar-title");
    this.counterEl = mid.createDiv("setlist-bar-counter");
    mid.onclick = (e) => this.showJumpMenu(e);

    this.nextBtn = this.barEl.createEl("button", { cls: "setlist-btn", attr: { "aria-label": "Next song" } });
    setIcon(this.nextBtn, "chevron-right");
    this.nextBtn.onclick = () => void this.go(1);

    const smaller = this.barEl.createEl("button", { cls: "setlist-btn", text: "A-" });
    smaller.onclick = () => void this.changeFont(-2);
    const larger = this.barEl.createEl("button", { cls: "setlist-btn", text: "A+" });
    larger.onclick = () => void this.changeFont(2);
    const cols = this.barEl.createEl("button", { cls: "setlist-btn", attr: { "aria-label": "Toggle two columns" } });
    setIcon(cols, "columns-2");
    cols.onclick = async () => {
      this.plugin.settings.columns = this.plugin.settings.columns === 2 ? 1 : 2;
      await this.plugin.saveSettings();
      this.applyColumns();
      this.applyFit();
    };
    const fit = this.barEl.createEl("button", { cls: "setlist-btn", attr: { "aria-label": "Fit song to screen" } });
    setIcon(fit, "scaling");
    fit.onclick = async () => {
      this.plugin.settings.fitToScreen = !this.plugin.settings.fitToScreen;
      await this.plugin.saveSettings();
      this.applyFit();
    };
    const theme = this.barEl.createEl("button", { cls: "setlist-btn", attr: { "aria-label": "Toggle theme" } });
    setIcon(theme, "sun-moon");
    theme.onclick = async () => {
      this.plugin.settings.theme = this.plugin.settings.theme === "dark" ? "light" : "dark";
      await this.plugin.saveSettings();
      this.applyTheme();
    };

    this.scrollEl = root.createDiv("setlist-scroll");
    this.headerEl = this.scrollEl.createDiv("setlist-song-header");
    this.bodyEl = this.scrollEl.createDiv("setlist-song-body markdown-rendered");
    this.footerEl = this.scrollEl.createDiv("setlist-song-footer");

    this.registerDomEvent(root, "click", (e) => this.onTap(e));
    this.registerSwipe(this.scrollEl);
    this.registerDomEvent(document, "keydown", (e) => this.onKey(e));
    this.registerDomEvent(document, "visibilitychange", () => {
      if (document.visibilityState === "visible") void this.requestWakeLock();
    });

    this.applyFontSize();
    this.applyColumns();
    this.registerDomEvent(window, "resize", () => this.applyFit());
    await this.requestWakeLock();
    await this.reload();
  }

  async onClose(): Promise<void> {
    this.renderer?.unload();
    await this.wakeLock?.release().catch(() => undefined);
    this.wakeLock = null;
  }

  applyTheme(): void {
    this.contentEl.toggleClass("setlist-light", this.plugin.settings.theme === "light");
    this.contentEl.toggleClass("setlist-dark", this.plugin.settings.theme === "dark");
  }

  applyColumns(): void {
    this.contentEl.toggleClass("setlist-two-col", this.plugin.settings.columns === 2);
  }

  applyFontSize(): void {
    this.contentEl.style.setProperty("--setlist-font-size", `${this.plugin.settings.fontSize}px`);
  }

  private async changeFont(delta: number): Promise<void> {
    this.plugin.settings.fitToScreen = false;
    this.plugin.settings.fontSize = Math.min(96, Math.max(12, this.plugin.settings.fontSize + delta));
    this.applyFit();
    await this.plugin.saveSettings();
  }

  /** In fit mode, finds the largest font size at which the song needs no scrolling. */
  applyFit(): void {
    const fit = this.plugin.settings.fitToScreen;
    this.contentEl.toggleClass("setlist-fit", fit);
    this.applyFontSize();
    if (!fit || !this.bodyEl) return;
    const overflows = () =>
      this.bodyEl.scrollHeight > this.bodyEl.clientHeight + 1 ||
      this.bodyEl.scrollWidth > this.bodyEl.clientWidth + 1;
    let lo = 10;
    let hi = 120;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      this.contentEl.style.setProperty("--setlist-font-size", `${mid}px`);
      if (overflows()) hi = mid;
      else lo = mid;
    }
    this.contentEl.style.setProperty("--setlist-font-size", `${lo}px`);
  }

  private async requestWakeLock(): Promise<void> {
    if (!this.plugin.settings.wakeLock) return;
    try {
      const nav = navigator as unknown as { wakeLock?: { request(t: "screen"): Promise<WakeLockSentinelLike> } };
      this.wakeLock = (await nav.wakeLock?.request("screen")) ?? null;
    } catch {
      // Wake lock is best-effort; unsupported or denied is fine.
    }
  }

  async reload(): Promise<void> {
    if (!this.bodyEl) return;
    const file = this.app.vault.getAbstractFileByPath(this.setlistPath);
    this.songs = file instanceof TFile ? getSongs(this.app, file) : [];
    this.index = Math.min(Math.max(this.index, 0), Math.max(this.songs.length - 1, 0));
    await this.renderSong();
  }

  async go(delta: number): Promise<void> {
    await this.jump(this.index + delta);
  }

  async jump(i: number): Promise<void> {
    if (i < 0 || i >= this.songs.length) return;
    this.index = i;
    await this.renderSong();
    this.app.workspace.requestSaveLayout();
  }

  private async renderSong(): Promise<void> {
    this.renderer?.unload();
    this.renderer = new Component();
    this.renderer.load();
    this.headerEl.empty();
    this.bodyEl.empty();
    this.footerEl.empty();

    const total = this.songs.length;
    this.prevBtn.disabled = this.index <= 0;
    this.nextBtn.disabled = this.index >= total - 1;

    if (total === 0) {
      this.titleEl.setText("Empty setlist");
      this.counterEl.setText("");
      this.bodyEl.createEl("p", { text: "This setlist has no [[song links]] yet." });
      return;
    }

    const song = this.songs[this.index];
    const fm = this.app.metadataCache.getFileCache(song)?.frontmatter ?? {};
    const title = String(fm.title ?? song.basename);
    this.titleEl.setText(title);
    this.counterEl.setText(`${this.index + 1} / ${total}`);

    this.headerEl.createEl("h1", { text: title });
    const meta = [fm.artist, fm.key ? `Key: ${fm.key}` : null, fm.tempo ? `${fm.tempo} BPM` : null]
      .filter(Boolean)
      .join("  ·  ");
    if (meta) this.headerEl.createDiv({ cls: "setlist-song-meta", text: meta });

    const raw = await this.app.vault.cachedRead(song);
    const md = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
    await MarkdownRenderer.render(this.app, md, this.bodyEl, song.path, this.renderer);

    const upcoming = this.songs[this.index + 1];
    if (upcoming) {
      const nfm = this.app.metadataCache.getFileCache(upcoming)?.frontmatter ?? {};
      this.footerEl.setText(`Next: ${String(nfm.title ?? upcoming.basename)}`);
    } else {
      this.footerEl.setText("End of set");
    }

    this.scrollEl.scrollTo({ top: 0 });
    this.applyFit();
  }

  private showJumpMenu(e: MouseEvent): void {
    e.stopPropagation();
    const menu = new Menu();
    this.songs.forEach((s, i) => {
      menu.addItem((item) =>
        item
          .setTitle(`${i + 1}. ${s.basename}`)
          .setChecked(i === this.index)
          .onClick(() => void this.jump(i)),
      );
    });
    menu.showAtMouseEvent(e);
  }

  private onTap(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (target.closest(".setlist-bar") || target.closest("a")) return;
    const width = this.contentEl.clientWidth;
    if (this.plugin.settings.tapZones) {
      if (e.clientX < width * 0.2) return void this.go(-1);
      if (e.clientX > width * 0.8) return void this.go(1);
    }
    this.barVisible = !this.barVisible;
    this.barEl.toggleClass("is-hidden", !this.barVisible);
  }

  private registerSwipe(el: HTMLElement): void {
    let startX = 0;
    let startY = 0;
    this.registerDomEvent(el, "touchstart", (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    });
    this.registerDomEvent(el, "touchend", (e) => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2) void this.go(dx < 0 ? 1 : -1);
    });
  }

  private onKey(e: KeyboardEvent): void {
    if (this.app.workspace.getActiveViewOfType(PerformanceView) !== this) return;
    switch (e.key) {
      case "ArrowRight":
      case "PageDown":
        e.preventDefault();
        void this.go(1);
        break;
      case "ArrowLeft":
      case "PageUp":
        e.preventDefault();
        void this.go(-1);
        break;
      case "Escape":
        this.exit();
        break;
    }
  }

  exit(): void {
    this.leaf.detach();
  }
}
