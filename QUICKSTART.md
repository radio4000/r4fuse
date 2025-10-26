# Quick Start Guide

## 1. Start r4fuse

```bash
cd /home/u0/src/r4fuse
node bin/r4fuse.js mount
```

This will mount the filesystem at `~/mnt/radio4000/`

## 2. Browse channels (in another terminal)

```bash
# List all channels
ls ~/mnt/radio4000/channels/ | head -10

# Pick a channel and view its info
cat ~/mnt/radio4000/channels/tonitonirock/info.txt

# See the tracks
ls ~/mnt/radio4000/channels/tonitonirock/tracks/

# Read a track URL
cat ~/mnt/radio4000/channels/tonitonirock/tracks/001-*.url
```

## 3. Play music

```bash
# Play with mpv
mpv --playlist=~/mnt/radio4000/channels/tonitonirock/tracks.m3u

# Or play a single track
cat ~/mnt/radio4000/channels/tonitonirock/tracks/001-*.url | mpv -
```

## 4. Download tracks

```bash
# Queue a channel for download
echo "tonitonirock" > ~/mnt/radio4000/.ctrl/download

# Watch the downloads happen in the r4fuse terminal
# Downloaded files will be in ~/Music/radio4000/tonitonirock/
```

## 5. Stop r4fuse

Press `Ctrl+C` in the terminal running r4fuse.

## Example Session

```bash
# Terminal 1: Start r4fuse
cd /home/u0/src/r4fuse
node bin/r4fuse.js mount

# Terminal 2: Explore
ls ~/mnt/radio4000/channels/ | head
cat ~/mnt/radio4000/channels/*/info.txt | head -20
mpv --playlist=~/mnt/radio4000/channels/tonitonirock/tracks.m3u

# Download for offline listening
echo "tonitonirock" > ~/mnt/radio4000/.ctrl/download
ls ~/Music/radio4000/tonitonirock/
```
