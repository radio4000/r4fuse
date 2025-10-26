# r4fuse
FUSE filesystem for [Radio4000](https://radio4000.com).

## Prerequisites
- Node.js
- FUSE (libfuse)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) (optional, for downloads)

## Usage
```bash
# Check usage
make 

# Check all dependencies are installed
make check-deps

# Mount the filesystem
make mount

# Unmount
make unmount
```
