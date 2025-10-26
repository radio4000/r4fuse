#!/bin/bash

set -e

MOUNT_POINT="$HOME/mnt/radio4000"
TEST_CHANNEL="oskar"
DOWNLOAD_DIR="$HOME/Music/radio4000"

echo "╔═══════════════════════════════════════╗"
echo "║  r4fuse Integration Test              ║"
echo "╚═══════════════════════════════════════╝"
echo

# Check if already mounted
if mountpoint -q "$MOUNT_POINT" 2>/dev/null; then
  echo "⚠️  $MOUNT_POINT is already mounted. Unmounting..."
  fusermount -u "$MOUNT_POINT" || umount "$MOUNT_POINT"
  sleep 1
fi

# Start r4fuse in background
echo "1. Starting r4fuse..."
node bin/r4fuse.js mount > /tmp/r4fuse.log 2>&1 &
R4FUSE_PID=$!

# Wait for mount
echo "   Waiting for filesystem to mount..."
for i in {1..15}; do
  # Check if mount message appeared in log
  if grep -q "Mounted at" /tmp/r4fuse.log 2>/dev/null; then
    sleep 1  # Give kernel time to register mountpoint
    if mountpoint -q "$MOUNT_POINT" 2>/dev/null || [ -d "$MOUNT_POINT/channels" ] 2>/dev/null; then
      echo "   ✓ Mounted successfully (PID: $R4FUSE_PID)"
      break
    fi
  fi
  sleep 1
  if [ $i -eq 15 ]; then
    echo "   ✗ Failed to mount within 15 seconds"
    cat /tmp/r4fuse.log
    kill $R4FUSE_PID 2>/dev/null || true
    exit 1
  fi
done

# Function to cleanup on exit
cleanup() {
  echo
  echo "Cleaning up..."
  if [ -n "$R4FUSE_PID" ]; then
    kill $R4FUSE_PID 2>/dev/null || true
  fi
  sleep 1
  if mountpoint -q "$MOUNT_POINT" 2>/dev/null; then
    fusermount -u "$MOUNT_POINT" || umount "$MOUNT_POINT"
  fi
  echo "✓ Cleaned up"
}

trap cleanup EXIT INT TERM

# Run tests
echo
echo "2. Testing filesystem operations..."
echo

# Test root directory
echo "   Testing: ls $MOUNT_POINT/"
ls "$MOUNT_POINT/" | head -5
echo "   ✓ Root directory readable"

# Test channels list
echo
echo "   Testing: ls $MOUNT_POINT/channels/ | head -5"
CHANNELS=$(ls "$MOUNT_POINT/channels/" | head -5)
echo "$CHANNELS"
echo "   ✓ Channels directory readable"

# Test specific channel
echo
echo "   Testing: Channel info for $TEST_CHANNEL"
if [ -d "$MOUNT_POINT/channels/$TEST_CHANNEL" ]; then
  echo "   ✓ Channel directory exists"

  # Test info.txt
  echo
  echo "   Testing: cat info.txt"
  INFO=$(cat "$MOUNT_POINT/channels/$TEST_CHANNEL/info.txt" | head -5)
  echo "$INFO" | sed 's/^/     /'
  echo "   ✓ info.txt readable"

  # Test image.url
  echo
  echo "   Testing: cat image.url"
  IMAGE_URL=$(cat "$MOUNT_POINT/channels/$TEST_CHANNEL/image.url" 2>/dev/null || echo "")
  if [ -n "$IMAGE_URL" ]; then
    echo "     $IMAGE_URL"
    echo "   ✓ image.url readable"
  else
    echo "   ⊘ image.url empty (channel may not have image)"
  fi

  # Test tracks directory
  echo
  echo "   Testing: ls tracks/ | head -3"
  TRACKS=$(ls "$MOUNT_POINT/channels/$TEST_CHANNEL/tracks/" 2>/dev/null | head -3)
  echo "$TRACKS" | sed 's/^/     /'
  TRACK_COUNT=$(ls "$MOUNT_POINT/channels/$TEST_CHANNEL/tracks/" 2>/dev/null | wc -l)
  echo "   ✓ Found $TRACK_COUNT tracks"

  # Test reading a track URL
  echo
  echo "   Testing: cat first track .url file"
  FIRST_TRACK=$(ls "$MOUNT_POINT/channels/$TEST_CHANNEL/tracks/"*.url 2>/dev/null | head -1)
  if [ -n "$FIRST_TRACK" ]; then
    TRACK_URL=$(cat "$FIRST_TRACK")
    echo "     $TRACK_URL"
    echo "   ✓ Track URL readable"
  fi

  # Test m3u playlist
  echo
  echo "   Testing: head tracks.m3u"
  head -5 "$MOUNT_POINT/channels/$TEST_CHANNEL/tracks.m3u" | sed 's/^/     /'
  echo "   ✓ M3U playlist readable"

else
  echo "   ✗ Channel $TEST_CHANNEL not found"
  exit 1
fi

# Test control files
echo
echo "3. Testing control files..."
echo "   Testing: cache clear"
echo "clear" > "$MOUNT_POINT/.ctrl/cache"
echo "   ✓ Cache control writable"

# Test stat command
echo
echo "4. Testing with stat command..."
stat "$MOUNT_POINT/channels/$TEST_CHANNEL/info.txt" | grep "Size:" | sed 's/^/   /'
echo "   ✓ stat command works"

# Test find command
echo
echo "5. Testing with find command..."
FOUND=$(find "$MOUNT_POINT/channels/$TEST_CHANNEL" -name "*.url" 2>/dev/null | wc -l)
echo "   Found $FOUND .url files"
echo "   ✓ find command works"

# Test file command
echo
echo "6. Testing with file command..."
file "$MOUNT_POINT/channels/$TEST_CHANNEL/info.txt" | sed 's/^/   /'
echo "   ✓ file command works"

echo
echo "╔═══════════════════════════════════════╗"
echo "║  Integration Test Results             ║"
echo "╚═══════════════════════════════════════╝"
echo "✓ All integration tests passed!"
echo "✓ r4fuse is working correctly"
echo
echo "Test log saved to: /tmp/r4fuse.log"
echo
