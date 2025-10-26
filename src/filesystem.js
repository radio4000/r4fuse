import path from 'path'
import { createSdk } from '@radio4000/sdk'
import { createClient } from '@supabase/supabase-js'
import { config } from './config.js'
import { cachedCall } from './cache.js'
import { queueDownload } from './download.js'
import {
  loadPreferences,
  getPreferences,
  addFavorite,
  removeFavorite,
  addAutoSync,
  removeAutoSync,
} from './preferences.js'

// File type constants (from stat.h)
const S_IFDIR = 0o040000 // directory
const S_IFREG = 0o100000 // regular file

/**
 * Helper to create proper stat objects for FUSE
 */
function stat(options) {
  const now = Date.now() / 1000
  let mode = options.mode || 0

  // Add file type bits if not present
  if ((mode & S_IFDIR) === 0 && (mode & S_IFREG) === 0) {
    // If it's a directory mode (0o755, 0o777, etc.) add directory bit
    // If it's a file mode, add regular file bit
    if (options.isDir || (mode & 0o111) === 0o111) {
      mode |= S_IFDIR
    } else {
      mode |= S_IFREG
    }
  }

  return {
    mtime: options.mtime ? options.mtime.getTime() / 1000 : now,
    atime: options.atime ? options.atime.getTime() / 1000 : now,
    ctime: options.ctime ? options.ctime.getTime() / 1000 : now,
    nlink: 1,
    size: options.size || 0,
    mode,
    uid: options.uid || process.getuid(),
    gid: options.gid || process.getgid(),
  }
}

// Initialize SDK
let sdk = null

export async function initSDK() {
  if (!config.supabase.url || !config.supabase.key) {
    throw new Error('Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_KEY environment variables.')
  }

  const supabase = createClient(config.supabase.url, config.supabase.key)
  sdk = createSdk(supabase)
  console.log('✓ Connected to Radio4000 API')

  // Load user preferences
  await loadPreferences()
  const prefs = getPreferences()
  console.log(`✓ Loaded preferences (${prefs.favorites.length} favorites, ${prefs.autoSync.length} auto-sync)`)
}

/**
 * Virtual filesystem structure
 */
const structure = {
  '/': { type: 'dir', mode: 0o755 },
  '/HELP.txt': { type: 'file', mode: 0o444, content: '' },
  '/channels': { type: 'dir', mode: 0o755 },
  '/favorites': { type: 'dir', mode: 0o755 },
  '/auto-sync': { type: 'dir', mode: 0o755 },
  '/.ctrl': { type: 'dir', mode: 0o755 },
  '/.ctrl/HELP.txt': { type: 'file', mode: 0o444, content: '' },
  '/.ctrl/download': { type: 'file', mode: 0o666, content: '' },
  '/.ctrl/cache': { type: 'file', mode: 0o666, content: '' },
  '/.ctrl/favorite': { type: 'file', mode: 0o666, content: '' },
  '/.ctrl/unfavorite': { type: 'file', mode: 0o666, content: '' },
  '/.ctrl/autosync': { type: 'file', mode: 0o666, content: '' },
  '/.ctrl/no-autosync': { type: 'file', mode: 0o666, content: '' },
}

/**
 * Parse path into components
 */
function parsePath(path) {
  const parts = path.split('/').filter(Boolean)
  return {
    parts,
    root: parts[0],
    channel: parts[1],
    subdir: parts[2],
    file: parts[3],
  }
}

/**
 * Get filesystem stats for a path
 */
export async function getattr(path) {
  const parsed = parsePath(path)

  // Root entries
  if (structure[path]) {
    const entry = structure[path]
    if (entry.type === 'dir') {
      return stat({
        mode: entry.mode,
        size: 0,
        isDir: true,
      })
    }
    if (entry.type === 'file') {
      // For HELP.txt files, get the actual content to calculate proper size
      const content = (path === '/HELP.txt' || path === '/.ctrl/HELP.txt')
        ? await getFileContent(path)
        : entry.content || ''
      return stat({
        mode: entry.mode,
        size: Buffer.byteLength(content),
        isDir: false,
      })
    }
  }

  // /channels/<slug>
  if (parsed.root === 'channels' && parsed.channel && !parsed.subdir) {
    return stat({ mode: 0o755, size: 0, isDir: true })
  }

  // /channels/<slug>/tracks
  if (parsed.root === 'channels' && parsed.channel && parsed.subdir === 'tracks' && !parsed.file) {
    return stat({ mode: 0o755, size: 0, isDir: true })
  }

  // /channels/<slug>/.ctrl
  if (parsed.root === 'channels' && parsed.channel && parsed.subdir === '.ctrl' && !parsed.file) {
    return stat({ mode: 0o755, size: 0, isDir: true })
  }

  // Files in channel root
  if (parsed.root === 'channels' && parsed.channel && parsed.subdir && !parsed.file) {
    const validFiles = ['ABOUT.txt', 'info.txt', 'image.url', 'tracks.m3u', '.ctrl']
    if (validFiles.includes(parsed.subdir)) {
      const content = await getFileContent(path)
      return stat({
        mode: parsed.subdir === '.ctrl' ? 0o755 : 0o444,
        size: Buffer.byteLength(content),
        isDir: false,
      })
    }
  }

  // Track files: /channels/<slug>/tracks/<file>
  if (parsed.root === 'channels' && parsed.channel && parsed.subdir === 'tracks' && parsed.file) {
    if (parsed.file.endsWith('.txt') || parsed.file === 'tracks.json') {
      const content = await getFileContent(path)
      return stat({
        mode: 0o444,
        size: Buffer.byteLength(content),
        isDir: false,
      })
    }
  }

  // Control file in channel .ctrl directory
  if (parsed.root === 'channels' && parsed.channel && parsed.subdir === '.ctrl' && parsed.file === 'download') {
    return stat({ mode: 0o666, size: 0, isDir: false })
  }

  // /favorites/<slug> - symlinks to channels
  if (parsed.root === 'favorites' && parsed.channel && !parsed.subdir) {
    return stat({ mode: 0o755, size: 0, isDir: true })
  }

  // /auto-sync/<slug> - symlinks to channels
  if (parsed.root === 'auto-sync' && parsed.channel && !parsed.subdir) {
    return stat({ mode: 0o755, size: 0, isDir: true })
  }

  // Files in favorites/<slug>/ or auto-sync/<slug>/
  if ((parsed.root === 'favorites' || parsed.root === 'auto-sync') && parsed.channel && parsed.subdir) {
    // Redirect to channels path
    const channelsPath = `/channels/${parsed.channel}/${parsed.subdir}${parsed.file ? '/' + parsed.file : ''}`
    return getattr(channelsPath)
  }

  throw new Error('ENOENT')
}

/**
 * Read directory contents
 */
export async function readdir(path) {
  const parsed = parsePath(path)

  // Root directory
  if (path === '/') {
    return ['.', '..', 'HELP.txt', 'channels', 'favorites', 'auto-sync', '.ctrl']
  }

  // /channels - list all channels
  if (path === '/channels') {
    const channels = await cachedCall('channels', async () => {
      const { data, error } = await sdk.channels.readChannels(500)
      if (error) throw new Error(error.message)
      return data
    })
    return ['.', '..', ...channels.map(c => c.slug)]
  }

  // /channels/<slug> - show channel contents
  if (parsed.root === 'channels' && parsed.channel && !parsed.subdir) {
    return ['.', '..', 'ABOUT.txt', 'info.txt', 'image.url', 'tracks.m3u', 'tracks', '.ctrl']
  }

  // /channels/<slug>/tracks - list track files
  if (parsed.root === 'channels' && parsed.channel && parsed.subdir === 'tracks') {
    const tracks = await cachedCall(`tracks:${parsed.channel}`, async () => {
      const { data, error } = await sdk.channels.readChannelTracks(parsed.channel)
      if (error) throw new Error(error.message)
      return data
    })
    // Reverse tracks so oldest (first added) is #1
    const orderedTracks = [...tracks].reverse()
    const files = ['tracks.json']
    for (let i = 0; i < orderedTracks.length; i++) {
      const prefix = String(i + 1).padStart(3, '0')
      const name = sanitizeFilename(orderedTracks[i].title || 'untitled')
      files.push(`${prefix}-${name}.txt`)
    }
    return ['.', '..', ...files]
  }

  // /channels/<slug>/.ctrl - control directory
  if (parsed.root === 'channels' && parsed.channel && parsed.subdir === '.ctrl') {
    return ['.', '..', 'download']
  }

  // /favorites - list favorite channels
  if (path === '/favorites') {
    const prefs = getPreferences()
    return ['.', '..', ...prefs.favorites]
  }

  // /auto-sync - list auto-sync channels
  if (path === '/auto-sync') {
    const prefs = getPreferences()
    return ['.', '..', ...prefs.autoSync]
  }

  // Files in favorites/<slug>/ or auto-sync/<slug>/
  if ((parsed.root === 'favorites' || parsed.root === 'auto-sync') && parsed.channel) {
    // Redirect to channels path
    const channelsPath = `/channels/${parsed.channel}${parsed.subdir ? '/' + parsed.subdir : ''}`
    return readdir(channelsPath)
  }

  // /.ctrl directory
  if (path === '/.ctrl') {
    return ['.', '..', 'HELP.txt', 'download', 'cache', 'favorite', 'unfavorite', 'autosync', 'no-autosync']
  }

  throw new Error('ENOENT')
}

/**
 * Read file contents
 */
export async function read(path, fd, buffer, length, position) {
  const parsed = parsePath(path)

  // Redirect favorites/<slug>/* and auto-sync/<slug>/* to channels/<slug>/*
  if ((parsed.root === 'favorites' || parsed.root === 'auto-sync') && parsed.channel) {
    const channelsPath = `/channels/${parsed.channel}${parsed.subdir ? '/' + parsed.subdir : ''}${parsed.file ? '/' + parsed.file : ''}`
    return read(channelsPath, fd, buffer, length, position)
  }

  const content = await getFileContent(path)
  const data = Buffer.from(content)

  // Read from position
  const chunk = data.slice(position, position + length)
  chunk.copy(buffer)

  return chunk.length
}

/**
 * Write to control files
 */
export async function write(path, fd, buffer, length, position) {
  const parsed = parsePath(path)

  // Global download control
  if (path === '/.ctrl/download') {
    const content = buffer.toString('utf-8', 0, length).trim()
    if (content) {
      await queueDownload(content)
      console.log(`✓ Queued download: ${content}`)
    }
    return length
  }

  // Channel-specific download control
  if (parsed.root === 'channels' && parsed.channel && parsed.subdir === '.ctrl' && parsed.file === 'download') {
    const content = buffer.toString('utf-8', 0, length).trim()
    if (content === 'start' || content === '1') {
      await queueDownload(parsed.channel)
      console.log(`✓ Queued download: ${parsed.channel}`)
    }
    return length
  }

  // Cache clear control
  if (path === '/.ctrl/cache') {
    const content = buffer.toString('utf-8', 0, length).trim()
    if (content === 'clear') {
      const { cache } = await import('./cache.js')
      cache.clear()
      console.log('✓ Cache cleared')
    }
    return length
  }

  // Add to favorites
  if (path === '/.ctrl/favorite') {
    const content = buffer.toString('utf-8', 0, length).trim()
    if (content) {
      await addFavorite(content)
    }
    return length
  }

  // Remove from favorites
  if (path === '/.ctrl/unfavorite') {
    const content = buffer.toString('utf-8', 0, length).trim()
    if (content) {
      await removeFavorite(content)
    }
    return length
  }

  // Add to auto-sync
  if (path === '/.ctrl/autosync') {
    const content = buffer.toString('utf-8', 0, length).trim()
    if (content) {
      await addAutoSync(content)
    }
    return length
  }

  // Remove from auto-sync
  if (path === '/.ctrl/no-autosync') {
    const content = buffer.toString('utf-8', 0, length).trim()
    if (content) {
      await removeAutoSync(content)
    }
    return length
  }

  throw new Error('EROFS')
}

/**
 * Get file content for various file types
 */
async function getFileContent(path) {
  const parsed = parsePath(path)

  // Root HELP.txt
  if (path === '/HELP.txt') {
    return `r4fuse - Radio4000 FUSE Filesystem
=====================================

This is a READ-ONLY filesystem showing Radio4000 channels and tracks.

Quick Start:
  ls channels/                  # Browse all channels
  cat channels/oskar/ABOUT.txt  # Read about a channel
  ls favorites/                 # Your favorite channels
  cat .ctrl/HELP.txt            # Control file help

The filesystem is read-only to keep organization simple.
Use control files in .ctrl/ to perform actions like downloading.

See PREFERENCES.md and HOW_IT_WORKS.md in the project directory
for complete documentation.
`
  }

  // Control HELP.txt
  if (path === '/.ctrl/HELP.txt') {
    return `Control Files - How to Use
============================

Control files let you perform actions by writing to them.
The filesystem itself is READ-ONLY for safety and organization.

Usage: echo "value" > control-file

Available Commands:
  echo "oskar" > download      # Download channel to ~/Music/radio4000/
  echo "oskar" > favorite       # Add to favorites
  echo "oskar" > unfavorite     # Remove from favorites
  echo "oskar" > autosync       # Mark for auto-sync
  echo "oskar" > no-autosync    # Remove from auto-sync
  echo "clear" > cache          # Clear API cache

Examples:
  # Download a channel
  echo "ko002" > .ctrl/download

  # Add to favorites
  echo "oskar" > .ctrl/favorite

  # Then access via favorites/
  ls ../favorites/oskar/

Preferences are saved to: ~/.config/r4fuse/preferences.json
`
  }

  // Channel ABOUT.txt
  if (parsed.root === 'channels' && parsed.channel && parsed.subdir === 'ABOUT.txt') {
    const channel = await cachedCall(`channel:${parsed.channel}`, async () => {
      const { data, error } = await sdk.channels.readChannel(parsed.channel)
      if (error) throw new Error(error.message)
      return data
    })

    const tracks = await cachedCall(`tracks:${parsed.channel}`, async () => {
      const { data, error } = await sdk.channels.readChannelTracks(parsed.channel)
      if (error) throw new Error(error.message)
      return data
    })

    return `${channel.name || 'Untitled Channel'}
${'='.repeat((channel.name || 'Untitled Channel').length)}

${channel.description || 'No description available.'}

Stats:
  Tracks: ${tracks.length}
  Created: ${channel.created_at ? new Date(channel.created_at).toLocaleDateString() : 'Unknown'}
  ${channel.url ? `Website: ${channel.url}` : ''}

Quick Access:
  info.txt      # Machine-readable metadata
  tracks.m3u    # Playlist for streaming
  tracks/       # Individual track files

Actions:
  echo "${parsed.channel}" > ../.ctrl/favorite   # Add to favorites
  echo "${parsed.channel}" > ../.ctrl/download   # Download tracks
`
  }

  // info.txt - channel metadata
  if (parsed.root === 'channels' && parsed.channel && parsed.subdir === 'info.txt') {
    const channel = await cachedCall(`channel:${parsed.channel}`, async () => {
      const { data, error } = await sdk.channels.readChannel(parsed.channel)
      if (error) throw new Error(error.message)
      return data
    })

    return `Name: ${channel.name || 'Untitled'}
Slug: ${channel.slug}
Created: ${channel.created_at}
Description: ${channel.description || 'No description'}
URL: ${channel.url || 'N/A'}
`
  }

  // image.url - full CDN URL
  if (parsed.root === 'channels' && parsed.channel && parsed.subdir === 'image.url') {
    const channel = await cachedCall(`channel:${parsed.channel}`, async () => {
      const { data, error } = await sdk.channels.readChannel(parsed.channel)
      if (error) throw new Error(error.message)
      return data
    })
    if (channel.image) {
      // Construct full Supabase storage URL
      const storageUrl = config.supabase.url.replace(/\/$/, '')
      return `${storageUrl}/storage/v1/object/public/channels/${channel.image}\n`
    }
    return ''
  }

  // tracks.m3u - playlist
  if (parsed.root === 'channels' && parsed.channel && parsed.subdir === 'tracks.m3u') {
    const tracks = await cachedCall(`tracks:${parsed.channel}`, async () => {
      const { data, error } = await sdk.channels.readChannelTracks(parsed.channel)
      if (error) throw new Error(error.message)
      return data
    })

    let m3u = '#EXTM3U\n'
    for (const track of tracks) {
      m3u += `#EXTINF:-1,${track.title || 'Untitled'}\n`
      m3u += `${track.url}\n`
    }
    return m3u
  }

  // Track files: .txt and tracks.json
  if (parsed.root === 'channels' && parsed.channel && parsed.subdir === 'tracks' && parsed.file) {
    const tracks = await cachedCall(`tracks:${parsed.channel}`, async () => {
      const { data, error} = await sdk.channels.readChannelTracks(parsed.channel)
      if (error) throw new Error(error.message)
      return data
    })

    // Reverse tracks so oldest (first added) is #1
    const orderedTracks = [...tracks].reverse()

    // tracks.json - all tracks metadata in correct order
    if (parsed.file === 'tracks.json') {
      return JSON.stringify(orderedTracks, null, 2)
    }

    // Extract track number from filename (e.g., "001-song.txt" -> 0)
    const match = parsed.file.match(/^(\d+)/)
    if (match) {
      const index = parseInt(match[1], 10) - 1
      const track = orderedTracks[index]
      if (track) {
        // .txt file - rich metadata
        if (parsed.file.endsWith('.txt')) {
          const lines = [
            `Title: ${track.title || 'Untitled'}`,
            `URL: ${track.url}`,
          ]

          if (track.description) {
            lines.push(`\nDescription:\n${track.description}`)
          }

          if (track.discogs_url) {
            lines.push(`\nDiscogs: ${track.discogs_url}`)
          }

          if (track.created_at) {
            lines.push(`\nAdded: ${new Date(track.created_at).toLocaleString()}`)
          }

          if (track.updated_at) {
            lines.push(`Updated: ${new Date(track.updated_at).toLocaleString()}`)
          }

          return lines.join('\n') + '\n'
        }
      }
    }
  }

  return ''
}

/**
 * Sanitize filename
 */
function sanitizeFilename(str) {
  return str
    .replace(/[^a-z0-9-_\s]/gi, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .substring(0, 50)
}

/**
 * Open file (no-op, but required)
 */
export async function open(path, flags) {
  // Return a fake file descriptor
  return 0
}

/**
 * Release file (no-op)
 */
export async function release(path, fd) {
  return 0
}
