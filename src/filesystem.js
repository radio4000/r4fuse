import path from 'path'
import { createSdk } from '@radio4000/sdk'
import { createClient } from '@supabase/supabase-js'
import { config } from './config.js'
import { cachedCall } from './cache.js'
import { queueDownload, syncChannel } from './download.js'
import {
  loadSettings,
  loadFavorites,
  loadDownloads,
  addFavorite,
  removeFavorite,
  addDownload,
  removeDownload,
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

  // Load user config files
  await loadSettings()
  const favorites = await loadFavorites()
  const downloads = await loadDownloads()
  console.log(`✓ Loaded config (${favorites.length} favorites, ${downloads.length} downloads)`)
}

/**
 * Virtual filesystem structure
 */
const structure = {
  '/': { type: 'dir', mode: 0o755 },
  '/HELP.txt': { type: 'file', mode: 0o444, content: '' },
  '/channels': { type: 'dir', mode: 0o755 },
  '/favorites': { type: 'dir', mode: 0o755 },
  '/downloads': { type: 'dir', mode: 0o755 },
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
    file2: parts[4], // For deeper nesting like /channels/slug/tags/tagname/file.txt
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

  // /channels/<slug>/tags
  if (parsed.root === 'channels' && parsed.channel && parsed.subdir === 'tags' && !parsed.file) {
    return stat({ mode: 0o755, size: 0, isDir: true })
  }

  // /channels/<slug>/tags/<tagname>
  if (parsed.root === 'channels' && parsed.channel && parsed.subdir === 'tags' && parsed.file && !parsed.file2) {
    return stat({ mode: 0o755, size: 0, isDir: true })
  }

  // Files in channel root
  if (parsed.root === 'channels' && parsed.channel && parsed.subdir && !parsed.file) {
    const validFiles = ['ABOUT.txt', 'image.url', 'tracks.m3u']
    if (validFiles.includes(parsed.subdir)) {
      const content = await getFileContent(path)
      return stat({
        mode: 0o444,
        size: Buffer.byteLength(content),
        isDir: false,
      })
    }
  }

  // Track files: /channels/<slug>/tracks/<file>
  if (parsed.root === 'channels' && parsed.channel && parsed.subdir === 'tracks' && parsed.file && !parsed.file2) {
    if (parsed.file === 'tracks.json') {
      const content = await getFileContent(path)
      return stat({
        mode: 0o444,
        size: Buffer.byteLength(content),
        isDir: false,
      })
    }
    if (parsed.file.endsWith('.txt')) {
      // Find the track by matching the sanitized filename
      const tracks = await cachedCall(`tracks:${parsed.channel}`, async () => {
        const { data, error } = await sdk.channels.readChannelTracks(parsed.channel)
        if (error) throw new Error(error.message)
        return data
      })

      const orderedTracks = [...tracks].reverse()
      const filename = parsed.file.replace(/\.txt$/, '')
      const track = orderedTracks.find(t => sanitizeFilename(t.title || 'untitled') === filename)

      if (track) {
        const content = await getFileContent(path)
        return stat({
          mode: 0o444,
          size: Buffer.byteLength(content),
          isDir: false,
          mtime: track.updated_at ? new Date(track.updated_at) : undefined,
          ctime: track.created_at ? new Date(track.created_at) : undefined,
          atime: track.updated_at ? new Date(track.updated_at) : undefined,
        })
      }
    }
  }

  // Track files in tags: /channels/<slug>/tags/<tagname>/<file>
  if (parsed.root === 'channels' && parsed.channel && parsed.subdir === 'tags' && parsed.file && parsed.file2) {
    if (parsed.file2.endsWith('.txt')) {
      // Find the track by matching the sanitized filename
      const tracks = await cachedCall(`tracks:${parsed.channel}`, async () => {
        const { data, error } = await sdk.channels.readChannelTracks(parsed.channel)
        if (error) throw new Error(error.message)
        return data
      })

      const orderedTracks = [...tracks].reverse()
      const filename = parsed.file2.replace(/\.txt$/, '')
      const track = orderedTracks.find(t => sanitizeFilename(t.title || 'untitled') === filename)

      if (track) {
        // Verify this track has the tag
        const tags = extractTagsFromTrack(track)
        const trackTags = tags.length > 0 ? tags : ['untagged']
        if (trackTags.includes(parsed.file)) {
          const content = await getFileContent(path)
          return stat({
            mode: 0o444,
            size: Buffer.byteLength(content),
            isDir: false,
            mtime: track.updated_at ? new Date(track.updated_at) : undefined,
            ctime: track.created_at ? new Date(track.created_at) : undefined,
            atime: track.updated_at ? new Date(track.updated_at) : undefined,
          })
        }
      }
    }
  }

  // /favorites/<slug> - symlinks to channels
  if (parsed.root === 'favorites' && parsed.channel && !parsed.subdir) {
    return stat({ mode: 0o755, size: 0, isDir: true })
  }

  // /downloads/<slug> - symlinks to channels
  if (parsed.root === 'downloads' && parsed.channel && !parsed.subdir) {
    return stat({ mode: 0o755, size: 0, isDir: true })
  }

  // Files in favorites/<slug>/ or downloads/<slug>/
  if ((parsed.root === 'favorites' || parsed.root === 'downloads') && parsed.channel && parsed.subdir) {
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
    return ['.', '..', 'HELP.txt', 'channels', 'favorites', 'downloads']
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
    return ['.', '..', 'ABOUT.txt', 'image.url', 'tracks.m3u', 'tracks', 'tags']
  }

  // /channels/<slug>/tracks - list track files
  if (parsed.root === 'channels' && parsed.channel && parsed.subdir === 'tracks' && !parsed.file) {
    const tracks = await cachedCall(`tracks:${parsed.channel}`, async () => {
      const { data, error } = await sdk.channels.readChannelTracks(parsed.channel)
      if (error) throw new Error(error.message)
      return data
    })
    // Reverse tracks so oldest (first added) is #1
    const orderedTracks = [...tracks].reverse()
    const files = ['tracks.json']
    for (let i = 0; i < orderedTracks.length; i++) {
      const name = sanitizeFilename(orderedTracks[i].title || 'untitled')
      // No numeric prefix - users can sort by timestamp
      files.push(`${name}.txt`)
    }
    return ['.', '..', ...files]
  }

  // /channels/<slug>/tags - list tag directories
  if (parsed.root === 'channels' && parsed.channel && parsed.subdir === 'tags' && !parsed.file) {
    const tracks = await cachedCall(`tracks:${parsed.channel}`, async () => {
      const { data, error } = await sdk.channels.readChannelTracks(parsed.channel)
      if (error) throw new Error(error.message)
      return data
    })

    // Collect all unique tags
    const tagSet = new Set()
    for (const track of tracks) {
      const tags = extractTagsFromTrack(track)
      if (tags.length === 0) {
        tagSet.add('untagged')
      } else {
        tags.forEach(tag => tagSet.add(tag))
      }
    }

    return ['.', '..', ...Array.from(tagSet).sort()]
  }

  // /channels/<slug>/tags/<tag> - list tracks with this tag
  if (parsed.root === 'channels' && parsed.channel && parsed.subdir === 'tags' && parsed.file && !path.split('/')[5]) {
    const tagName = parsed.file
    const tracks = await cachedCall(`tracks:${parsed.channel}`, async () => {
      const { data, error } = await sdk.channels.readChannelTracks(parsed.channel)
      if (error) throw new Error(error.message)
      return data
    })

    // Reverse tracks so oldest (first added) is #1
    const orderedTracks = [...tracks].reverse()
    const files = []

    for (let i = 0; i < orderedTracks.length; i++) {
      const track = orderedTracks[i]
      const tags = extractTagsFromTrack(track)
      const trackTags = tags.length > 0 ? tags : ['untagged']

      if (trackTags.includes(tagName)) {
        const name = sanitizeFilename(track.title || 'untitled')
        // No numeric prefix - users can sort by timestamp
        files.push(`${name}.txt`)
      }
    }

    return ['.', '..', ...files]
  }

  // /favorites - list favorite channels
  if (path === '/favorites') {
    const favorites = await loadFavorites()
    return ['.', '..', ...favorites]
  }

  // /downloads - list channels marked for download
  if (path === '/downloads') {
    const downloads = await loadDownloads()
    return ['.', '..', ...downloads]
  }

  // Files in favorites/<slug>/ or downloads/<slug>/
  if ((parsed.root === 'favorites' || parsed.root === 'downloads') && parsed.channel) {
    // Redirect to channels path
    const channelsPath = `/channels/${parsed.channel}${parsed.subdir ? '/' + parsed.subdir : ''}`
    return readdir(channelsPath)
  }

  // /.ctrl directory
  if (path === '/.ctrl') {
    return ['.', '..', 'HELP.txt', 'download', 'cache', 'favorite', 'unfavorite', 'add-download', 'remove-download', 'sync']
  }

  throw new Error('ENOENT')
}

/**
 * Read file contents
 */
export async function read(path, fd, buffer, length, position) {
  const parsed = parsePath(path)

  // Redirect favorites/<slug>/* and downloads/<slug>/* to channels/<slug>/*
  if ((parsed.root === 'favorites' || parsed.root === 'downloads') && parsed.channel) {
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

  // Add to downloads
  if (path === '/.ctrl/add-download') {
    const content = buffer.toString('utf-8', 0, length).trim()
    if (content) {
      await addDownload(content)
    }
    return length
  }

  // Remove from downloads
  if (path === '/.ctrl/remove-download') {
    const content = buffer.toString('utf-8', 0, length).trim()
    if (content) {
      await removeDownload(content)
    }
    return length
  }

  // Rsync sync
  if (path === '/.ctrl/sync') {
    const content = buffer.toString('utf-8', 0, length).trim()
    if (content) {
      // Expected format: "channelSlug destination"
      const [channelSlug, destination] = content.split(' ', 2)
      if (channelSlug && destination) {
        syncChannel(channelSlug, destination).catch(err => {
          console.error(`Sync error: ${err.message}`)
        })
        console.log(`✓ Started sync: ${channelSlug} -> ${destination}`)
      }
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

Quick Start:
  ls channels/                     # Browse all channels
  cat channels/oskar/ABOUT.txt     # Read about a channel
  ls channels/oskar/tracks/        # View track metadata files
  ls -lt channels/oskar/tracks/    # Sort by timestamp (oldest first)
  ls channels/oskar/tags/          # View tracks organized by tags

  # Files use track creation/update timestamps - sort by date naturally!

  # View favorites and downloads
  ls favorites/                    # View favorite channels
  ls downloads/                    # View channels marked for download

Configuration:
  All settings are stored in: ~/.config/r4fuse/

  settings.json   # All settings (see below)
  favorites.txt   # Favorite channels (one per line)
  downloads.txt   # Channels to auto-download (one per line)

Settings.json options:
  downloader: "yt-dlp" or "youtube-dl"
  features.organizeByTags: true/false (organize downloads by tags)
  features.rsyncEnabled: true/false (enable rsync sync)
  paths.mountPoint: custom mount point path
  paths.downloadDir: custom download directory path

Tag Organization:
  Both mounted and downloaded channels organize tracks as:
    tracks/              # All track files
    tags/<tagname>/      # Tracks grouped by tag (symlinks)

  Tags are extracted from hashtags in track descriptions.

See README.md in the project directory for complete documentation.
`
  }

  // Control HELP.txt (kept for backward compatibility but not documented)
  if (path === '/.ctrl/HELP.txt') {
    return `r4fuse Control Files
=====================

This directory is maintained for backward compatibility.
Please use the configuration files instead:
  ~/.config/r4fuse/settings.json
  ~/.config/r4fuse/favorites.txt
  ~/.config/r4fuse/downloads.txt

See /HELP.txt in the root for more information.
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

  // image.url - Cloudinary CDN URL
  if (parsed.root === 'channels' && parsed.channel && parsed.subdir === 'image.url') {
    const channel = await cachedCall(`channel:${parsed.channel}`, async () => {
      const { data, error } = await sdk.channels.readChannel(parsed.channel)
      if (error) throw new Error(error.message)
      return data
    })
    if (channel.image) {
      // Check if it's already a full URL (Cloudinary)
      if (channel.image.startsWith('http')) {
        return `${channel.image}\n`
      }
      // Otherwise construct Supabase storage URL
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

    // Match track by sanitized filename (no numeric prefix)
    if (parsed.file.endsWith('.txt')) {
      const filename = parsed.file.replace(/\.txt$/, '')
      const track = orderedTracks.find(t => sanitizeFilename(t.title || 'untitled') === filename)
      if (track) {
        return formatTrackContent(track)
      }
    }
  }

  // Track files in tags: /channels/<slug>/tags/<tagname>/<file>
  if (parsed.root === 'channels' && parsed.channel && parsed.subdir === 'tags' && parsed.file && parsed.file2) {
    const tracks = await cachedCall(`tracks:${parsed.channel}`, async () => {
      const { data, error} = await sdk.channels.readChannelTracks(parsed.channel)
      if (error) throw new Error(error.message)
      return data
    })

    // Reverse tracks so oldest (first added) is #1
    const orderedTracks = [...tracks].reverse()

    // Match track by sanitized filename (no numeric prefix)
    if (parsed.file2.endsWith('.txt')) {
      const filename = parsed.file2.replace(/\.txt$/, '')
      const track = orderedTracks.find(t => sanitizeFilename(t.title || 'untitled') === filename)
      if (track) {
        // Verify this track has the tag
        const tags = extractTagsFromTrack(track)
        const trackTags = tags.length > 0 ? tags : ['untagged']
        if (trackTags.includes(parsed.file)) {
          return formatTrackContent(track)
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
 * Extract tags from track metadata
 * Tags can come from description field (hashtags) or from structured metadata
 */
function extractTagsFromTrack(track) {
  const tags = []

  // Check description for hashtags
  if (track.description) {
    const hashtags = track.description.match(/#[\w]+/g)
    if (hashtags) {
      tags.push(...hashtags.map(tag => tag.substring(1).toLowerCase()))
    }
  }

  // Check if track has a tags field (if supported by API)
  if (track.tags && Array.isArray(track.tags)) {
    tags.push(...track.tags.map(tag => tag.toLowerCase()))
  }

  // Remove duplicates
  return [...new Set(tags)]
}

/**
 * Format track content for .txt files
 */
function formatTrackContent(track) {
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

  // Show tags if any
  const tags = extractTagsFromTrack(track)
  if (tags.length > 0) {
    lines.push(`\nTags: ${tags.map(t => '#' + t).join(' ')}`)
  }

  return lines.join('\n') + '\n'
}

/**
 * Open file
 */
export async function open(path, flags) {
  // Return a fake file descriptor for all files
  return 0
}

/**
 * Release file
 */
export async function release(path, fd) {
  return 0
}
