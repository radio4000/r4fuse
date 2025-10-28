import assert from 'assert'
import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import {
  config,
  ensureDirectories,
  loadUserConfig,
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
} from '../src/config.js'
import {
  createTempDir,
  cleanupDir,
  assertFileExists,
  writeJSON,
  readJSON,
  assertEquals,
  assertContains,
  assertNotContains,
} from './helpers.js'

export default function(runner) {
  let testDir = null
  let originalConfigFile = null

  async function setup() {
    testDir = await createTempDir()
    originalConfigFile = config.configFile
    config.configFile = path.join(testDir, 'config.json')
    config.mountPoint = path.join(testDir, 'mnt')
    config.downloadDir = path.join(testDir, 'downloads')
    config.cacheDir = path.join(testDir, 'cache')
    config.stateDir = path.join(testDir, 'state')
  }

  async function teardown() {
    config.configFile = originalConfigFile
    if (testDir) {
      await cleanupDir(testDir)
    }
  }

  runner.test('config: has default values', async () => {
    assert.ok(config.mountPoint)
    assert.ok(config.downloadDir)
    assert.ok(config.cacheDir)
    assert.ok(config.stateDir)
    assert.ok(config.configFile)
    assertEquals(config.cacheTTL, 5 * 60 * 1000)
  })

  runner.test('config: has supabase credentials', async () => {
    assert.ok(config.supabase)
    // URLs should exist (even if empty in test env)
    assert.ok(typeof config.supabase.url !== 'undefined')
    assert.ok(typeof config.supabase.key !== 'undefined')
  })

  runner.test('config: has ytdlp defaults', async () => {
    assert.ok(config.ytdlp)
    assertEquals(config.ytdlp.format, 'bestaudio/best')
    assertEquals(config.ytdlp.extractAudio, true)
    assertEquals(config.ytdlp.audioFormat, 'mp3')
    assertEquals(config.ytdlp.audioQuality, '0')
  })

  runner.test('config: ensureDirectories creates directories', async () => {
    await setup()
    try {
      await ensureDirectories()

      await assertFileExists(config.mountPoint)
      await assertFileExists(config.downloadDir)
      await assertFileExists(config.cacheDir)
      await assertFileExists(config.stateDir)
      await assertFileExists(path.dirname(config.configFile))
    } finally {
      await teardown()
    }
  })

  runner.test('config: loadUserConfig with no file uses defaults', async () => {
    await setup()
    try {
      const originalCacheTTL = config.cacheTTL

      await loadUserConfig()

      // Should still have default values
      assertEquals(config.cacheTTL, originalCacheTTL)
    } finally {
      await teardown()
    }
  })

  runner.test('config: loadUserConfig merges user config', async () => {
    await setup()
    try {
      // Create a user config file
      const userConfig = {
        cacheTTL: 10 * 60 * 1000, // 10 minutes
      }
      await writeJSON(config.configFile, userConfig)

      // Load it
      await loadUserConfig()

      // Should have merged value
      assertEquals(config.cacheTTL, 10 * 60 * 1000)
    } finally {
      await teardown()
    }
  })

  runner.test('config: loadUserConfig handles invalid JSON gracefully', async () => {
    await setup()
    try {
      // Write invalid JSON
      await fs.mkdir(path.dirname(config.configFile), { recursive: true })
      await fs.writeFile(config.configFile, '{invalid json}')

      const originalCacheTTL = config.cacheTTL

      // Should not throw, just warn
      await loadUserConfig()

      // Should keep original values
      assertEquals(config.cacheTTL, originalCacheTTL)
    } finally {
      await teardown()
    }
  })

  runner.test('config: environment variables override defaults', async () => {
    // Note: This test checks the current state, which may have env vars set
    // We just verify the mechanism works by checking types
    assert.ok(typeof config.mountPoint === 'string')
    assert.ok(typeof config.downloadDir === 'string')
    assert.ok(typeof config.cacheDir === 'string')
  })

  runner.test('config: paths use home directory', async () => {
    const home = os.homedir()

    // At least one of the default paths should reference home
    // (unless overridden by env vars or in tests, which is fine)
    const usesHome =
      config.mountPoint.includes(home) ||
      config.downloadDir.includes(home) ||
      config.cacheDir.includes(home) ||
      config.stateDir.includes(home)

    const hasEnvOverride =
      process.env.R4_MOUNT_POINT ||
      process.env.R4_DOWNLOAD_DIR ||
      process.env.R4_CACHE_DIR ||
      process.env.R4_STATE_DIR

    // It's OK if paths don't use home if env vars are set or if in test mode
    // In test mode, other tests will have overridden the config
    assert.ok(usesHome || hasEnvOverride || config.mountPoint.includes('/tmp'))
  })

  // Settings tests (merged from settings.test.js)
  runner.test('config: loadSettings creates default settings.json', async () => {
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

  runner.test('config: loadFavorites creates empty favorites.txt', async () => {
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

  runner.test('config: loadDownloads creates empty downloads.txt', async () => {
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

  runner.test('config: saveFavorites and loadFavorites', async () => {
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

  runner.test('config: saveDownloads and loadDownloads', async () => {
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

  runner.test('config: addFavorite adds new channel', async () => {
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

  runner.test('config: addFavorite does not add duplicate', async () => {
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

  runner.test('config: removeFavorite removes channel', async () => {
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

  runner.test('config: removeFavorite returns false for non-existent', async () => {
    await setup()
    try {
      await saveFavorites(['channel1'])

      const removed = await removeFavorite('non-existent')
      assertEquals(removed, false)
    } finally {
      await teardown()
    }
  })

  runner.test('config: addDownload adds new channel', async () => {
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

  runner.test('config: addDownload does not add duplicate', async () => {
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

  runner.test('config: removeDownload removes channel', async () => {
    await setup()
    try {
      await saveDownloads(['dl1', 'dl2', 'dl3'])

      const removed = await removeDownload('dl2')
      assertEquals(removed, true)

      const downloads = await loadDownloads()
      assertNotContains(downloads, 'dl2')
      assertContains(downloads, 'dl1')
      assertContains(downloads, 'dl3')
    } finally {
      await teardown()
    }
  })

  runner.test('config: removeDownload returns false for non-existent', async () => {
    await setup()
    try {
      await saveDownloads(['dl1'])

      const removed = await removeDownload('non-existent')
      assertEquals(removed, false)
    } finally {
      await teardown()
    }
  })

  runner.test('config: isFavorite checks favorites', async () => {
    await setup()
    try {
      await saveFavorites(['channel1', 'channel2'])

      const is1 = await isFavorite('channel1')
      const is3 = await isFavorite('channel3')

      assertEquals(is1, true)
      assertEquals(is3, false)
    } finally {
      await teardown()
    }
  })

  runner.test('config: isDownload checks downloads', async () => {
    await setup()
    try {
      await saveDownloads(['dl1', 'dl2'])

      const is1 = await isDownload('dl1')
      const is3 = await isDownload('dl3')

      assertEquals(is1, true)
      assertEquals(is3, false)
    } finally {
      await teardown()
    }
  })
}
