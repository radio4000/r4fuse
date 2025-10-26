# Preferences & Configuration

r4fuse remembers your preferences across mount/unmount sessions using a JSON configuration file.

## Configuration Files

### Preferences File
Location: `~/.config/r4fuse/preferences.json`

This file stores:
- **Favorites**: Channels you've marked as favorites
- **Auto-sync**: Channels to automatically download
- **My channels**: Your own channel slugs (for future auth support)
- **Download settings**: yt-dlp format, quality, etc.

Example:
```json
{
  "version": 1,
  "myChannels": [],
  "favorites": ["oskar", "ko002"],
  "autoSync": ["oskar"],
  "syncSettings": {
    "onMount": false,
    "interval": null
  },
  "downloadSettings": {
    "format": "bestaudio",
    "audioFormat": "mp3",
    "audioQuality": "192K"
  }
}
```

### Environment Config
Location: `~/.config/r4fuse/config.json` (optional)

Override default paths:
```json
{
  "mountPoint": "/home/user/r4",
  "downloadDir": "/media/music/radio4000",
  "ytdlp": {
    "audioFormat": "opus",
    "audioQuality": "256K"
  }
}
```

## Using Favorites

### Add a Favorite

```bash
# Add oskar to favorites
echo "oskar" > ~/mnt/radio4000/.ctrl/favorite

# Add multiple favorites
for ch in oskar ko002 tonitonirock; do
  echo "$ch" > ~/mnt/radio4000/.ctrl/favorite
done
```

### Browse Favorites

```bash
# List all favorites
ls ~/mnt/radio4000/favorites/

# Access favorite channels directly
cat ~/mnt/radio4000/favorites/oskar/info.txt
mpv --playlist=~/mnt/radio4000/favorites/oskar/tracks.m3u
```

### Remove from Favorites

```bash
# Remove ko002 from favorites
echo "ko002" > ~/mnt/radio4000/.ctrl/unfavorite
```

## Auto-Sync Channels

Auto-sync channels are automatically downloaded with yt-dlp.

### Add to Auto-Sync

```bash
# Add oskar to auto-sync
echo "oskar" > ~/mnt/radio4000/.ctrl/autosync

# oskar will now appear in the auto-sync directory
ls ~/mnt/radio4000/auto-sync/
```

### Browse Auto-Sync Channels

```bash
# List channels set for auto-sync
ls ~/mnt/radio4000/auto-sync/

# Access them like regular channels
cat ~/mnt/radio4000/auto-sync/oskar/tracks.m3u
```

### Remove from Auto-Sync

```bash
# Remove oskar from auto-sync
echo "oskar" > ~/mnt/radio4000/.ctrl/no-autosync
```

### Manual Sync

You can still manually download auto-sync channels:

```bash
# Download a channel (whether in auto-sync or not)
echo "oskar" > ~/mnt/radio4000/.ctrl/download
```

## Filesystem Structure

```
~/mnt/radio4000/
├── channels/          # All public channels
├── favorites/         # Quick access to your favorites
│   ├── oskar/        # Links to /channels/oskar
│   └── ko002/
├── auto-sync/         # Channels to automatically download
│   └── oskar/
└── .ctrl/             # Control files
    ├── download       # Queue download
    ├── cache          # Clear cache
    ├── favorite       # Add to favorites
    ├── unfavorite     # Remove from favorites
    ├── autosync       # Add to auto-sync
    └── no-autosync    # Remove from auto-sync
```

## Control File Usage

All control files work the same way:

```bash
# Pattern: echo "channel-slug" > control-file

# Add to favorites
echo "oskar" > ~/.../ctrl/favorite

# Remove from favorites
echo "oskar" > ~/.../ctrl/unfavorite

# Add to auto-sync
echo "oskar" > ~/.../ctrl/autosync

# Remove from auto-sync
echo "oskar" > ~/.../ctrl/no-autosync

# Download
echo "oskar" > ~/.../ctrl/download

# Clear cache
echo "clear" > ~/.../ctrl/cache
```

## Workflows

### Discover → Favorite → Download

```bash
# 1. Browse channels
ls ~/mnt/radio4000/channels/ | shuf | head -10

# 2. Check out a channel
cat ~/mnt/radio4000/channels/oskar/info.txt
mpv --playlist=/home/u0/mnt/radio4000/channels/oskar/tracks.m3u

# 3. Like it? Add to favorites
echo "oskar" > ~/mnt/radio4000/.ctrl/favorite

# 4. Want it offline? Download it
echo "oskar" > ~/mnt/radio4000/.ctrl/download

# 5. Next time, access via favorites
ls ~/mnt/radio4000/favorites/
```

### Set Up Your Favorites on First Use

```bash
# Add all your favorite channels at once
for ch in oskar ko002 tonitonirock 200ok; do
  echo "$ch" > ~/mnt/radio4000/.ctrl/favorite
  echo "$ch" > ~/mnt/radio4000/.ctrl/autosync
done

# Verify
ls ~/mnt/radio4000/favorites/
ls ~/mnt/radio4000/auto-sync/
```

## Persistence

Your preferences are **automatically saved** and **persist across mounts**:

```bash
# Session 1
echo "oskar" > ~/mnt/radio4000/.ctrl/favorite
# Unmount

# Session 2 (later)
node bin/r4fuse.js mount
# Output: ✓ Loaded preferences (1 favorites, 0 auto-sync)

ls ~/mnt/radio4000/favorites/
# Output: oskar  ← still there!
```

## Tips

### Quick Favorite Management

```bash
# List all favorites
cat ~/.config/r4fuse/preferences.json | jq '.favorites'

# Manually edit preferences
nano ~/.config/r4fuse/preferences.json

# Restart r4fuse to apply changes
```

### Backup Your Preferences

```bash
# Backup
cp ~/.config/r4fuse/preferences.json ~/.config/r4fuse/preferences.backup.json

# Restore
cp ~/.config/r4fuse/preferences.backup.json ~/.config/r4fuse/preferences.json
```

### Share Your Favorites

```bash
# Export just favorites
cat ~/.config/r4fuse/preferences.json | jq '.favorites' > my-favorites.json

# Import on another machine
# Edit preferences.json and paste the favorites array
```

## Future Features

Ideas for future enhancements:

- **Auto-sync on mount**: Automatically download auto-sync channels when mounting
- **Periodic sync**: Set an interval to automatically sync channels
- **My channels**: Support for authenticated access to your own channels
- **Playlists**: Create custom playlists from tracks across channels

The preferences file structure supports these features already!
