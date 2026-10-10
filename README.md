# Obsidian Setlist

Organize songs into setlists and perform lyrics full-screen (works on iPad).

- **Song**: any note; optional frontmatter `title`, `artist`, `key`, `tempo`. Body is the lyrics.
- **Setlist**: a note with `type: setlist` frontmatter and a list of `[[song links]]` in order.
- Commands: Create setlist, Add current song to setlist, Start performance, next/previous/exit.
- Navigation: tap left/right 20% of screen, swipe, on-screen buttons, arrow/PageUp/PageDown keys (Bluetooth pedals), tap the title to jump.

## Install
`npm install && npm run build`, then copy `main.js`, `manifest.json`, `styles.css` into `<vault>/.obsidian/plugins/setlist/` (sync the vault to iPad).

## Getting songs
- **Search online lyrics** (LRCLIB, lyrics only, no key needed) → Download saves a note in the song folder.
- **Import song from text or ChordPro** → paste text; `{title:}`, `{artist:}`, `{key:}` fill the metadata, inline `[C]` chords are kept as written.
