import fs from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'
import { config } from './config.js'
import { loadSettings } from './config.js'
import { createSdk } from '@radio4000/sdk'
import { createClient } from '@supabase/supabase-js'
import NodeID3 from 'node-id3'

const queue = []
let isProcessing = false
let isShuttingDown = false
let currentDownloadProcess = null

// Initialize SDK
let sdk = null

function initSDK() {
  if (!sdk) {
    const supabase = createClient(config.supabase.url, config.supabase.key)
    sdk = createSdk(supabase)
  }
}

/**
 * Queue a channel for download
 */
export async function queueDownload(channelSlug) {
  if (!queue.includes(channelSlug)) {
    queue.push(channelSlug)
    console.log(`📥 Added to queue: ${channelSlug}`)
  }

  if (!isProcessing) {
    processQueue()
  }
}

/**
 * Process download queue
 */
async function processQueue() {
  if (isShuttingDown || queue.length === 0) {
    isProcessing = false
    return
  }

  isProcessing = true
  const channelSlug = queue.shift()

  console.log(`\n🎵 Starting download: ${channelSlug}`)

  try {
    await downloadChannel(channelSlug)
    console.log(`✓ Completed: ${channelSlug}`)
  } catch (err) {
    if (!isShuttingDown) {
      console.error(`✗ Failed to download ${channelSlug}:`, err.message)
    }
  }

  // Process next in queue
  if (!isShuttingDown) {
    setTimeout(() => processQueue(), 1000)
  }
}

/**
 * Download all tracks from a channel
 */
async function downloadChannel(channelSlug) {
  initSDK()

  // Fetch channel tracks
  const { data: tracks, error } = await sdk.channels.readChannelTracks(channelSlug)
  if (error) throw new Error(error.message)

  if (!tracks || tracks.length === 0) {
    console.log(`  No tracks found for ${channelSlug}`)
    return
  }

  console.log(`  Found ${tracks.length} tracks`)

  // Create channel directory
  const channelDir = path.join(config.downloadDir, channelSlug)
  await fs.mkdir(channelDir, { recursive: true })

  // Create tracks subdirectory (for organizing files)
  const tracksDir = path.join(channelDir, 'tracks')
  await fs.mkdir(tracksDir, { recursive: true })

  // Load or create status tracking
  const status = await loadStatus(channelDir)
  const debugLog = path.join(channelDir, 'debug.txt')

  // Log start of download session
  await appendDebugLog(debugLog, `\n=== Download session started: ${new Date().toISOString()} ===`)
  await appendDebugLog(debugLog, `Total tracks in channel: ${tracks.length}`)

  // Download each track
  let success = 0
  let failed = 0
  let skipped = 0

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i]
    const prefix = String(i + 1).padStart(3, '0')
    const trackId = track.id || `${i}-${sanitizeFilename(track.title || 'untitled')}`

    console.log(`  [${i + 1}/${tracks.length}] ${track.title || 'Untitled'}`)

    // Check if already downloaded successfully
    if (status.downloaded.includes(trackId)) {
      console.log(`    ⊙ Already downloaded, skipping`)
      await appendDebugLog(debugLog, `[${i + 1}] SKIP: ${track.title} (already downloaded)`)
      skipped++
      continue
    }

    try {
      const downloadedFile = await downloadTrack(track, tracksDir, prefix)
      if (downloadedFile) {
        // Write ID3 metadata to the downloaded file
        await writeTrackMetadata(downloadedFile, track, i + 1)

        // Set file timestamps to match track creation/update times from Radio4000
        await setFileTimestamps(downloadedFile, track)

        // Organize by tags immediately after download if enabled
        const settings = await loadSettings()
        if (settings.features && settings.features.organizeByTags) {
          await organizeTrackByTags(track, tracksDir, channelDir, prefix)
        }

        status.downloaded.push(trackId)
        await appendDebugLog(debugLog, `[${i + 1}] OK: ${track.title}`)
        success++
      } else {
        // File already exists (detected by downloader)
        // Set file timestamps to match track creation/update times from Radio4000 (for existing files)
        await setFileTimestamps(downloadedFile, track)

        // Organize by tags immediately after download if enabled (for existing files)
        const settings = await loadSettings()
        if (settings.features && settings.features.organizeByTags) {
          await organizeTrackByTags(track, tracksDir, channelDir, prefix)
        }

        status.downloaded.push(trackId)
        await appendDebugLog(debugLog, `[${i + 1}] EXISTS: ${track.title}`)
        skipped++
      }

      // Remove from failed list if it was there
      status.failed = status.failed.filter(id => id !== trackId)
    } catch (err) {
      console.error(`    ✗ Failed: ${err.message}`)
      status.failed.push(trackId)
      await appendDebugLog(debugLog, `[${i + 1}] ERROR: ${track.title} - ${err.message}`)
      failed++
    }

    // Save status after each track
    await saveStatus(channelDir, status)
  }

  // Create local m3u playlist
  await createLocalPlaylist(channelSlug, tracksDir, tracks)

  // Final summary
  await appendDebugLog(debugLog, `\nSession complete: ${success} downloaded, ${skipped} skipped, ${failed} failed`)
  console.log(`  ✓ Downloaded: ${success} tracks`)
  if (skipped > 0) {
    console.log(`  ⊙ Skipped: ${skipped} tracks (already downloaded)`)
  }
  if (failed > 0) {
    console.log(`  ✗ Failed: ${failed} tracks`)
  }
}

/**
 * Download a single track using yt-dlp or youtube-dl
 * Returns the path to the downloaded file if successful, or null if file already existed
 */
async function downloadTrack(track, outputDir, prefix) {
  // Load settings
  const settings = await loadSettings()

  return new Promise((resolve, reject) => {
    const sanitizedTitle = sanitizeFilename(track.title || 'untitled')
    const outputTemplate = path.join(outputDir, `${prefix}-${sanitizedTitle}.%(ext)s`)

    // Choose downloader (yt-dlp or youtube-dl)
    const downloader = settings.downloader || 'yt-dlp'

    const args = [
      '--format', settings.ytdlp.format,
      '--extract-audio',
      '--audio-format', settings.ytdlp.audioFormat,
      '--audio-quality', settings.ytdlp.audioQuality,
      '--output', outputTemplate,
      '--no-playlist',
      '--newline',  // Progress on separate lines
    ]

    // Add thumbnail embedding if enabled in settings
    if (settings.ytdlp.embedThumbnail) {
      args.push('--embed-thumbnail')
    }

    // Optionally write thumbnail as separate file if also wanted
    if (settings.ytdlp.writeThumbnail) {
      args.push('--write-thumbnail')
    }

    // Note: We don't add metadata with downloader as we'll add it ourselves with node-id3

    args.push(track.url)

    // Spawn the process - we'll track it and kill all children if needed
    // Spawn with stdio to properly track and kill process tree
    const proc = spawn(downloader, args, {
      stdio: ['ignore', 'pipe', 'pipe'] // stdin: ignore, stdout: pipe, stderr: pipe
    })

    // Track the current process for cleanup
    currentDownloadProcess = proc

    let stderr = ''
    let stdout = ''
    let downloadedFile = null

    proc.stdout.on('data', (data) => {
      stdout += data.toString()
      // Show progress
      const lines = data.toString().trim().split('\n')
      for (const line of lines) {
        if (line.includes('[download]') || line.includes('ETA')) {
          console.log(`    ${line}`)
        }
        // Capture the destination filename
        if (line.includes('[download] Destination:')) {
          const match = line.match(/\[download\] Destination: (.+)/)
          if (match) {
            downloadedFile = match[1].trim()
          }
        }
        // Also check for "has already been downloaded" which includes filename
        if (line.includes('has already been downloaded')) {
          const match = line.match(/\[download\] (.+) has already been downloaded/)
          if (match) {
            downloadedFile = match[1].trim()
          }
        }
      }
    })

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', async (code) => {
      // Clear current process tracker if this is the current process
      if (currentDownloadProcess && currentDownloadProcess === proc) {
        currentDownloadProcess = null
      }

      // If shutting down, resolve without error
      if (isShuttingDown) {
        resolve(null)
        return
      }

      if (code === 0) {
        // Try to find the downloaded file if we didn't capture it from output
        if (!downloadedFile) {
          const files = await fs.readdir(outputDir)
          const matchingFile = files.find(f => f.startsWith(`${prefix}-${sanitizedTitle}`))
          if (matchingFile) {
            downloadedFile = path.join(outputDir, matchingFile)
          }
        }
        resolve(downloadedFile) // Successfully downloaded
      } else {
        // Check if file already exists
        if (stderr.includes('has already been downloaded') || stdout.includes('has already been downloaded')) {
          resolve(null) // File exists, didn't download
        } else {
          // Include stderr in error message for debugging
          const errorMsg = stderr.trim() || stdout.trim() || `${downloader} exited with code ${code}`
          reject(new Error(errorMsg))
        }
      }
    })

    proc.on('error', (err) => {
      // Clear current process tracker on error
      if (currentDownloadProcess && currentDownloadProcess === proc) {
        currentDownloadProcess = null
      }

      if (err.code === 'ENOENT') {
        reject(new Error(`${downloader} not found. Please install it.`))
      } else {
        reject(err)
      }
    })
  })
}

/**
 * Write ID3 metadata to downloaded track
 */
async function writeTrackMetadata(filePath, track, trackNumber) {
  try {
    // Parse artist and title from track title
    // Common formats: "Artist - Title" or just "Title"
    let artist = ''
    let title = track.title || 'Untitled'

    if (title.includes(' - ')) {
      const parts = title.split(' - ')
      artist = parts[0].trim()
      title = parts.slice(1).join(' - ').trim()
    }

    const tags = {
      title: title,
      artist: artist || 'Unknown Artist',
      comment: {
        language: 'eng',
        text: track.description || ''
      },
      trackNumber: trackNumber.toString(),
      year: track.created_at ? new Date(track.created_at).getFullYear().toString() : '',
      WOAF: track.url, // Official audio file webpage
    }

    // Add Discogs URL if available
    if (track.discogs_url) {
      tags.userDefinedText = [{
        description: 'DISCOGS_URL',
        value: track.discogs_url
      }]
    }

    // Write tags
    const success = NodeID3.write(tags, filePath)
    if (!success) {
      console.log(`    Warning: Could not write ID3 tags to ${path.basename(filePath)}`)
    }
  } catch (err) {
    console.error(`    Warning: Error writing ID3 metadata: ${err.message}`)
  }
}

/**
 * Create a local m3u playlist referencing downloaded files
 */
async function createLocalPlaylist(channelSlug, channelDir, tracks) {
  const files = await fs.readdir(channelDir)
  const audioFiles = files.filter(f =>
    f.endsWith('.mp3') ||
    f.endsWith('.opus') ||
    f.endsWith('.m4a') ||
    f.endsWith('.webm')
  )

  let m3u = '#EXTM3U\n'
  for (const track of tracks) {
    const title = track.title || 'Untitled'
    m3u += `#EXTINF:-1,${title}\n`

    // Find the corresponding file
    const file = audioFiles.find(f => f.includes(sanitizeFilename(title)))
    if (file) {
      m3u += `${file}\n`
    }
  }

  const playlistPath = path.join(channelDir, 'playlist.m3u')
  await fs.writeFile(playlistPath, m3u)
}

/**
 * Set file timestamps to match track creation/update times from Radio4000
 */
async function setFileTimestamps(filePath, track) {
  if (!filePath || !track) return

  try {
    // Use track's created_at as ctime and mtime, updated_at as atime
    const createdTime = track.created_at ? new Date(track.created_at) : new Date()
    const updatedTime = track.updated_at ? new Date(track.updated_at) : new Date()

    // Set both access and modification times to match Radio4000 timestamps
    await fs.utimes(filePath, updatedTime, createdTime)
  } catch (err) {
    console.error(`    Warning: Could not set timestamps for ${path.basename(filePath)}: ${err.message}`)
  }
}

/**
 * Sanitize filename
 */
function sanitizeFilename(str) {
	// hello anyone? can you see what I type?
  return str
    .replace(/[^a-z0-9-_\s]/gi, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .substring(0, 50)
}

/**
 * Load status.json from channel directory
 */
async function loadStatus(channelDir) {
  const statusFile = path.join(channelDir, 'status.json')

  try {
    const data = await fs.readFile(statusFile, 'utf-8')
    return JSON.parse(data)
  } catch (err) {
    if (err.code === 'ENOENT') {
      // File doesn't exist, return default status
      return {
        downloaded: [],
        failed: [],
        lastUpdated: new Date().toISOString()
      }
    }
    throw err
  }
}

/**
 * Save status.json to channel directory
 */
async function saveStatus(channelDir, status) {
  const statusFile = path.join(channelDir, 'status.json')
  status.lastUpdated = new Date().toISOString()
  await fs.writeFile(statusFile, JSON.stringify(status, null, 2))
}

/**
 * Append a line to debug.txt
 */
async function appendDebugLog(debugFile, message) {
  const timestamp = new Date().toISOString()
  const line = `[${timestamp}] ${message}\n`
  await fs.appendFile(debugFile, line)
}

/**
 * Organize a single track by tags using symlinks
 */
async function organizeTrackByTags(track, tracksDir, channelDir, prefix) {
  const sanitizedTitle = sanitizeFilename(track.title || 'untitled')

  // Find the actual downloaded file
  const files = await fs.readdir(tracksDir)
  const trackFile = files.find(f => f.startsWith(`${prefix}-${sanitizedTitle}`))

  if (!trackFile) {
    console.log(`    Warning: Could not find downloaded file for ${track.title}`)
    return
  }

  // Parse tags from track description or title
  const tags = extractTags(track)

  if (tags.length === 0) {
    // If no tags, add to 'untagged' folder
    tags.push('untagged')
  }

  // Create tags directory
  const tagsDir = path.join(channelDir, 'tags')
  await fs.mkdir(tagsDir, { recursive: true })

  // Create symlinks for each tag
  for (const tag of tags) {
    const tagDir = path.join(tagsDir, sanitizeFilename(tag))
    await fs.mkdir(tagDir, { recursive: true })

    const sourcePath = path.join(tracksDir, trackFile)
    const linkPath = path.join(tagDir, trackFile)

    try {
      // Remove existing symlink if it exists
      try {
        await fs.unlink(linkPath)
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
      }

      // Create relative symlink
      const relativePath = path.relative(tagDir, sourcePath)
      await fs.symlink(relativePath, linkPath)
    } catch (err) {
      console.error(`    Warning: Could not create symlink for ${trackFile}: ${err.message}`)
    }
  }

  if (tags.length > 0) {
    console.log(`    ✓ Organized by tags: ${tags.join(', ')}`)
  }
}

/**
 * Organize all tracks by tags using symlinks (used for initial organization)
 */
async function organizeByTags(channelDir, tracksDir, tracks) {
  console.log('  📂 Organizing tracks by tags...')

  // Create tags directory
  const tagsDir = path.join(channelDir, 'tags')
  await fs.mkdir(tagsDir, { recursive: true })

  // Process each track
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i]
    const prefix = String(i + 1).padStart(3, '0')

    await organizeTrackByTags(track, tracksDir, channelDir, prefix)
  }

  // Count tag directories
  const tagDirs = await fs.readdir(path.join(channelDir, 'tags'))
  console.log(`  ✓ Organized into ${tagDirs.length} tag folders`)
}

/**
 * Extract tags from track metadata
 * Tags can come from description field (hashtags) or from structured metadata
 */
function extractTags(track) {
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
 * Sync channel directory using rsync
 */
export async function syncChannel(channelSlug, destination) {
  const settings = await loadSettings()

  if (!settings.features || !settings.features.rsyncEnabled) {
    console.log('  ⊘ rsync sync is disabled in settings')
    return
  }

  const channelDir = path.join(config.downloadDir, channelSlug)

  return new Promise((resolve, reject) => {
    console.log(`  🔄 Syncing ${channelSlug} to ${destination}...`)

    const args = [
      '-avz',           // archive, verbose, compress
      '--progress',     // show progress
      '--delete',       // delete files that don't exist in source
      `${channelDir}/`, // source (trailing slash is important)
      destination       // destination
    ]

    const proc = spawn('rsync', args)

    proc.stdout.on('data', (data) => {
      console.log(`    ${data.toString().trim()}`)
    })

    proc.stderr.on('data', (data) => {
      console.error(`    ${data.toString().trim()}`)
    })

    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`  ✓ Sync completed`)
        resolve()
      } else {
        reject(new Error(`rsync exited with code ${code}`))
      }
    })

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('rsync not found. Please install rsync.'))
      } else {
        reject(err)
      }
    })
  })
}

/**
 * Stop all downloads and cleanup
 */
export async function stopDownloads() {
  console.log('\n⏹  Stopping downloads...')

  // Set shutdown flag to stop queue processing
  isShuttingDown = true

  // Clear the queue
  const queuedCount = queue.length
  queue.length = 0

  if (queuedCount > 0) {
    console.log(`  Cleared ${queuedCount} queued download(s)`)
  }

  // Kill current download process if running
  if (currentDownloadProcess) {
    console.log('  Attempting to stop active download...')

    try {
      // Get the process ID before attempting to kill
      const pid = currentDownloadProcess.pid;

      console.log(`  Killing process tree for PID: ${pid}`)

      // On Unix-like systems, kill the entire process group by using negative PID
      if (process.platform !== 'win32') {
        try {
          // Kill the entire process group with SIGTERM first
          process.kill(-pid, 'SIGTERM');
          console.log(`  Sent SIGTERM to process group: ${-pid}`)
        } catch (groupKillErr) {
          // If process group kill fails, fall back to individual process kill
          console.log(`  Process group kill failed: ${groupKillErr.message}`)
          try {
            currentDownloadProcess.kill('SIGTERM');
          } catch (individualKillErr) {
            console.log(`  Individual process kill also failed: ${individualKillErr.message}`)
          }
        }
      } else {
        // On Windows, try to kill the individual process
        currentDownloadProcess.kill('SIGTERM');
      }

      // Wait a bit to allow graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 500))

      // If process still exists, send SIGKILL
      if (currentDownloadProcess && !currentDownloadProcess.killed) {
        if (process.platform !== 'win32') {
          try {
            // Kill the process group with SIGKILL
            process.kill(-pid, 'SIGKILL');
            console.log(`  Sent SIGKILL to process group: ${-pid}`)
          } catch (groupKillErr) {
            console.log(`  Process group SIGKILL failed: ${groupKillErr.message}`)
            try {
              currentDownloadProcess.kill('SIGKILL');
            } catch (individualKillErr) {
              console.log(`  Individual process SIGKILL also failed: ${individualKillErr.message}`)
            }
          }
        } else {
          // On Windows, send SIGKILL to individual process
          currentDownloadProcess.kill('SIGKILL');
        }
      }
    } catch (err) {
      console.log(`  Error stopping process: ${err.message}`)
    }

    // Always clear the reference
    currentDownloadProcess = null
  } else {
    console.log('  No active download process to stop')
  }

  // Wait a bit for processes to clean up
  await new Promise(resolve => setTimeout(resolve, 100))

  console.log('✓ Downloads stopped')
}

/**
 * Check if yt-dlp is installed
 */
export async function checkYtdlp() {
  return new Promise((resolve) => {
    const proc = spawn('yt-dlp', ['--version'])
    proc.on('close', (code) => resolve(code === 0))
    proc.on('error', () => resolve(false))
  })
}
