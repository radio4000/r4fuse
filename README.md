# r4fuse
FUSE filesystem for [Radio4000](https://radio4000.com).

## Prerequisites
- Node.js
- FUSE (libfuse)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) or [youtube-dl](https://github.com/ytdl-org/youtube-dl) (optional, for downloads)
- rsync (optional, for syncing downloads)

## Installation and Usage

r4fuse is distributed as an npm package and requires Node.js to run. This is because it uses native modules like `fuse-native` that interface directly with the operating system's FUSE implementation, which cannot be easily bundled into standalone executables.

To install and use r4fuse:

```bash
# Install globally using npm
npm install -g r4fuse

# Or run directly with npx without installation
npx r4fuse mount
```

### Why No Standalone Executables?

This project relies on the `fuse-native` native module, which interfaces with platform-specific system libraries (like libfuse). Native modules include precompiled platform-specific binaries that cannot be bundled into standalone executables using tools like Bun's executable functionality.

When attempting to bundle the application into a single executable file, the native module loading fails with errors like:

```
No native build was found for platform=linux arch=x64 runtime=node abi=137 ...
```

This occurs because the bundling process doesn't properly include or map the native binary files needed by the FUSE library. For this reason, the recommended distribution method is through npm, which properly handles native module installation and platform-specific dependencies.

## Usage

After installing via npm, you can use r4fuse:

**Mount the filesystem:**
```bash
r4fuse mount
```

Or run without installation using npx:
```bash
npx r4fuse mount
```

### How to Stop

The r4fuse process runs as a service when mounted. You can stop it in several ways:

1. **Terminal method:** If you ran `r4fuse mount` in a terminal, press `Ctrl+C` to gracefully stop and unmount
2. **Command method:** Run `r4fuse unmount` from another terminal
3. **Process method:** Kill the process if needed

When stopped properly, r4fuse will:
- Stop any active downloads immediately
- Clear the download queue
- Unmount the filesystem cleanly
- Ensure no partial downloads are left

### Prerequisites

You need system-level dependencies for FUSE to work:

- **Linux:** FUSE (libfuse) - install with `sudo apt install fuse` or equivalent
- **macOS:** FUSE for macOS (macFUSE) - download from https://osxfuse.github.io/
- **Windows:** WinFsp - download from https://winfsp.dev/rel/ or use WSL2 with FUSE support

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

All configuration is stored in `~/.config/radio4000/r4fuse/settings.json`. The file is automatically created with default values on first run.

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

#### yt-dlp Settings
- `ytdlp.format`: Video/audio format selection (default: `"bestaudio/best"`)
- `ytdlp.audioFormat`: Output audio format (default: `"mp3"`)
- `ytdlp.audioQuality`: Audio quality (default: `"0"` for highest quality VBR)
- `ytdlp.addMetadata`: Whether to add metadata via yt-dlp (default: `false`, we handle it ourselves)
- `ytdlp.embedThumbnail`: Embed thumbnail as cover art in audio files (default: `true`)
- `ytdlp.writeThumbnail`: Also save thumbnail as separate file (default: `false`)

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
