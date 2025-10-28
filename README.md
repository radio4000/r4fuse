# r4fuse
FUSE filesystem for [Radio4000](https://radio4000.com).

## Prerequisites
- Node.js
- FUSE (libfuse)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) or [youtube-dl](https://github.com/ytdl-org/youtube-dl) (optional, for downloads)
- rsync (optional, for syncing downloads)

## Building Executables

Pre-built executables for macOS, Linux, and Windows are available on the [Releases](https://github.com/radio4000/r4fuse/releases) page.

To build executables yourself, you can use Bun:

```bash
# Install Bun if you haven't already
curl -fsSL https://bun.sh/install | bash

# Install dependencies
bun install

# Build for your current platform
bun build bin/r4fuse.js --compile --outfile=r4fuse

# Or use npm scripts to build for specific platforms:
npm run build-linux    # Creates r4fuse-linux
npm run build-windows  # Creates r4fuse-windows.exe
npm run build-osx      # Creates r4fuse-osx

# Make it executable (Linux/macOS)
chmod +x r4fuse
```

### GitHub Actions Build

This project includes a GitHub Actions workflow that automatically builds executables for multiple platforms:
- Linux x64
- Windows x64
- macOS x64
- macOS ARM64 (Apple Silicon)

The workflow runs on pushes to main and on new releases.

To create a new release with executables, create and push a new Git tag with the format `v*` (e.g., `v1.0.0`).

## Using the Executables

The built executables are standalone and don't require Node.js to be installed on the user's system.

### How to Use

The executables are command-line tools, not GUI applications, so they are not double-clicked to launch. Instead, users should run them from a terminal/command prompt:

**On Linux/macOS:**
```bash
# Make executable (first time only)
chmod +x ./r4fuse

# Mount the filesystem
./r4fuse mount

# To unmount, press Ctrl+C in the terminal, or run:
./r4fuse unmount
```

**On Windows:**
```cmd
# Mount the filesystem
r4fuse.exe mount

# To unmount, press Ctrl+C in the terminal, or run:
r4fuse.exe unmount
```

### How to Stop

The r4fuse executable runs as a service when mounted. You can stop it in several ways:

1. **Terminal method:** If you ran `r4fuse mount` in a terminal, press `Ctrl+C` to gracefully stop and unmount
2. **Command method:** Run `r4fuse unmount` from another terminal/command prompt
3. **Process method:** Kill the process using `kill` (Linux/macOS) or Task Manager/`taskkill` (Windows) if needed

When stopped properly, r4fuse will:
- Stop any active downloads immediately
- Clear the download queue
- Unmount the filesystem cleanly
- Ensure no partial downloads are left

### Prerequisites

Even though the executables are standalone, they still require system-level dependencies:

- **Linux:** FUSE (libfuse) - install with `sudo apt install fuse` or equivalent
- **macOS:** FUSE for macOS (macFUSE) - download from https://osxfuse.github.io/
- **Windows:** WinFsp - download from https://winfsp.dev/rel/ or WSL2 with FUSE support

Additionally, [yt-dlp](https://github.com/yt-dlp/yt-dlp) is required for download functionality.

## Usage
```bash
# Check usage
make

# Check all dependencies are installed
make check-deps

# Mount the filesystem
make mount

# Unmount (from another terminal)
make unmount

# Or press Ctrl+C to unmount and stop any running downloads
```

### Graceful Shutdown

When you press **Ctrl+C** while the filesystem is mounted, r4fuse will:
1. Stop any active downloads immediately
2. Clear the download queue
3. Unmount the filesystem cleanly

This ensures no partial downloads are left and the filesystem is properly unmounted.

## Configuration

All configuration is stored in `~/.config/r4fuse/settings.json`. The file is automatically created with default values on first run.

### Settings.json Options

```json
{
  "ytdlp": {
    "format": "bestaudio/best",
    "audioFormat": "mp3",
    "audioQuality": "0",
    "addMetadata": false
  },
  "downloader": "yt-dlp",
  "mount": {
    "debug": false
  },
  "paths": {
    "mountPoint": "",
    "downloadDir": ""
  },
  "features": {
    "organizeByTags": true,
    "rsyncEnabled": false
  }
}
```

### Configuration Options

#### Downloader
- `downloader`: Choose between `"yt-dlp"` (default) or `"youtube-dl"`

#### Custom Paths
- `paths.mountPoint`: Custom mount point (leave empty for default: `~/mnt/radio4000`)
- `paths.downloadDir`: Custom download directory (leave empty for default: `~/Music/radio4000`)

#### Features
- `features.organizeByTags`: Automatically organize downloaded tracks by tags using symlinks (default: `true`)
  - Creates a `tags/` directory with symlinks organized by hashtags found in track descriptions
  - Tracks without tags go into `tags/untagged/`
- `features.rsyncEnabled`: Enable rsync sync functionality (default: `false`)

## Track Organization

### FUSE Filesystem (Mounted)
In the mounted FUSE filesystem, track files use the actual timestamps from Radio4000:
- Files have **no numeric prefix**
- Timestamps reflect when tracks were added to the channel
- Sort by date to see tracks in chronological order: `ls -lt ~/mnt/radio4000/channels/oskar/tracks/`

```
~/mnt/radio4000/channels/oskar/
├── ABOUT.txt
├── tracks.m3u
├── tracks/              # Track metadata files
│   ├── track-one.txt    # Uses actual Radio4000 timestamps
│   ├── track-two.txt
│   └── ...
└── tags/                # Same files, organized by tags
    ├── electronic/
    ├── ambient/
    └── untagged/
```

### Downloaded Files
When `features.organizeByTags` is enabled, downloads use numeric prefixes and symlinks:

```
~/Music/radio4000/channel-name/
├── tracks/              # Actual audio files with ID3 metadata
│   ├── 001-track-one.mp3
│   ├── 002-track-two.mp3
│   └── ...
├── tags/                # Symlinks organized by tags
│   ├── electronic/
│   │   ├── 001-track-one.mp3 -> ../../tracks/001-track-one.mp3
│   │   └── ...
│   ├── ambient/
│   │   └── 002-track-two.mp3 -> ../../tracks/002-track-two.mp3
│   └── untagged/       # Tracks without tags
└── playlist.m3u
```

Tags are extracted from hashtags in track descriptions (e.g., `#electronic #ambient`).

## Rsync Sync

Enable rsync support in settings.json to sync downloaded channels to external locations. Rsync can be triggered programmatically when needed.

```bash
# Enable in settings.json
"features": {
  "rsyncEnabled": true
}
```

The sync uses `rsync -avz --progress --delete` to keep destinations in sync with your local downloads.

## Examples

```bash
# Browse channels
ls ~/mnt/radio4000/channels/

# View tracks sorted by date (oldest first)
ls -lt ~/mnt/radio4000/channels/oskar/tracks/

# View tracks sorted by date (newest first)
ls -ltr ~/mnt/radio4000/channels/oskar/tracks/

# View a channel's tracks organized by tags
ls ~/mnt/radio4000/channels/oskar/tags/
ls ~/mnt/radio4000/channels/oskar/tags/electronic/

# Read track metadata
cat ~/mnt/radio4000/channels/oskar/tracks/some-track.txt

# Play a channel's tracks
mpv --playlist=~/mnt/radio4000/channels/oskar/tracks.m3u

# Downloaded channels have actual audio files with ID3 tags
ls ~/Music/radio4000/oskar/tracks/          # Numbered files
ls ~/Music/radio4000/oskar/tags/electronic/ # Symlinks by tag
```
