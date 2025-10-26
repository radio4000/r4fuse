# How r4fuse Works

## Two Separate Systems

r4fuse has **two distinct parts** that work together:

### 1. FUSE Filesystem (Read-Only View)

Location: `~/mnt/radio4000/`

This is a **virtual filesystem** that shows Radio4000 data as files and directories:

```
~/mnt/radio4000/
├── channels/               # All public channels
│   └── oskar/
│       ├── info.txt       # Channel metadata (plain text)
│       ├── image.url      # Channel image URL
│       ├── tracks.m3u     # M3U playlist (streaming URLs)
│       └── tracks/
│           ├── 001-song.url   # Individual track URLs
│           ├── 002-track.url  # Each .url file contains a YouTube/SoundCloud URL
│           └── ...
└── .ctrl/                  # Control files
    ├── download           # Write channel slug here to download
    └── cache              # Write "clear" to flush cache
```

**What are .url files?**
- Each `.url` file contains a single YouTube or SoundCloud URL
- They're **NOT audio files** - they're text files with URLs
- Purpose: Browse, read URLs, or stream directly with mpv
- These files are generated from the Radio4000 API

### 2. Download System (Real Audio Files)

Location: `~/Music/radio4000/`

When you trigger a download, yt-dlp downloads **actual audio files** here:

```
~/Music/radio4000/
├── ko002/
│   ├── 001-song.mp3       # Real MP3 files
│   ├── 002-track.mp3      # Downloaded with yt-dlp
│   ├── playlist.m3u       # Local playlist referencing these files
│   └── ...
```

## How to Use

### Just Browsing (No Downloads)

```bash
# Start r4fuse
node bin/r4fuse.js mount

# Read channel info
cat ~/mnt/radio4000/channels/oskar/info.txt

# See track URLs
cat ~/mnt/radio4000/channels/oskar/tracks/001-*.url
# Output: https://www.youtube.com/watch?v=...

# Stream with mpv (uses URLs directly)
mpv --playlist=/home/u0/mnt/radio4000/channels/oskar/tracks.m3u
```

**Note:** Use absolute paths with mpv, not `~/` (shell doesn't expand `~` in this context)

### Downloading for Offline Use

```bash
# Queue a channel for download
echo "ko002" > /home/u0/mnt/radio4000/.ctrl/download

# Downloads will be saved to:
ls ~/Music/radio4000/ko002/

# Play downloaded files
mpv ~/Music/radio4000/ko002/*.mp3
```

## Common Questions

### Q: Why are there .url files instead of audio?

**A:** The FUSE filesystem is a **read-only view** of the Radio4000 API. It shows you what's available. To get actual audio files, you need to explicitly download them via the control file.

This design follows Unix philosophy:
- Separation of concerns: Browsing vs. downloading
- No fake files: Downloads are real files in real locations
- Control files for actions (like `/proc` in Linux)

### Q: Do I need authentication?

**A:** No! All Radio4000 channels and tracks are public. The API key in `.env` is the public anonymous key that anyone can use.

The `my` and `following` folders were removed because they would require user authentication, which adds complexity.

### Q: Why do downloads fail?

**A:** Most failures are due to **YouTube's bot protection**, not r4fuse. YouTube has been cracking down on automated downloads. This is a known yt-dlp issue.

Solutions:
- SoundCloud tracks usually work fine
- Use cookies with yt-dlp (see yt-dlp documentation)
- Some tracks may be region-restricted
- Try updating yt-dlp: `pip install --upgrade yt-dlp`

### Q: How does mpv fail with `~` in paths?

**A:** Shell expansion doesn't work in all contexts. Always use absolute paths:

```bash
# ✗ Wrong
mpv --playlist=~/mnt/radio4000/channels/oskar/tracks.m3u

# ✓ Right
mpv --playlist=/home/u0/mnt/radio4000/channels/oskar/tracks.m3u

# ✓ Or use $HOME
mpv --playlist=$HOME/mnt/radio4000/channels/oskar/tracks.m3u
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│  User                                           │
│  ├─ Browse: ls, cat, grep, find                │
│  ├─ Stream: mpv, vlc                           │
│  └─ Download: echo "channel" > .ctrl/download  │
└─────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│  r4fuse FUSE Filesystem                         │
│  ├─ Reads from Radio4000 API                   │
│  ├─ Caches results (5 min TTL)                 │
│  └─ Presents as virtual files                  │
└─────────────────────────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
┌──────────────────┐    ┌─────────────────────────┐
│  Radio4000 API   │    │  Download Manager       │
│  (Supabase)      │    │  ├─ Queue system        │
│  - Channels      │    │  ├─ Spawns yt-dlp       │
│  - Tracks        │    │  └─ Saves to ~/Music/   │
└──────────────────┘    └─────────────────────────┘
```

## Benefits of This Design

✅ **Lightweight browsing** - No need to download everything
✅ **Clear separation** - Browse vs. download are different operations
✅ **Unix-friendly** - Works with all standard tools
✅ **No fake files** - Downloads are real files in real locations
✅ **Scriptable** - Easy to automate with shell scripts
✅ **No authentication** - Public data, no credentials needed

## Example Workflow

```bash
# 1. Start r4fuse
node bin/r4fuse.js mount

# 2. Discover channels
ls /home/u0/mnt/radio4000/channels/ | shuf | head -5

# 3. Check out a channel
cat /home/u0/mnt/radio4000/channels/oskar/info.txt
cat /home/u0/mnt/radio4000/channels/oskar/tracks/001-*.url

# 4. Stream it
mpv --playlist=/home/u0/mnt/radio4000/channels/oskar/tracks.m3u

# 5. Download for offline (if you like it)
echo "oskar" > /home/u0/mnt/radio4000/.ctrl/download

# 6. Play downloaded files
mpv ~/Music/radio4000/oskar/playlist.m3u
```

## Tips

- **Search channels**: `grep -r "jazz" /home/u0/mnt/radio4000/channels/*/info.txt`
- **Count tracks**: `find /home/u0/mnt/radio4000/channels/oskar/tracks -name "*.url" | wc -l`
- **Random channel**: `mpv --playlist=$(find /home/u0/mnt/radio4000/channels -name "tracks.m3u" | shuf -n 1)`
- **Batch download**: `for ch in oskar ko002; do echo "$ch" > /home/u0/mnt/radio4000/.ctrl/download; done`
