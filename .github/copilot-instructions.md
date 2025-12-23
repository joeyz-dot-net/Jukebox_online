# Music Player AI Agent Guide

## Quick Start
**Bilingual (Chinese/English) web music player: FastAPI backend + vanilla ES6 frontend.**

```bash
pip install -r requirements.txt
python main.py  # Interactive startup, prompts for streaming enable/disable
# Open http://localhost:80
```

**Before making changes**: Update both [app.py](app.py) routes AND [static/js/api.js](static/js/api.js) FormData fields—they must match exactly.

## Architecture Overview

| Layer | Key Files | Notes |
|-------|-----------|-------|
| Entry | [main.py](main.py) | Boots uvicorn, forces UTF-8 stdout (Windows), prompts for streaming |
| Backend | [app.py](app.py) (~2300 lines) | 60+ FastAPI routes, global singletons: `PLAYER`, `PLAYLISTS_MANAGER`, `RANK_MANAGER` |
| Models | [models/player.py](models/player.py), [models/stream.py](models/stream.py) | MPV IPC via named pipe, FFmpeg 3-thread streaming |
| Frontend | [static/js/main.js](static/js/main.js) | ES6 modules, `MusicPlayerApp` class, polls `/status` every 500ms |
| Config | [settings.ini](settings.ini) | Read once at startup—**restart required for changes** |

### Global Singletons (app.py)
```python
PLAYER = MusicPlayer.initialize()      # MPV subprocess control
PLAYLISTS_MANAGER = Playlists()        # Multi-playlist management
RANK_MANAGER = HitRank()               # Play history & rankings
CURRENT_PLAYLIST_ID = "default"        # Active playlist tracker
```

### External Processes
- **MPV**: `\\.\pipe\mpv-pipe` named pipe IPC. Path from `settings.ini [app].mpv_cmd`
- **FFmpeg**: Browser audio streaming via `/stream/play`. Requires VB-Cable for audio capture

## Key Patterns

### API Response Format
```python
{"status": "OK"|"ERROR", "message": "...", "data": {...}}
```
Preserve Chinese strings for bilingual UI (e.g., `"加载中…"`, `"播放失败"`).

### Frontend-Backend Sync
```javascript
// static/js/api.js - FormData fields must match app.py route parameters
async play(url, title, type = 'local', streamFormat = 'mp3') {
    const formData = new FormData();
    formData.append('url', url);
    formData.append('title', title);
    formData.append('type', type);          // 'local' | 'youtube'
    formData.append('stream_format', streamFormat);
    return this.postForm('/play', formData);
}
```

### Song Data Contract
```python
{
    "url": str,           # File path or YouTube URL
    "title": str,
    "type": "local"|"youtube",
    "duration": float,
    "thumbnail_url": str  # Optional, auto-derived for YouTube
}
```

### Playlist Mutations
All changes go through `PLAYLISTS_MANAGER` singleton → auto-saves to `playlists.json`.
```python
PLAYLISTS_MANAGER.add_song(playlist_id, song_dict)
PLAYLISTS_MANAGER.save()  # Called automatically after mutations
```

## Streaming Architecture (Critical)

**3-thread async broadcast** in [models/stream.py](models/stream.py):
1. `read_stream` - Reads FFmpeg output chunks
2. `broadcast_worker` - Distributes to client queues (non-blocking)
3. `send_heartbeats` - Keepalive packets (seq_id < 0)

**Browser-specific configs** (Safari needs larger buffers):
| Browser | Queue Size | Chunk Size | Heartbeat |
|---------|------------|------------|-----------|
| Safari  | 512 blocks | 32KB       | 50ms      |
| Chrome/Edge/Firefox | 64 blocks | 192KB | 1s |

## Debugging Commands (PowerShell)

```powershell
# Check MPV process
Get-Process mpv
Test-Path "\\.\pipe\mpv-pipe"

# List audio devices for FFmpeg
ffmpeg -list_devices true -f dshow -i dummy

# Stream diagnostics
curl http://localhost/stream/status
```

## Common Pitfalls

| Issue | Cause | Fix |
|-------|-------|-----|
| Settings not applying | settings.ini read once | Restart `python main.py` |
| MPV silent failure | Pipe mismatch or already running | Check `Get-Process mpv`, verify `[app].mpv_cmd` |
| Stream cuts out (Safari) | Thread architecture broken | Verify 3 threads in stream.py active |
| Chinese text garbled | UTF-8 not forced | Check `sys.stdout.encoding` at startup |
| YouTube fails | yt-dlp missing | Install yt-dlp.exe in PATH or bin/ |

## Adding New Routes

1. Define in [app.py](app.py) with FastAPI decorators
2. Add matching method in [static/js/api.js](static/js/api.js)
3. Use FormData for POST with file/form fields
4. Access global singletons directly (`PLAYER`, `PLAYLISTS_MANAGER`, etc.)

```python
# app.py
@app.post("/my-endpoint")
async def my_endpoint(request: Request):
    form = await request.form()
    value = form.get("my_field")
    return {"status": "OK", "data": {...}}
```

## File Locations

| Purpose | File |
|---------|------|
| State persistence | `playlists.json`, `playback_history.json` |
| User settings | `user_settings.json` (runtime), `settings.ini` (startup config) |
| Styles | [static/css/](static/css/) - `base.css`, `theme-*.css` |
| i18n | [static/js/i18n.js](static/js/i18n.js) |

## Build & Deploy

```bash
.\build_exe.bat  # PyInstaller → dist/app.exe
# Manually add: ffmpeg.exe, yt-dlp.exe to bundle
```