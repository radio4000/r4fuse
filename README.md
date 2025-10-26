# r4fuse

FUSE filesystem for [Radio4000](https://radio4000.com) - browse channels and download tracks from your terminal.

## Features

- **Browse channels** as directories in your filesystem
- **Rich track metadata** in `.txt` files with descriptions, timestamps, and URLs
- **Play directly** using mpv, vlc, or any media player via `.m3u` playlists
- **Download tracks** with yt-dlp integration (highest quality audio)
- **Favorites & auto-sync** - mark channels and automatically keep them updated
- **Persistent preferences** across mount/unmount sessions
- **Unix-friendly** - works with all standard tools (grep, find, pipes)
- **Cached API** calls for fast browsing

## Quick Start

```bash
# Install dependencies
make install

# Check all dependencies are installed
make check-deps

# Mount the filesystem
make mount

# Browse channels
ls ~/mnt/radio4000/channels/

# Read track details
cat ~/mnt/radio4000/channels/oskar/tracks/001-*.txt

# Play a channel
mpv --playlist=~/mnt/radio4000/channels/oskar/tracks.m3u

# Add to favorites
echo "oskar" > ~/mnt/radio4000/.ctrl/favorite

# Download for offline listening
echo "oskar" > ~/mnt/radio4000/.ctrl/download

# Unmount
make unmount
```

## Installation

### Prerequisites

- Node.js 18+
- FUSE (libfuse)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) (optional, for downloads)

```bash
# Install FUSE
# Ubuntu/Debian
sudo apt install fuse libfuse-dev

# macOS
brew install macfuse

# Install yt-dlp (optional but recommended)
# Ubuntu/Debian
sudo apt install yt-dlp

# macOS
brew install yt-dlp

# Or with pip
pip install yt-dlp
```

### Install r4fuse

```bash
git clone https://github.com/yourusername/r4fuse.git
cd r4fuse
make install
make check-deps
```

### Configuration

1. Copy the environment template:
```bash
cp .env.example .env
```

2. The public Radio4000 credentials are already in `.env`:
```bash
SUPABASE_URL=https://oupgudlkspsmzkmeovlh.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Usage

### Makefile Commands

```bash
make help          # Show all available commands
make install       # Install dependencies
make check-deps    # Check if required dependencies are installed
make mount         # Mount the filesystem
make unmount       # Unmount the filesystem
make remount       # Unmount and remount
make dev           # Mount in development mode (shows errors)
make test          # Run tests
make test-mount    # Test basic mount operations
make clean         # Clean cache and temporary files
make status        # Show filesystem status
make logs          # Show recent logs
```

### Filesystem Structure

```
~/mnt/radio4000/
├── HELP.txt              # Quick start guide
├── channels/             # All public channels
│   └── oskar/
│       ├── ABOUT.txt     # Human-readable channel description
│       ├── info.txt      # Machine-readable metadata
│       ├── image.url     # Channel image URL (full CDN path)
│       ├── tracks.m3u    # Playlist for streaming
│       └── tracks/
│           ├── tracks.json           # Complete metadata JSON
│           ├── 001-first-track.txt   # Rich metadata (oldest track)
│           ├── 002-second-track.txt
│           └── ...
├── favorites/            # Quick access to favorite channels
│   ├── oskar/
│   └── ko002/
├── auto-sync/            # Channels marked for auto-download
│   └── oskar/
└── .ctrl/                # Control files
    ├── HELP.txt          # Control file usage
    ├── download          # Queue channel download
    ├── favorite          # Add to favorites
    ├── unfavorite        # Remove from favorites
    ├── autosync          # Mark for auto-sync
    ├── no-autosync       # Remove from auto-sync
    └── cache             # Clear API cache
```

### Track Files

Each track has a `.txt` file with rich metadata:

```bash
$ cat ~/mnt/radio4000/channels/oskar/tracks/001-glen-underground-afro-gente.txt

Title: Glen Underground - Afro Gente
URL: https://www.youtube.com/watch?v=B5ZjevzU98o

Description:
awwwwwwwww

Added: 9/20/2014, 1:51:09 PM
Updated: 4/25/2024, 4:29:00 PM
```

**Note:** Tracks are numbered chronologically - `001` is the oldest track, and the highest number is the newest.

### Browse Channels

```bash
# List all channels
ls ~/mnt/radio4000/channels/

# View channel description
cat ~/mnt/radio4000/channels/oskar/ABOUT.txt

# View channel metadata
cat ~/mnt/radio4000/channels/oskar/info.txt

# List tracks (oldest to newest)
ls ~/mnt/radio4000/channels/oskar/tracks/

# Read track details
cat ~/mnt/radio4000/channels/oskar/tracks/001-*.txt

# Get all track metadata as JSON
cat ~/mnt/radio4000/channels/oskar/tracks/tracks.json
```

### Play Music

```bash
# Play entire channel as playlist
mpv --playlist=~/mnt/radio4000/channels/oskar/tracks.m3u

# Shuffle play
mpv --shuffle --playlist=~/mnt/radio4000/channels/oskar/tracks.m3u

# Play with VLC
vlc ~/mnt/radio4000/channels/oskar/tracks.m3u

# Play a specific track (extract URL from .txt file)
mpv "$(grep '^URL:' ~/mnt/radio4000/channels/oskar/tracks/001-*.txt | cut -d' ' -f2-)"
```

### Favorites

```bash
# Add a channel to favorites
echo "oskar" > ~/mnt/radio4000/.ctrl/favorite

# List favorites
ls ~/mnt/radio4000/favorites/

# Access favorite (same as channels/)
cat ~/mnt/radio4000/favorites/oskar/ABOUT.txt

# Remove from favorites
echo "oskar" > ~/mnt/radio4000/.ctrl/unfavorite
```

### Download Channels

Downloads use yt-dlp with **highest quality audio** (bestaudio/best format, VBR ~245 kbps mp3).

```bash
# Download a channel
echo "oskar" > ~/mnt/radio4000/.ctrl/download

# Downloads go to
ls ~/Music/radio4000/oskar/

# Play downloaded files
mpv ~/Music/radio4000/oskar/playlist.m3u
```

### Auto-Sync

Mark channels for automatic downloading:

```bash
# Add to auto-sync
echo "oskar" > ~/mnt/radio4000/.ctrl/autosync

# Channel appears in auto-sync directory
ls ~/mnt/radio4000/auto-sync/

# Remove from auto-sync
echo "oskar" > ~/mnt/radio4000/.ctrl/no-autosync
```

### Preferences

Your preferences are automatically saved to `~/.config/r4fuse/preferences.json` and persist across mount/unmount sessions.

```bash
# View preferences
cat ~/.config/r4fuse/preferences.json

# Check status
make status
```

## Advanced Usage

### Unix Tools Integration

```bash
# Search track descriptions
grep -r "jazz" ~/mnt/radio4000/channels/oskar/tracks/*.txt

# Count tracks in a channel
ls -1 ~/mnt/radio4000/channels/oskar/tracks/*.txt | wc -l

# Find channels with "rock" in the name
ls ~/mnt/radio4000/channels/ | grep rock

# Get all track URLs from a channel
grep "^URL:" ~/mnt/radio4000/channels/oskar/tracks/*.txt | cut -d' ' -f2-
```

### Custom Configuration

Create `~/.config/r4fuse/config.json` to override defaults:

```json
{
  "mountPoint": "/home/user/r4",
  "downloadDir": "/media/music/radio4000",
  "ytdlp": {
    "audioFormat": "opus",
    "audioQuality": "0"
  }
}
```

### Environment Variables

```bash
export R4_MOUNT_POINT=~/radio4000
export R4_DOWNLOAD_DIR=~/Downloads/radio4000
make mount
```

## Troubleshooting

### Check if mounted

```bash
make status
# or
mountpoint ~/mnt/radio4000
```

### View logs

```bash
make logs
# or
tail -f /tmp/r4fuse-test.log
```

### Clean restart

```bash
make clean
make mount
```

### yt-dlp errors

YouTube sometimes blocks downloads. This is not an r4fuse issue. Try:
- Updating yt-dlp: `pip install --upgrade yt-dlp`
- Using a different network
- Waiting and retrying later

### Permission errors

Make sure you have FUSE permissions:
```bash
# Add yourself to fuse group
sudo usermod -a -G fuse $USER
# Log out and back in
```

## Architecture

See [HOW_IT_WORKS.md](HOW_IT_WORKS.md) for technical details.

## Documentation

- [HOW_IT_WORKS.md](HOW_IT_WORKS.md) - Architecture and implementation
- [PREFERENCES.md](PREFERENCES.md) - Preferences system details
- [QUICKSTART.md](QUICKSTART.md) - Quick reference guide

## Project Structure

```
r4fuse/
├── bin/
│   └── r4fuse.js         # CLI entry point
├── src/
│   ├── index.js          # Mount/unmount operations
│   ├── filesystem.js     # FUSE handlers (readdir, getattr, read, write)
│   ├── config.js         # Configuration management
│   ├── cache.js          # API response caching
│   ├── download.js       # yt-dlp integration
│   └── preferences.js    # User preferences (favorites, auto-sync)
├── Makefile              # Build and run commands
├── package.json
└── .env                  # Supabase credentials
```

## License

MIT

## Credits

- [Radio4000](https://radio4000.com) for the amazing platform
- [fuse-native](https://github.com/fuse-friends/fuse-native) for FUSE bindings
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) for download functionality
