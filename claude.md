# r4fuse - Context for Claude

## Project Overview

r4fuse is a FUSE (Filesystem in Userspace) implementation that mounts Radio4000 channels as a virtual filesystem. Users can browse channels, read track metadata, stream music, and download tracks using standard Unix tools.

## Current Status

**Version:** 1.0.0 (feature-complete)
**Status:** Production ready

### Recent Changes (Latest Session)

1. **Fixed Image URLs** - Now show full CDN paths instead of just storage IDs
2. **Fixed Track Ordering** - Track #001 is now the oldest track (chronological order)
3. **Removed .url Files** - Only .txt files remain with all metadata (simpler UX)
4. **Configured ytdlp** - Uses highest quality audio (bestaudio/best, VBR ~245 kbps)
5. **Created Makefile** - All commands accessible via `make`
6. **Updated Documentation** - Comprehensive README and docs

## Key Features

- Read-only virtual filesystem for browsing channels
- Rich metadata in .txt files (title, URL, description, timestamps)
- Persistent preferences (favorites, auto-sync)
- Download integration with yt-dlp
- Full Unix tooling support

## Architecture

### File Structure

```
r4fuse/
├── bin/r4fuse.js          # CLI entry point
├── src/
│   ├── index.js           # Mount/unmount, FUSE initialization
│   ├── filesystem.js      # Core FUSE handlers (readdir, getattr, read, write)
│   ├── config.js          # Configuration management
│   ├── cache.js           # API caching (5min TTL)
│   ├── download.js        # yt-dlp integration
│   └── preferences.js     # User preferences (favorites, auto-sync)
├── Makefile               # Build and run commands
└── .env                   # Supabase credentials
```

### Virtual Filesystem Structure

```
~/mnt/radio4000/
├── HELP.txt              # Quick start guide
├── channels/             # All public channels (API-driven)
│   └── <slug>/
│       ├── ABOUT.txt     # Human-readable description
│       ├── info.txt      # Machine-readable metadata
│       ├── image.url     # Full CDN URL
│       ├── tracks.m3u    # Playlist
│       └── tracks/
│           ├── tracks.json           # All metadata as JSON
│           ├── 001-oldest.txt        # Oldest track
│           └── NNN-newest.txt        # Newest track
├── favorites/            # Virtual view into channels/
├── auto-sync/            # Virtual view into channels/
└── .ctrl/                # Control files for actions
    ├── download          # Write channel slug to download
    ├── favorite          # Write to add favorite
    ├── unfavorite        # Write to remove favorite
    ├── autosync          # Write to enable auto-sync
    └── no-autosync       # Write to disable auto-sync
```

### Key Implementation Details

1. **FUSE Handlers** (src/filesystem.js)
   - `readdir()` - List directory contents
   - `getattr()` - Get file attributes (size, mode, timestamps)
   - `read()` - Read file contents
   - `write()` - Write to control files only

2. **Track Ordering**
   - API returns newest first
   - We reverse the array so #001 is oldest (src/filesystem.js:228-229, 518-519)
   - Chronological numbering makes sense to users

3. **Audio Quality** (src/config.js:37-43)
   - format: 'bestaudio/best'
   - audioQuality: '0' (VBR ~245 kbps for mp3)
   - extractAudio: true
   - addMetadata: true (with thumbnail embedding)

4. **Caching** (src/cache.js)
   - In-memory cache with 5min TTL
   - Caches channel and track API calls
   - Reduces API load and improves performance

5. **Preferences** (src/preferences.js)
   - Saved to ~/.config/r4fuse/preferences.json
   - Persists across mount/unmount
   - Schema:
     ```json
     {
       "version": 1,
       "favorites": ["oskar", "ko002"],
       "autoSync": ["oskar"],
       "myChannels": [],
       "syncSettings": { "onMount": false, "interval": null },
       "downloadSettings": { ... }
     }
     ```

## Common Tasks

### Mounting

```bash
make mount           # Standard mount
make dev             # Development mode (shows errors)
make remount         # Unmount and remount
```

### Testing

```bash
make test            # Run test suite
make test-mount      # Quick mount test
make check-deps      # Verify dependencies
```

### Debugging

```bash
make logs            # View recent logs
make status          # Show current status
make clean           # Clean cache
```

## Important Notes

### File Type Bits

FUSE requires proper file type bits in stat() responses:
- S_IFDIR (0o040000) for directories
- S_IFREG (0o100000) for regular files

See src/filesystem.js:16-48 for stat() helper implementation.

### Promise-Based Handlers

fuse-native requires handlers to use callbacks, not async/await:

```javascript
// WRONG
async (path, cb) => { ... }

// CORRECT
(path, cb) => {
  someAsyncFunction(path)
    .then(result => cb(0, result))
    .catch(err => cb(Fuse.EIO))
}
```

See src/index.js for examples.

### Control Files

Write operations are only allowed on .ctrl/* files:
- truncate/chmod/chown return 0 for .ctrl files
- Return EROFS (read-only filesystem) for everything else
- See src/filesystem.js:292-363 for write() handler

## Future Enhancements

Potential features to add:

1. **Auto-sync on mount** - Download auto-sync channels when mounting
2. **Periodic sync** - Background downloads at intervals
3. **Authentication** - Access private/user channels
4. **Playlists** - Custom playlists across channels
5. **Search** - Full-text search in /search/ directory
6. **Stats** - Channel stats in /stats/ directory

## Dependencies

### Required

- Node.js 18+ (ES modules, async/await)
- fuse-native ^2.2.6 (FUSE bindings)
- @radio4000/sdk ^0.4.11 (API client)
- @supabase/supabase-js (Database client)

### Optional

- yt-dlp (for downloads)

## Testing Notes

When testing, always check:

1. **Mount success** - `mountpoint ~/mnt/radio4000`
2. **Directory listing** - `ls ~/mnt/radio4000/`
3. **File reading** - `cat ~/mnt/radio4000/HELP.txt`
4. **Track files** - Verify .txt files have content
5. **Control writes** - Test favorite/download operations
6. **Preferences** - Check persistence across mounts

## Known Issues

1. **YouTube blocking** - yt-dlp downloads may fail due to YouTube bot detection (not r4fuse's fault)
2. **FUSE permissions** - User must be in `fuse` group on some systems
3. **Unmount errors** - Sometimes fusermount fails if FS is busy (use `fusermount -uz` to force)

## Configuration

### Default Paths

- Mount: `~/mnt/radio4000`
- Downloads: `~/Music/radio4000`
- Cache: `~/.cache/r4fuse`
- Config: `~/.config/r4fuse/`
- Preferences: `~/.config/r4fuse/preferences.json`

### Environment Variables

- `R4_MOUNT_POINT` - Override mount point
- `R4_DOWNLOAD_DIR` - Override download directory
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_KEY` - Supabase anon key

## Code Style

- ES modules (import/export)
- Async/await preferred
- camelCase for variables/functions
- Clear error messages
- Extensive comments for complex logic

## Working with This Project

### Quick Start for Claude

1. Read README.md for user-facing docs
2. Read this file (claude.md) for technical context
3. Check src/filesystem.js for core logic
4. Run `make help` to see available commands
5. Run `make test-mount` to verify everything works

### Making Changes

1. Always test with `make dev` first
2. Check logs with `make logs`
3. Test all FUSE operations (ls, cat, write)
4. Verify preferences persist
5. Update README.md if user-facing changes

### Debugging Checklist

- [ ] FUSE mounted? (`make status`)
- [ ] Logs show errors? (`make logs`)
- [ ] Dependencies installed? (`make check-deps`)
- [ ] Cache causing issues? (`make clean`)
- [ ] Correct file permissions?
- [ ] stat() returning proper file type bits?

## Contact & Support

- Issues: https://github.com/yourusername/r4fuse/issues
- Radio4000: https://radio4000.com
- FUSE docs: https://www.kernel.org/doc/html/latest/filesystems/fuse.html
