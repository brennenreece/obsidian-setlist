import {
  App,
  FuzzySuggestModal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  normalizePath,
} from "obsidian";
import { DEFAULT_SETTINGS, SetlistSettings } from "./settings";
import { ImportSongModal, LyricsSearchModal } from "./importer";
import { getSetlists, isSetlist } from "./setlist";
import { PerformanceView, VIEW_TYPE_PERFORMANCE } from "./view";
import { DashboardView, VIEW_TYPE_DASHBOARD } from "./dashboard";

class SetlistPicker extends FuzzySuggestModal<TFile> {
  constructor(app: App, private items: TFile[], private onPick: (f: TFile) => void) {
    super(app);
    this.setPlaceholder("Choose a setlist");
  }
  getItems(): TFile[] {
    return this.items;
  }
  getItemText(f: TFile): string {
    return f.basename;
  }
  onChooseItem(f: TFile): void {
    this.onPick(f);
  }
}

export default class SetlistPlugin extends Plugin {
  settings: SetlistSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.registerView(VIEW_TYPE_PERFORMANCE, (leaf) => new PerformanceView(leaf, this));

    this.registerView(VIEW_TYPE_DASHBOARD, (leaf) => new DashboardView(leaf, this));

    this.addRibbonIcon("music", "Start setlist performance", () => this.pickAndPerform());
    this.addRibbonIcon("list-music", "Open setlist dashboard", () => void this.openDashboard());
    this.addCommand({
      id: "open-dashboard",
      name: "Open dashboard",
      callback: () => void this.openDashboard(),
    });

    this.addCommand({
      id: "create-setlist",
      name: "Create setlist",
      callback: () => void this.createSetlist(),
    });
    this.addCommand({
      id: "add-song-to-setlist",
      name: "Add current song to setlist",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || isSetlist(this.app, file)) return false;
        if (!checking) this.pickSetlist((setlist) => void this.addSong(setlist, file));
        return true;
      },
    });
    this.addCommand({
      id: "search-lyrics",
      name: "Search online lyrics",
      callback: () => new LyricsSearchModal(this.app, this).open(),
    });
    this.addCommand({
      id: "import-song",
      name: "Import song from text or ChordPro",
      callback: () => new ImportSongModal(this.app, this).open(),
    });
    this.addCommand({
      id: "start-performance",
      name: "Start performance",
      callback: () => this.pickAndPerform(),
    });
    this.addCommand({
      id: "next-song",
      name: "Performance: next song",
      checkCallback: (checking) => this.withView(checking, (v) => void v.go(1)),
    });
    this.addCommand({
      id: "previous-song",
      name: "Performance: previous song",
      checkCallback: (checking) => this.withView(checking, (v) => void v.go(-1)),
    });
    this.addCommand({
      id: "exit-performance",
      name: "Exit performance",
      checkCallback: (checking) => this.withView(checking, (v) => v.exit()),
    });

    this.addSettingTab(new SetlistSettingTab(this.app, this));
  }

  private withView(checking: boolean, fn: (v: PerformanceView) => void): boolean {
    const view = this.app.workspace.getActiveViewOfType(PerformanceView);
    if (!view) return false;
    if (!checking) fn(view);
    return true;
  }

  private pickSetlist(cb: (f: TFile) => void): void {
    const setlists = getSetlists(this.app);
    if (setlists.length === 0) {
      new Notice("No setlists found. Use “Create setlist” first.");
      return;
    }
    new SetlistPicker(this.app, setlists, cb).open();
  }

  private pickAndPerform(): void {
    const active = this.app.workspace.getActiveFile();
    if (active && isSetlist(this.app, active)) {
      void this.perform(active);
      return;
    }
    this.pickSetlist((f) => void this.perform(f));
  }

  async openDashboard(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD)[0];
    const leaf = existing ?? this.app.workspace.getLeaf("tab");
    if (!existing) await leaf.setViewState({ type: VIEW_TYPE_DASHBOARD, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async perform(setlist: TFile, index = 0): Promise<void> {
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({
      type: VIEW_TYPE_PERFORMANCE,
      active: true,
      state: { setlistPath: setlist.path, index },
    });
    this.app.workspace.revealLeaf(leaf);
  }

  private async createSetlist(): Promise<void> {
    const folder = normalizePath(this.settings.setlistFolder || "/");
    if (folder !== "/" && !this.app.vault.getAbstractFileByPath(folder)) {
      await this.app.vault.createFolder(folder);
    }
    let name = "New Setlist";
    let path = normalizePath(`${folder}/${name}.md`);
    for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) {
      name = `New Setlist ${i}`;
      path = normalizePath(`${folder}/${name}.md`);
    }
    const file = await this.app.vault.create(path, "---\ntype: setlist\n---\n\n");
    await this.app.workspace.getLeaf(false).openFile(file);
    new Notice("Setlist created. Add songs as a list of [[links]].");
  }

  private async addSong(setlist: TFile, song: TFile): Promise<void> {
    await this.app.vault.process(setlist, (data) => {
      const sep = data.endsWith("\n") ? "" : "\n";
      return `${data}${sep}- [[${song.basename}]]\n`;
    });
    new Notice(`Added “${song.basename}” to ${setlist.basename}`);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}

class SetlistSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: SetlistPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    new Setting(containerEl)
      .setName("Setlist folder")
      .setDesc("Where new setlists are created.")
      .addText((t) =>
        t.setValue(s.setlistFolder).onChange(async (v) => {
          s.setlistFolder = v.trim();
          await this.plugin.saveSettings();
        }),
      );
    new Setting(containerEl)
      .setName("Song folder")
      .setDesc("Where downloaded and imported songs are saved.")
      .addText((t) =>
        t.setValue(s.songFolder).onChange(async (v) => {
          s.songFolder = v.trim();
          await this.plugin.saveSettings();
        }),
      );
    new Setting(containerEl)
      .setName("Font size")
      .setDesc("Lyrics font size in pixels.")
      .addSlider((sl) =>
        sl.setLimits(12, 96, 2).setValue(s.fontSize).setDynamicTooltip().onChange(async (v) => {
          s.fontSize = v;
          await this.plugin.saveSettings();
        }),
      );
    new Setting(containerEl).setName("Theme").addDropdown((d) =>
      d
        .addOptions({ dark: "Dark", light: "Light" })
        .setValue(s.theme)
        .onChange(async (v) => {
          s.theme = v as "dark" | "light";
          await this.plugin.saveSettings();
          this.plugin.app.workspace
            .getLeavesOfType(VIEW_TYPE_PERFORMANCE)
            .forEach((l) => (l.view as PerformanceView).applyTheme());
        }),
    );
    new Setting(containerEl).setName("Columns").addDropdown((d) =>
      d
        .addOptions({ "1": "One", "2": "Two" })
        .setValue(String(s.columns))
        .onChange(async (v) => {
          s.columns = v === "2" ? 2 : 1;
          await this.plugin.saveSettings();
        }),
    );
    new Setting(containerEl)
      .setName("Fit song to screen")
      .setDesc("Automatically shrink the text so the whole song is visible without scrolling.")
      .addToggle((t) =>
        t.setValue(s.fitToScreen).onChange(async (v) => {
          s.fitToScreen = v;
          await this.plugin.saveSettings();
        }),
      );
    new Setting(containerEl)
      .setName("Gemini API key (optional)")
      .setDesc(
        "Enables AI song suggestions. Get a free key at aistudio.google.com. The key is stored in this plugin's data file in your vault, and your song titles and artists are sent to Google when you use it.",
      )
      .addText((t) => {
        t.inputEl.type = "password";
        t.setValue(s.geminiApiKey).onChange(async (v) => {
          s.geminiApiKey = v.trim();
          await this.plugin.saveSettings();
        });
      });
    new Setting(containerEl)
      .setName("Gemini model")
      .setDesc("Model name used for AI suggestions.")
      .addText((t) =>
        t.setValue(s.geminiModel).onChange(async (v) => {
          s.geminiModel = v.trim() || "gemini-2.5-flash";
          await this.plugin.saveSettings();
        }),
      );
    new Setting(containerEl)
      .setName("Tap screen edges to navigate")
      .setDesc("Tap the left or right 20% of the screen for previous or next song.")
      .addToggle((t) =>
        t.setValue(s.tapZones).onChange(async (v) => {
          s.tapZones = v;
          await this.plugin.saveSettings();
        }),
      );
    new Setting(containerEl)
      .setName("Keep screen awake")
      .setDesc("Prevent the screen from sleeping during a performance.")
      .addToggle((t) =>
        t.setValue(s.wakeLock).onChange(async (v) => {
          s.wakeLock = v;
          await this.plugin.saveSettings();
        }),
      );
  }
}
