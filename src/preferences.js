import fs from 'fs/promises'
import path from 'path'
import { config } from './config.js'

/**
 * Get config directory path
 */
function getConfigDir() {
  return path.dirname(config.configFile)
}

/**
 * Load settings.json
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
