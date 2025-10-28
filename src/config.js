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
  configFile: process.env.R4_CONFIG_FILE || path.join(HOME, '.config/radio4000/r4fuse/config.json'),

  // Cache TTL (5 minutes)
  cacheTTL: 5 * 60 * 1000,

  // Supabase credentials
  supabase: {
    url: process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    key: process.env.VITE_SUPABASE_KEY || process.env.SUPABASE_KEY,
  },

  // yt-dlp options (defaults, can be overridden in settings.json)
  ytdlp: {
    format: 'bestaudio/best',  // Get best audio, fallback to best overall
    extractAudio: true,
    audioFormat: 'mp3',
    audioQuality: '0',  // 0 = best quality (VBR ~245 kbps for mp3)
    addMetadata: false,  // Don't add metadata via yt-dlp (we handle it ourselves)
    embedThumbnail: true,  // Embed thumbnail as cover art
    writeThumbnail: false, // Don't write separate thumbnail files (optional)
  },

  // Downloader choice
  downloader: 'yt-dlp',  // Can be 'yt-dlp' or 'youtube-dl'

  // Mount options
  mount: {
    debug: false,
  },

  // Features
  features: {
    organizeByTags: true,  // Create symlinks organized by tags
    rsyncEnabled: false,   // Enable rsync sync feature
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
 * Get config directory path
 */
function getConfigDir() {
  return path.dirname(config.configFile)
}

/**
 * Load user config if it exists
 */
export async function loadUserConfig() {
  try {
    // Try loading settings.json first (new format)
    const settingsFile = path.join(path.dirname(config.configFile), 'settings.json')
    try {
      const data = await fs.readFile(settingsFile, 'utf-8')
      const userConfig = JSON.parse(data)

      // Apply all settings
      if (userConfig.ytdlp) {
        Object.assign(config.ytdlp, userConfig.ytdlp)
      }
      if (userConfig.downloader) {
        config.downloader = userConfig.downloader
      }
      if (userConfig.mount) {
        Object.assign(config.mount, userConfig.mount)
      }
      if (userConfig.features) {
        Object.assign(config.features, userConfig.features)
      }
      if (userConfig.paths) {
        if (userConfig.paths.mountPoint) {
          config.mountPoint = userConfig.paths.mountPoint
        }
        if (userConfig.paths.downloadDir) {
          config.downloadDir = userConfig.paths.downloadDir
        }
      }
    } catch (settingsErr) {
      // settings.json doesn't exist, try old config.json format
      if (settingsErr.code === 'ENOENT') {
        const data = await fs.readFile(config.configFile, 'utf-8')
        const userConfig = JSON.parse(data)
        Object.assign(config, userConfig)
      } else {
        throw settingsErr
      }
    }
  } catch (err) {
    // Config file doesn't exist, use defaults
    if (err.code !== 'ENOENT') {
      console.warn('Warning: Could not load config file:', err.message)
    }
  }
}

/**
 * Load settings.json and return merged settings
 */
export async function loadSettings() {
  const settingsFile = path.join(getConfigDir(), 'settings.json')

  const defaultSettings = {
    ytdlp: {
      format: 'bestaudio/best',
      audioFormat: 'mp3',
      audioQuality: '0',  // Highest quality VBR
      addMetadata: false,  // Don't add metadata via yt-dlp (we handle it ourselves)
      embedThumbnail: true,  // Embed thumbnail as cover art
      writeThumbnail: false, // Don't write separate thumbnail files (optional)
    },
    downloader: 'yt-dlp',  // Can be 'yt-dlp' or 'youtube-dl'
    mount: {
      debug: false,
    },
    paths: {
      // Custom paths (leave empty to use defaults)
      mountPoint: '',
      downloadDir: '',
    },
    features: {
      organizeByTags: true,  // Create symlinks organized by tags
      rsyncEnabled: false,   // Enable rsync sync feature
    }
  }

  try {
    const data = await fs.readFile(settingsFile, 'utf-8')
    const userSettings = JSON.parse(data)
    // Deep merge settings
    return {
      ...defaultSettings,
      ...userSettings,
      ytdlp: { ...defaultSettings.ytdlp, ...userSettings.ytdlp },
      mount: { ...defaultSettings.mount, ...userSettings.mount },
      paths: { ...defaultSettings.paths, ...userSettings.paths },
      features: { ...defaultSettings.features, ...userSettings.features }
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.mkdir(getConfigDir(), { recursive: true })
      await fs.writeFile(settingsFile, JSON.stringify(defaultSettings, null, 2))
      return defaultSettings
    }
    throw err
  }
}

/**
 * Load favorites.txt - one channel slug per line
 */
export async function loadFavorites() {
  const favoritesFile = path.join(getConfigDir(), 'favorites.txt')

  try {
    const data = await fs.readFile(favoritesFile, 'utf-8')
    return data.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.mkdir(getConfigDir(), { recursive: true })
      await fs.writeFile(favoritesFile, '')
      return []
    }
    throw err
  }
}

/**
 * Save favorites.txt
 */
export async function saveFavorites(favorites) {
  const favoritesFile = path.join(getConfigDir(), 'favorites.txt')
  await fs.mkdir(getConfigDir(), { recursive: true })
  await fs.writeFile(favoritesFile, favorites.join('\n') + (favorites.length > 0 ? '\n' : ''))
}

/**
 * Load downloads.txt - one channel slug per line
 */
export async function loadDownloads() {
  const downloadsFile = path.join(getConfigDir(), 'downloads.txt')

  try {
    const data = await fs.readFile(downloadsFile, 'utf-8')
    return data.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.mkdir(getConfigDir(), { recursive: true })
      await fs.writeFile(downloadsFile, '')
      return []
    }
    throw err
  }
}

/**
 * Save downloads.txt
 */
export async function saveDownloads(downloads) {
  const downloadsFile = path.join(getConfigDir(), 'downloads.txt')
  await fs.mkdir(getConfigDir(), { recursive: true })
  await fs.writeFile(downloadsFile, downloads.join('\n') + (downloads.length > 0 ? '\n' : ''))
}

/**
 * Add a channel to favorites
 */
export async function addFavorite(channelSlug) {
  const favorites = await loadFavorites()
  if (!favorites.includes(channelSlug)) {
    favorites.push(channelSlug)
    await saveFavorites(favorites)
    console.log(`⭐ Added to favorites: ${channelSlug}`)
    return true
  }
  return false
}

/**
 * Remove a channel from favorites
 */
export async function removeFavorite(channelSlug) {
  const favorites = await loadFavorites()
  const index = favorites.indexOf(channelSlug)
  if (index > -1) {
    favorites.splice(index, 1)
    await saveFavorites(favorites)
    console.log(`♡ Removed from favorites: ${channelSlug}`)
    return true
  }
  return false
}

/**
 * Add a channel to downloads
 */
export async function addDownload(channelSlug) {
  const downloads = await loadDownloads()
  if (!downloads.includes(channelSlug)) {
    downloads.push(channelSlug)
    await saveDownloads(downloads)
    console.log(`📥 Added to downloads: ${channelSlug}`)
    return true
  }
  return false
}

/**
 * Remove a channel from downloads
 */
export async function removeDownload(channelSlug) {
  const downloads = await loadDownloads()
  const index = downloads.indexOf(channelSlug)
  if (index > -1) {
    downloads.splice(index, 1)
    await saveDownloads(downloads)
    console.log(`⊘ Removed from downloads: ${channelSlug}`)
    return true
  }
  return false
}

/**
 * Check if a channel is in favorites
 */
export async function isFavorite(channelSlug) {
  const favorites = await loadFavorites()
  return favorites.includes(channelSlug)
}

/**
 * Check if a channel is in downloads
 */
export async function isDownload(channelSlug) {
  const downloads = await loadDownloads()
  return downloads.includes(channelSlug)
}
