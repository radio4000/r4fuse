import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import { config as loadEnv } from 'dotenv'

// Load .env file
loadEnv()

const HOME = os.homedir()

export const config = {
  // Mount point for FUSE filesystem
  mountPoint: process.env.R4_MOUNT_POINT || path.join(HOME, 'mnt/radio4000'),

  // Where to download actual audio files
  downloadDir: process.env.R4_DOWNLOAD_DIR || path.join(HOME, 'Music/radio4000'),

  // Cache directory
  cacheDir: process.env.R4_CACHE_DIR || path.join(HOME, '.cache/r4fuse'),

  // State directory (logs, download queue, etc.)
  stateDir: process.env.R4_STATE_DIR || path.join(HOME, '.local/state/r4fuse'),

  // Config file
  configFile: process.env.R4_CONFIG_FILE || path.join(HOME, '.config/r4fuse/config.json'),

  // Cache TTL (5 minutes)
  cacheTTL: 5 * 60 * 1000,

  // Supabase credentials
  supabase: {
    url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    key: process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_KEY,
  },

  // yt-dlp options
  ytdlp: {
    format: 'bestaudio/best',  // Get best audio, fallback to best overall
    extractAudio: true,
    audioFormat: 'mp3',
    audioQuality: '0',  // 0 = best quality (VBR ~245 kbps for mp3)
    addMetadata: true,
  }
}

/**
 * Ensure all directories exist
 */
export async function ensureDirectories() {
  const dirs = [
    config.mountPoint,
    config.downloadDir,
    config.cacheDir,
    config.stateDir,
    path.dirname(config.configFile),
  ]

  for (const dir of dirs) {
    await fs.mkdir(dir, { recursive: true })
  }
}

/**
 * Load user config if it exists
 */
export async function loadUserConfig() {
  try {
    const data = await fs.readFile(config.configFile, 'utf-8')
    const userConfig = JSON.parse(data)
    Object.assign(config, userConfig)
  } catch (err) {
    // Config file doesn't exist, use defaults
    if (err.code !== 'ENOENT') {
      console.warn('Warning: Could not load config file:', err.message)
    }
  }
}
