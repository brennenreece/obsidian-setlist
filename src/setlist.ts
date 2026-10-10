import { App, TFile } from "obsidian";

export function isSetlist(app: App, file: TFile): boolean {
  const fm = app.metadataCache.getFileCache(file)?.frontmatter;
  return fm?.type === "setlist";
}

export function getSetlists(app: App): TFile[] {
  return app.vault
    .getMarkdownFiles()
    .filter((f) => isSetlist(app, f))
    .sort((a, b) => a.basename.localeCompare(b.basename));
}

/** Resolves the [[links]] in a setlist note, in document order, to song files. */
export function getSongs(app: App, setlist: TFile): TFile[] {
  const links = app.metadataCache.getFileCache(setlist)?.links ?? [];
  const songs: TFile[] = [];
  for (const link of links) {
    const target = app.metadataCache.getFirstLinkpathDest(link.link, setlist.path);
    if (target && target.extension === "md" && target.path !== setlist.path) {
      songs.push(target);
    }
  }
  return songs;
}
