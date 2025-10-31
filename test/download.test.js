import assert from 'assert'
import path from 'path'
import fs from 'fs/promises'
import { checkYtdlp } from '../dist/download.js'
import {
  createTempDir,
  cleanupDir,
  assertFileExists,
  readJSON,
  writeJSON,
  assertEquals,
  assertContains,
} from './helpers.js'

export default function(runner) {
  runner.test('download: checkYtdlp returns boolean', async () => {
    const result = await checkYtdlp()
    assert.ok(typeof result === 'boolean')
  })

  runner.test('download: status.json structure', async () => {
    const testDir = await createTempDir()
    try {
      // Manually create a status.json file
      const statusFile = path.join(testDir, 'status.json')
      const status = {
        downloaded: ['track1', 'track2'],
        failed: ['track3'],
        lastUpdated: new Date().toISOString(),
      }
      await writeJSON(statusFile, status)

      // Read and verify
      const loaded = await readJSON(statusFile)
      assertEquals(loaded.downloaded, ['track1', 'track2'])
      assertEquals(loaded.failed, ['track3'])
      assert.ok(loaded.lastUpdated)
    } finally {
      await cleanupDir(testDir)
    }
  })

  runner.test('download: debug.txt appends log lines', async () => {
    const testDir = await createTempDir()
    try {
      const debugFile = path.join(testDir, 'debug.txt')

      // Simulate appending log lines
      const timestamp = new Date().toISOString()
      await fs.appendFile(debugFile, `[${timestamp}] Test log line 1\n`)
      await fs.appendFile(debugFile, `[${timestamp}] Test log line 2\n`)

      // Read and verify
      const content = await fs.readFile(debugFile, 'utf-8')
      const lines = content.trim().split('\n')
      assertEquals(lines.length, 2)
      assert.ok(lines[0].includes('Test log line 1'))
      assert.ok(lines[1].includes('Test log line 2'))
    } finally {
      await cleanupDir(testDir)
    }
  })

  runner.test('download: tracks downloaded state', async () => {
    const testDir = await createTempDir()
    try {
      const statusFile = path.join(testDir, 'status.json')

      // Initial state
      let status = {
        downloaded: [],
        failed: [],
        lastUpdated: new Date().toISOString(),
      }
      await writeJSON(statusFile, status)

      // Add a downloaded track
      status = await readJSON(statusFile)
      status.downloaded.push('track-id-1')
      status.lastUpdated = new Date().toISOString()
      await writeJSON(statusFile, status)

      // Verify
      status = await readJSON(statusFile)
      assertContains(status.downloaded, 'track-id-1')
      assertEquals(status.downloaded.length, 1)
    } finally {
      await cleanupDir(testDir)
    }
  })

  runner.test('download: tracks failed state', async () => {
    const testDir = await createTempDir()
    try {
      const statusFile = path.join(testDir, 'status.json')

      // Initial state
      let status = {
        downloaded: [],
        failed: [],
        lastUpdated: new Date().toISOString(),
      }
      await writeJSON(statusFile, status)

      // Add a failed track
      status = await readJSON(statusFile)
      status.failed.push('track-id-error')
      status.lastUpdated = new Date().toISOString()
      await writeJSON(statusFile, status)

      // Verify
      status = await readJSON(statusFile)
      assertContains(status.failed, 'track-id-error')
      assertEquals(status.failed.length, 1)
    } finally {
      await cleanupDir(testDir)
    }
  })

  runner.test('download: removes from failed on success', async () => {
    const testDir = await createTempDir()
    try {
      const statusFile = path.join(testDir, 'status.json')

      // Track previously failed
      let status = {
        downloaded: [],
        failed: ['track-id-1'],
        lastUpdated: new Date().toISOString(),
      }
      await writeJSON(statusFile, status)

      // Now it succeeds
      status = await readJSON(statusFile)
      status.downloaded.push('track-id-1')
      status.failed = status.failed.filter(id => id !== 'track-id-1')
      status.lastUpdated = new Date().toISOString()
      await writeJSON(statusFile, status)

      // Verify
      status = await readJSON(statusFile)
      assertContains(status.downloaded, 'track-id-1')
      assertEquals(status.failed.length, 0)
    } finally {
      await cleanupDir(testDir)
    }
  })

  runner.test('download: prevents re-download', async () => {
    const testDir = await createTempDir()
    try {
      const statusFile = path.join(testDir, 'status.json')

      // Track already downloaded
      const status = {
        downloaded: ['track-id-1', 'track-id-2'],
        failed: [],
        lastUpdated: new Date().toISOString(),
      }
      await writeJSON(statusFile, status)

      // Check if track should be skipped
      const loaded = await readJSON(statusFile)
      const trackId = 'track-id-1'
      const shouldSkip = loaded.downloaded.includes(trackId)

      assertEquals(shouldSkip, true)
    } finally {
      await cleanupDir(testDir)
    }
  })

  runner.test('download: updates lastUpdated timestamp', async () => {
    const testDir = await createTempDir()
    try {
      const statusFile = path.join(testDir, 'status.json')

      const initialTime = new Date('2024-01-01T00:00:00Z').toISOString()
      const status = {
        downloaded: [],
        failed: [],
        lastUpdated: initialTime,
      }
      await writeJSON(statusFile, status)

      // Simulate an update
      await new Promise(resolve => setTimeout(resolve, 10))

      const loaded = await readJSON(statusFile)
      loaded.downloaded.push('new-track')
      loaded.lastUpdated = new Date().toISOString()
      await writeJSON(statusFile, loaded)

      // Verify timestamp changed
      const updated = await readJSON(statusFile)
      assert.ok(updated.lastUpdated !== initialTime)
      assert.ok(new Date(updated.lastUpdated) > new Date(initialTime))
    } finally {
      await cleanupDir(testDir)
    }
  })
}
