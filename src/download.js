import fs from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'
import { config } from './config.js'
import { createSdk } from '@radio4000/sdk'
import { createClient } from '@supabase/supabase-js'

const queue = []
let isProcessing = false

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
  if (queue.length === 0) {
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
    console.error(`✗ Failed to download ${channelSlug}:`, err.message)
  }

  // Process next in queue
  setTimeout(() => processQueue(), 1000)
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

  // Download each track
  let success = 0
  let failed = 0

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i]
    const prefix = String(i + 1).padStart(3, '0')

    console.log(`  [${i + 1}/${tracks.length}] ${track.title || 'Untitled'}`)

    try {
      await downloadTrack(track, channelDir, prefix)
      success++
    } catch (err) {
      console.error(`    ✗ Failed: ${err.message}`)
      failed++
    }
  }

  // Create local m3u playlist
  await createLocalPlaylist(channelSlug, channelDir, tracks)

  console.log(`  ✓ Downloaded: ${success} tracks`)
  if (failed > 0) {
    console.log(`  ✗ Failed: ${failed} tracks`)
  }
}

/**
 * Download a single track using yt-dlp
 */
async function downloadTrack(track, outputDir, prefix) {
  return new Promise((resolve, reject) => {
    const sanitizedTitle = sanitizeFilename(track.title || 'untitled')
    const output = path.join(outputDir, `${prefix}-${sanitizedTitle}.%(ext)s`)

    const args = [
      '--format', config.ytdlp.format,
      '--extract-audio',
      '--audio-format', config.ytdlp.audioFormat,
      '--audio-quality', config.ytdlp.audioQuality,
      '--output', output,
      '--no-playlist',
      '--quiet',
      '--progress',
    ]

    if (config.ytdlp.addMetadata) {
      args.push('--add-metadata')
      args.push('--embed-thumbnail')
    }

    args.push(track.url)

    const proc = spawn('yt-dlp', args)

    let stderr = ''

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        // Check if file already exists
        if (stderr.includes('has already been downloaded')) {
          resolve()
        } else {
          reject(new Error(`yt-dlp exited with code ${code}`))
        }
      }
    })

    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('yt-dlp not found. Please install it: https://github.com/yt-dlp/yt-dlp'))
      } else {
        reject(err)
      }
    })
  })
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
 * Check if yt-dlp is installed
 */
export async function checkYtdlp() {
  return new Promise((resolve) => {
    const proc = spawn('yt-dlp', ['--version'])
    proc.on('close', (code) => resolve(code === 0))
    proc.on('error', () => resolve(false))
  })
}
