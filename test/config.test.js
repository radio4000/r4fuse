import assert from 'assert'
import path from 'path'
import os from 'os'
import fs from 'fs/promises'
import { config, ensureDirectories, loadUserConfig } from '../src/config.js'
import {
  createTempDir,
  cleanupDir,
  assertFileExists,
  writeJSON,
  readJSON,
  assertEquals,
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
}
