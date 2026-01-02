# ClubMusic — AI Agent Guide

**Full-stack web music player**: FastAPI backend + ES6 frontend + MPV IPC engine.  
**Key distinction**: Bilingual (zh/en), user-isolation via localStorage, event-driven auto-play, Windows/PyInstaller-optimized.

> **Last Updated**: 2026-01-02 | **Focus**: Backend-controlled auto-play, API parity patterns, singleton architecture

## ⚠️ Critical Rules (Must Follow)

| Rule | Why & Example |
|------|---------------|
| **API Sync** | Backend [app.py](../app.py) + Frontend [static/js/api.js](../static/js/api.js) must match exactly. New route? Update BOTH. Field rename? Check both. Missing sync = silent failures. |
| **FormData vs JSON** | **Player control** (`/play`, `/seek`, `/volume`, `/playlist_remove`): use `await request.form()`. **Data CRUD** (`/playlists`, `/playlist_reorder`, `/search_song`): use `await request.json()`. Wrong type = 400 errors. |
| **Global Singletons** | `PLAYER`, `PLAYLISTS_MANAGER`, `RANK_MANAGER` initialized in [app.py L70-80](../app.py#L70-L80). Access directly—never create new instances. Duplication = state corruption. |
| **Persistence** | Call `PLAYLISTS_MANAGER.save()` after ANY playlist mutation. Forgetting = data loss on restart. |
| **User Isolation** | Playlist selection stored in browser `localStorage.selectedPlaylistId`, NOT backend. Each tab/browser independent. Backend only validates existence via `/playlists/{id}/switch`. |
| **UTF-8 Windows** | Every `.py` entry point needs UTF-8 wrapper (see [models/__init__.py#L6-11](../models/__init__.py)). Missing = Chinese chars garbled in logs. |
| **i18n Completeness** | Always add BOTH `zh` and `en` keys in [static/js/i18n.js](../static/js/i18n.js) when adding UI text. Missing lang = undefined strings. |
| **Default Playlist** | Never delete or rename the `default` playlist (ID: `"default"`). Backend assumes it always exists for auto-play logic. |

## Architecture & Data Flow

```
Browser ←1s poll /status→ FastAPI (app.py) ←→ Singletons ←→ MPV (\\.\pipe\mpv-pipe)
   │                           │                                ↑
   ├── ES6 modules ────────────┴── models/*.py                 │
   └── localStorage                    ├── player.py (event listener thread)
       (selectedPlaylistId,            │   └─ Detects MPV "end-file" event
        theme, language)                │      └─ Calls handle_playback_end()
                                        │         └─ Deletes current song + plays next
                                        │            (NO frontend involvement)
                                        └── playlists.json, playback_history.json
```

**Key Insight**: Auto-next is 100% backend-driven via MPV event listener thread in [models/player.py#L569-636](../models/player.py#L569-L636). Frontend only reflects state via `/status` polling.

## Critical Patterns & Gotchas

### Auto-Play Mechanism (Backend-Controlled)
**Location**: [models/player.py#L637-720](../models/player.py#L637-L720) — `handle_playback_end()`

1. MPV event listener thread detects `end-file` event
2. Backend automatically:
   - Deletes current song from default playlist (by URL match)
   - Plays next song in queue (index 0 after deletion)
   - Updates `PLAYER.current_index` and `PLAYER.current_meta`
3. Frontend reads state changes via `/status` polling (1s interval)

**Rule**: Never implement auto-next logic in frontend. Backend owns this completely.

### Song Insertion Pattern ("Add Next" feature)
**Location**: [app.py#L851-917](../app.py#L851-L917) — `/playlist_add` endpoint

```python
# Calculate insert position: don't interrupt current song, add to "next" position
current_index = PLAYER.current_index  # Maintained by /play endpoint
insert_index = current_index + 1 if current_index >= 0 else 1
playlist.songs.insert(insert_index, song_dict)
```

**Invariants**:
- Position 0 = currently playing (never modify unless stopping playback)
- `current_index` updated by `/play` endpoint, NOT by add/remove operations
- After deletion: if `current_index >= len(songs)`, reset to `max(-1, len(songs) - 1)`

### PyInstaller Resource Access
**Pattern**: Use `_get_resource_path()` wrapper in [app.py#L38-51](../app.py#L38-L51)

```python
# Development: uses source directory
# Packaged: uses sys._MEIPASS temp directory
static_dir = _get_resource_path("static")
app.mount("/static", StaticFiles(directory=static_dir))
```

**External tools** (`mpv.exe`, `yt-dlp.exe`) live next to exe, NOT in `_MEIPASS`.

### Cover Art Retrieval
**Endpoint**: `/cover/{file_path:path}` in [app.py#L258-310](../app.py#L258-L310)

Priority order:
1. Embedded cover (extracted via `mutagen`, returned as bytes)
2. Directory cover files (`cover.jpg`, `folder.jpg`, `albumart.jpg`)
3. Placeholder (`static/images/preview.png`)

**Note**: Never saves extracted covers to disk—streams bytes directly to avoid temp file clutter.

### YouTube Thumbnail Generation
**Pattern**: Auto-generate from video ID when missing

```python
if song_type == "youtube" and not thumbnail_url:
    # Extract video ID from URL
    video_id = extract_video_id(url)  # Regex match
    thumbnail_url = f"https://img.youtube.com/vi/{video_id}/default.jpg"
```

Applies to: `/playlist_add`, `/playlists/{id}/add_next`, YouTube search results.

### Frontend State Management
**Location**: [static/js/main.js#L23-42](../static/js/main.js#L23-L42)

```javascript
class MusicPlayerApp {
    constructor() {
        // User-isolated: each browser/tab maintains own playlist selection
        this.currentPlaylistId = localStorage.getItem('selectedPlaylistId') || 'default';
        
        // State tracking: only log when values change (reduce log spam)
        this.lastLoopMode = null;
        this.lastVolume = null;
        this.lastPlaybackStatus = null;
    }
}
```

**Rule**: All user preferences (theme, language, volume) stored in `localStorage`, NOT backend.

## Developer Workflows

### Development Server
```powershell
# Interactive audio device selection + starts FastAPI
python main.py

# Direct start (uses device from settings.ini)
python app.py
```

**Port**: 80 (requires admin on Windows). Change in [settings.ini](../settings.ini) if needed.

### Build Windows Executable
```powershell
# Via VS Code task
# Ctrl+Shift+P → "Run Task" → "Build"

# Or manual
.\build_exe.bat
```

**Output**: `dist/app.exe` (single-file bundle, ~150MB).  
**Spec file**: [app.spec](../app.spec) — controls PyInstaller bundling.

### Configuration
**File**: [settings.ini](../settings.ini)

Key settings:
- `music_dir`: Root for local music library
- `mpv_cmd`: Full command with IPC pipe path (`\\.\pipe\mpv-pipe`)
- `allowed_extensions`: `.mp3,.wav,.flac,.aac,.m4a`
- `local_volume`: Default volume (0-100)
- `playback_history_max`: Max history entries before trimming

**Reload**: Requires app restart. No hot-reload.

### Debugging
**Console**: [static/js/debug.js](../static/js/debug.js) — press `` ` `` (backtick) to toggle debug panel.  
**Logs**: stdout (dev) or use Windows Event Viewer (packaged exe).

## High-Value Files (Read These First)

| File | Purpose |
|------|---------|
| [app.py](../app.py) | FastAPI routing, singletons, auto-fill thread, all endpoints |
| [models/player.py](../models/player.py) | MPV lifecycle, event listener, playback history, auto-next logic |
| [models/playlists.py](../models/playlists.py) | Multi-playlist model, persistence (`playlists.json`) |
| [models/song.py](../models/song.py) | Song classes (LocalSong, StreamSong), yt-dlp wrappers |
| [static/js/api.js](../static/js/api.js) | Frontend API wrapper—**must mirror app.py** |
| [static/js/main.js](../static/js/main.js) | App initialization, state management, polling loop |
| [static/js/i18n.js](../static/js/i18n.js) | Translations (zh/en)—add both languages for new strings |

## Common Mistakes & How to Avoid

| Mistake | How to Detect | Fix |
|---------|---------------|-----|
| API mismatch | 400 errors, missing fields in response | Compare [app.py](../app.py) route with [static/js/api.js](../static/js/api.js) method |
| Forgot `save()` | Playlist changes lost on restart | Add `PLAYLISTS_MANAGER.save()` after mutation |
| Wrong payload type | "form required" or empty request body | Check endpoint in [app.py](../app.py): FormData vs JSON |
| Duplicated singleton | State out of sync, missing songs | Always use `app.PLAYER`, `app.PLAYLISTS_MANAGER` |
| Frontend auto-next | Double-play, skipped songs | Remove frontend logic; backend owns auto-next |
| Missing i18n key | "undefined" in UI | Add to both `zh` and `en` in [static/js/i18n.js](../static/js/i18n.js) |
| PyInstaller path issue | FileNotFoundError in packaged exe | Use `_get_resource_path()` for bundled assets |

## API Design Conventions

### FormData Endpoints (Player Control)
```python
@app.post("/play")
async def play(request: Request):
    form = await request.form()
    url = form.get("url")
    # ...
```

**Frontend**:
```javascript
async play(url, title, type = 'local') {
    const formData = new FormData();
    formData.append('url', url);
    formData.append('title', title);
    formData.append('type', type);
    return this.postForm('/play', formData);
}
```

### JSON Endpoints (Data CRUD)
```python
@app.post("/playlist_add")
async def add_to_playlist(request: Request):
    data = await request.json()
    playlist_id = data.get("playlist_id")
    # ...
```

**Frontend**:
```javascript
async addToPlaylist(data) {
    return this.post('/playlist_add', data);
}
```

## Code Examples

### Adding a New Endpoint

**1. Backend** ([app.py](../app.py)):
```python
@app.post("/my_endpoint")
async def my_endpoint(request: Request):
    data = await request.json()  # or request.form()
    # ... logic ...
    return {"status": "OK", "data": result}
```

**2. Frontend** ([static/js/api.js](../static/js/api.js)):
```javascript
async myEndpoint(data) {
    return this.post('/my_endpoint', data);
}
```

**3. Usage** (in UI module):
```javascript
import { api } from './api.js';

const result = await api.myEndpoint({ key: value });
if (result.status === "OK") {
    // handle success
}
```

### Modifying Playlist
```python
playlist = PLAYLISTS_MANAGER.get_playlist(playlist_id)
playlist.songs.append(song_dict)
playlist.updated_at = time.time()
PLAYLISTS_MANAGER.save()  # ← CRITICAL: don't forget
```

### Adding i18n String
**File**: [static/js/i18n.js](../static/js/i18n.js)

```javascript
const translations = {
    zh: {
        'my.new.key': '我的新文本',
        // ...
    },
    en: {
        'my.new.key': 'My New Text',
        // ...
    }
};
```

**Usage**:
```javascript
import { i18n } from './i18n.js';
const text = i18n.t('my.new.key');
```

## Testing & Verification

### Quick Checks After Changes
1. **API change**: Test both endpoints (curl/Postman) AND frontend UI
2. **Playlist mutation**: Restart app → verify `playlists.json` persisted
3. **Auto-next**: Play song to end → verify next song plays automatically
4. **Multi-language**: Switch language in settings → all text updates
5. **PyInstaller**: Build exe → run → verify paths resolve correctly

### Manual Test Scenarios
- **User isolation**: Open two browser tabs → select different playlists → verify independent
- **YouTube search**: Search "test" → add to playlist → verify thumbnail shows
- **Cover art**: Play local MP3 → verify cover displays (embedded or folder)
- **Loop modes**: Toggle loop (0→1→2→0) → verify behavior matches mode

## Questions & Feedback

If any section is unclear or you need more detail on:
- Specific endpoint patterns (e.g., YouTube playlist extraction)
- Frontend module interactions (e.g., player ↔ playlist manager)
- MPV IPC command examples
- Error handling conventions
- Logging patterns

...please ask! I'll expand those sections with concrete examples from the codebase.`instructions
# ClubMusic AI Agent Guide

Concise, actionable instructions for AI coding agents working on ClubMusic (FastAPI backend + ES6 frontend + MPV IPC).

Last updated: 2025-12-29

## Critical Rules (must follow)
- API surface parity: update both `app.py` and `static/js/api.js` for any endpoint changes (method, payload type, field names).
- Form vs JSON: Player-control endpoints use FormData (`/play`, `/seek`, `/volume`, `/playlist_remove`); CRUD/search endpoints use JSON (`/playlists`, `/playlist_reorder`, `/search_song`).
- Singletons: use the global `PLAYER = MusicPlayer.initialize()` and `PLAYLISTS_MANAGER` from `app.py` — do not instantiate duplicates.
- Persistence: call `PLAYLISTS_MANAGER.save()` after any playlist mutation so `playlists.json` is updated.

## Architecture & Dataflow (short)
- Browser ↔ FastAPI (`/status` polls every ~1s) ↔ Singletons ↔ MPV IPC (pipe: `\\.\pipe\mpv-pipe`).
- Auto-next is 100% backend-controlled: `models/player.py` listens for MPV `end-file` and runs `handle_playback_end()` (deletes current item, plays next). Frontend only reflects `/status`.
- Playlist selection is client-local: `localStorage.selectedPlaylistId` determines UI; backend only validates via `/playlists/{id}/switch`.

## Project-specific patterns & gotchas
- UTF-8 wrappers: entry scripts set stdout encoding for Windows (see `models/__init__.py`). Keep that pattern when adding CLI entrypoints.
- MPV startup: `main.py` interactively selects audio device and updates `mpv_cmd`. During runtime the environment var `MPV_AUDIO_DEVICE` may be used.
- yt-dlp integration: `models/song.py` and `models/player.py` call `yt-dlp` (prefer `bin/yt-dlp.exe` when present).
- Event-driven auto-fill: `app.py:auto_fill_and_play_if_idle()` can auto-fill default playlist after idle; review before changing default-queue behavior.

## Developer workflows (quick)
- Run dev server (interactive device select):
  ```powershell
  ClubMusic — Copilot instructions (concise)

  Purpose
  - Quick, actionable guidance for AI coding agents contributing to ClubMusic (FastAPI backend + ES6 frontend + MPV IPC on Windows).

  Key architecture (one-line)
  - Browser polls `/status` → FastAPI (`app.py`) → in-process singletons (`PLAYER`, `PLAYLISTS_MANAGER`, `RANK_MANAGER`) → MPV via IPC (`\\.\pipe\mpv-pipe`).

  Critical rules (must follow)
  - API parity: always update both `app.py` and `static/js/api.js` when changing an endpoint (method, payload type or field names).
  - Payload types: Player-control endpoints expect FormData (use `request.form()`): `/play`, `/seek`, `/volume`, `/playlist_remove`, `/playlists/{id}/add_next`, etc. CRUD/search endpoints expect JSON (`request.json()`): `/playlists` (create), `/playlist_reorder`, `/search_song`, `/play_youtube_playlist`.
  - Singletons: use the global instances exported/created in `app.py` — `PLAYER = MusicPlayer.initialize(data_dir=".")`, `PLAYLISTS_MANAGER = Playlists()`; do NOT instantiate additional MusicPlayer/Playlists objects.
  - Persistence: call `PLAYLISTS_MANAGER.save()` after any playlist mutation to persist `playlists.json`.
  - Entrypoint pattern: use `MusicPlayer.initialize()` (not `__init__()`) and keep the UTF-8 stdout wrapper used in `models/__init__.py` for Windows.

  Important files to read/modify
  - `app.py` — central routing, singletons, auto-fill thread, MPV wrappers (`mpv_command`, `mpv_get`).
  - `models/player.py` — MPV lifecycle, play/stop/loop, playback history add, end-file handling.
  - `models/playlists.py` and `playlists.json` — playlist model & persistence; `PLAYLISTS_MANAGER.save()` required.
  - `models/song.py` — StreamSong / LocalSong helpers and `yt-dlp` wrappers.
  - `static/js/api.js` — frontend API glue; shows which endpoints use FormData vs JSON. Keep it in sync with `app.py`.
  - `static/js/i18n.js` — confirm both `zh` and `en` translations are present when adding UI strings.
  - `settings.ini` — runtime configuration (music_dir, bin_dir, mpv_cmd, allowed_extensions, local/youtube search limits).

  Build & run (developer commands)
  - Dev server (interactive audio-device selection):
  ```powershell
  python main.py
  ```
  - Run directly (app exports uvicorn in __main__):
  ```powershell
  python app.py
  ```
  - Build Windows executable (PyInstaller wrapper):
  ```powershell
  .\build_exe.bat
  ```

  Conventions and gotchas (project-specific)
  - MPV and helpers live under `bin/` (e.g., `bin\\mpv.exe`, `bin\\yt-dlp.exe`) — PyInstaller bundles assets into `_MEIPASS` at runtime; use `_get_resource_path()` in `app.py` when referencing static assets.
  - Default playlist ID: `default`. Do not delete it. Many routines (auto-fill, playlist APIs) assume a `default` playlist exists.
  - User-isolation: frontend stores selected playlist in localStorage; backend `playlists/{id}/switch` only validates existence and does NOT change server global state.
  - Auto-fill behavior: `app.py:auto_fill_and_play_if_idle()` runs in a background thread and may add network (YouTube/stream) items to the default playlist; be careful when changing queue semantics.
  - Cover retrieval: use `/cover/{file_path:path}` which prefers embedded cover bytes, then directory cover files, then placeholder.

  Quick examples (copyable)
  - Play from frontend (FormData): see `static/js/api.js` → `play()` uses `postForm('/play', formData)`.
  - Add to playlist as JSON: `POST /playlist_add` with `{ playlist_id, song: {url,title,type}, insert_index? }` (frontend calls `addToPlaylist`).
  - Reorder playlist (JSON): `POST /playlist_reorder` with `{ playlist_id, from_index, to_index }`.

  If you modify endpoints, list exact changes in the PR description and update `static/js/api.js` and any frontend callers. Ask for manual verification when changes affect MPV args, device selection or `settings.ini` keys.

  Questions / feedback
  - I updated [.github/copilot-instructions.md](.github/copilot-instructions.md). Tell me if you want more examples (route+payload snippets), add CI/test commands, or include contributor conventions (commit message style, PR checks).