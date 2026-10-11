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

## Dashboard
**Open dashboard** (ribbon list icon): searchable song library (filter by tag) on the left; setlist editor on the right with add/remove, reorder (up/down buttons or drag on desktop), sections ("Set 1"), rename, duplicate, delete and Perform. Tap a song to edit title, artist, key, tempo, tags and lyrics.

## Suggestions
In the dashboard, **Find similar songs** under a setlist suggests (1) songs from your library ranked by shared tags, artist, tempo and key, and (2) tracks by artists related to your setlist's main artists (Deezer's public API, no key). Online picks have a download button that fetches lyrics from LRCLIB.

### Playlists and AI
**Find similar songs** also searches public Deezer playlists (by your setlist's artists) that contain several of your songs and suggests the other tracks on them. Optionally add a free Gemini API key (aistudio.google.com) in settings for AI picks; each AI suggestion is checked against Deezer and dropped if it doesn't exist. The key is stored in the plugin's data file in your vault, and song titles/artists are sent to Google when you use it.
