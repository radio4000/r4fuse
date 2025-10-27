import assert from 'assert'
import path from 'path'
import fs from 'fs/promises'
import {
  loadSettings,
  loadFavorites,
  saveFavorites,
  loadDownloads,
  saveDownloads,
  addFavorite,
  removeFavorite,
  addDownload,
  removeDownload,
  isFavorite,
  isDownload,
} from '../src/preferences.js'
import { config } from '../src/config.js'
import {
  createTempDir,
  cleanupDir,
  assertFileExists,
  readJSON,
  writeJSON,
  assertEquals,
  assertContains,
  assertNotContains,
} from './helpers.js'

export default function(runner) {
  let testConfigDir = null
  let originalConfigFile = null

  // Setup: Create temp directory before each test
  async function setup() {
    testConfigDir = await createTempDir()
    originalConfigFile = config.configFile
    config.configFile = path.join(testConfigDir, 'config.json')
  }

  // Teardown: Clean up temp directory after each test
  async function teardown() {
    config.configFile = originalConfigFile
    if (testConfigDir) {
      await cleanupDir(testConfigDir)
    }
  }

  runner.test('preferences: loadSettings creates default settings.json', async () => {
    await setup()
    try {
      const settings = await loadSettings()

      // Check defaults exist
      assert.ok(settings.ytdlp)
      assertEquals(settings.ytdlp.format, 'bestaudio/best')
      assertEquals(settings.ytdlp.audioFormat, 'mp3')
      assertEquals(settings.ytdlp.audioQuality, '0')
      assertEquals(settings.ytdlp.addMetadata, false)

      // Check file was created
      const settingsFile = path.join(path.dirname(config.configFile), 'settings.json')
      await assertFileExists(settingsFile)
    } finally {
      await teardown()
    }
  })

  runner.test('preferences: loadFavorites creates empty favorites.txt', async () => {
    await setup()
    try {
      const favorites = await loadFavorites()
      assertEquals(favorites, [])

      const favoritesFile = path.join(path.dirname(config.configFile), 'favorites.txt')
      await assertFileExists(favoritesFile)
    } finally {
      await teardown()
    }
  })

  runner.test('preferences: loadDownloads creates empty downloads.txt', async () => {
    await setup()
    try {
      const downloads = await loadDownloads()
      assertEquals(downloads, [])

      const downloadsFile = path.join(path.dirname(config.configFile), 'downloads.txt')
      await assertFileExists(downloadsFile)
    } finally {
      await teardown()
    }
  })

  runner.test('preferences: saveFavorites and loadFavorites', async () => {
    await setup()
    try {
      const testFavorites = ['channel1', 'channel2', 'channel3']
      await saveFavorites(testFavorites)

      const loaded = await loadFavorites()
      assertEquals(loaded, testFavorites)
    } finally {
      await teardown()
    }
  })

  runner.test('preferences: saveDownloads and loadDownloads', async () => {
    await setup()
    try {
      const testDownloads = ['download1', 'download2']
      await saveDownloads(testDownloads)

      const loaded = await loadDownloads()
      assertEquals(loaded, testDownloads)
    } finally {
      await teardown()
    }
  })

  runner.test('preferences: addFavorite adds new channel', async () => {
    await setup()
    try {
      const added = await addFavorite('test-channel')
      assertEquals(added, true)

      const favorites = await loadFavorites()
      assertContains(favorites, 'test-channel')
    } finally {
      await teardown()
    }
  })

  runner.test('preferences: addFavorite does not add duplicate', async () => {
    await setup()
    try {
      await addFavorite('test-channel')
      const added = await addFavorite('test-channel')
      assertEquals(added, false)

      const favorites = await loadFavorites()
      assertEquals(favorites.filter(f => f === 'test-channel').length, 1)
    } finally {
      await teardown()
    }
  })

  runner.test('preferences: removeFavorite removes channel', async () => {
    await setup()
    try {
      await saveFavorites(['channel1', 'channel2', 'channel3'])

      const removed = await removeFavorite('channel2')
      assertEquals(removed, true)

      const favorites = await loadFavorites()
      assertNotContains(favorites, 'channel2')
      assertContains(favorites, 'channel1')
      assertContains(favorites, 'channel3')
    } finally {
      await teardown()
    }
  })

  runner.test('preferences: removeFavorite returns false for non-existent', async () => {
    await setup()
    try {
      await saveFavorites(['channel1'])

      const removed = await removeFavorite('non-existent')
      assertEquals(removed, false)
    } finally {
      await teardown()
    }
  })

  runner.test('preferences: addDownload adds new channel', async () => {
    await setup()
    try {
      const added = await addDownload('test-download')
      assertEquals(added, true)

      const downloads = await loadDownloads()
      assertContains(downloads, 'test-download')
    } finally {
      await teardown()
    }
  })

  runner.test('preferences: addDownload does not add duplicate', async () => {
    await setup()
    try {
      await addDownload('test-download')
      const added = await addDownload('test-download')
      assertEquals(added, false)

      const downloads = await loadDownloads()
      assertEquals(downloads.filter(d => d === 'test-download').length, 1)
    } finally {
      await teardown()
    }
  })

  runner.test('preferences: removeDownload removes channel', async () => {
    await setup()
    try {
      await saveDownloads(['download1', 'download2', 'download3'])

      const removed = await removeDownload('download2')
      assertEquals(removed, true)

      const downloads = await loadDownloads()
      assertNotContains(downloads, 'download2')
      assertContains(downloads, 'download1')
      assertContains(downloads, 'download3')
    } finally {
      await teardown()
    }
  })

  runner.test('preferences: isFavorite returns true for favorite', async () => {
    await setup()
    try {
      await saveFavorites(['channel1', 'channel2'])

      const result = await isFavorite('channel1')
      assertEquals(result, true)
    } finally {
      await teardown()
    }
  })

  runner.test('preferences: isFavorite returns false for non-favorite', async () => {
    await setup()
    try {
      await saveFavorites(['channel1', 'channel2'])

      const result = await isFavorite('channel3')
      assertEquals(result, false)
    } finally {
      await teardown()
    }
  })

  runner.test('preferences: isDownload returns true for download', async () => {
    await setup()
    try {
      await saveDownloads(['download1', 'download2'])

      const result = await isDownload('download1')
      assertEquals(result, true)
    } finally {
      await teardown()
    }
  })

  runner.test('preferences: isDownload returns false for non-download', async () => {
    await setup()
    try {
      await saveDownloads(['download1', 'download2'])

      const result = await isDownload('download3')
      assertEquals(result, false)
    } finally {
      await teardown()
    }
  })

  runner.test('preferences: handles empty lines in files', async () => {
    await setup()
    try {
      const favoritesFile = path.join(path.dirname(config.configFile), 'favorites.txt')
      await fs.mkdir(path.dirname(favoritesFile), { recursive: true })
      await fs.writeFile(favoritesFile, 'channel1\n\n\nchannel2\n\n')

      const favorites = await loadFavorites()
      assertEquals(favorites, ['channel1', 'channel2'])
    } finally {
      await teardown()
    }
  })
}
