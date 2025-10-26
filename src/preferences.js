import fs from 'fs/promises'
import path from 'path'
import { config } from './config.js'

/**
 * User preferences structure
 */
const defaultPreferences = {
  version: 1,
  myChannels: [],           // Your own channel slugs
  favorites: [],            // Favorite channel slugs
  autoSync: [],             // Channels to auto-download on mount
  syncSettings: {
    onMount: false,         // Auto-sync on mount
    interval: null,         // Auto-sync interval in minutes (null = disabled)
  },
  downloadSettings: {
    format: 'bestaudio',
    audioFormat: 'mp3',
    audioQuality: '192K',
  }
}

let prefs = null

/**
 * Load user preferences
 */
export async function loadPreferences() {
  const prefsFile = path.join(path.dirname(config.configFile), 'preferences.json')

  try {
    const data = await fs.readFile(prefsFile, 'utf-8')
    prefs = { ...defaultPreferences, ...JSON.parse(data) }
  } catch (err) {
    if (err.code === 'ENOENT') {
      // File doesn't exist, use defaults
      prefs = { ...defaultPreferences }
      await savePreferences()
    } else {
      console.error('Error loading preferences:', err.message)
      prefs = { ...defaultPreferences }
    }
  }

  return prefs
}

/**
 * Save user preferences
 */
export async function savePreferences() {
  if (!prefs) return

  const prefsFile = path.join(path.dirname(config.configFile), 'preferences.json')
  const prefsDir = path.dirname(prefsFile)

  await fs.mkdir(prefsDir, { recursive: true })
  await fs.writeFile(prefsFile, JSON.stringify(prefs, null, 2), 'utf-8')
}

/**
 * Get current preferences
 */
export function getPreferences() {
  return prefs || defaultPreferences
}

/**
 * Add a channel to favorites
 */
export async function addFavorite(channelSlug) {
  if (!prefs) await loadPreferences()

  if (!prefs.favorites.includes(channelSlug)) {
    prefs.favorites.push(channelSlug)
    await savePreferences()
    console.log(`⭐ Added to favorites: ${channelSlug}`)
    return true
  }
  return false
}

/**
 * Remove a channel from favorites
 */
export async function removeFavorite(channelSlug) {
  if (!prefs) await loadPreferences()

  const index = prefs.favorites.indexOf(channelSlug)
  if (index > -1) {
    prefs.favorites.splice(index, 1)
    await savePreferences()
    console.log(`♡ Removed from favorites: ${channelSlug}`)
    return true
  }
  return false
}

/**
 * Add a channel to auto-sync
 */
export async function addAutoSync(channelSlug) {
  if (!prefs) await loadPreferences()

  if (!prefs.autoSync.includes(channelSlug)) {
    prefs.autoSync.push(channelSlug)
    await savePreferences()
    console.log(`🔄 Added to auto-sync: ${channelSlug}`)
    return true
  }
  return false
}

/**
 * Remove a channel from auto-sync
 */
export async function removeAutoSync(channelSlug) {
  if (!prefs) await loadPreferences()

  const index = prefs.autoSync.indexOf(channelSlug)
  if (index > -1) {
    prefs.autoSync.splice(index, 1)
    await savePreferences()
    console.log(`⊘ Removed from auto-sync: ${channelSlug}`)
    return true
  }
  return false
}

/**
 * Check if a channel is in favorites
 */
export function isFavorite(channelSlug) {
  return prefs?.favorites.includes(channelSlug) || false
}

/**
 * Check if a channel is in auto-sync
 */
export function isAutoSync(channelSlug) {
  return prefs?.autoSync.includes(channelSlug) || false
}
