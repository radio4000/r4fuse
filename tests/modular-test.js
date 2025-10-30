import { describe, it } from 'node:test'
import assert from 'node:assert'

// Import the modularized functions
import { createStat, createSafeDate, getTimestamp } from '../src/utils/timestamps.js'
import { parsePath, sanitizeFilename } from '../src/utils/path-utils.js'
import { extractTagsFromTrack, formatTrackContent } from '../src/utils/content-utils.js'
import { extractTags } from '../src/utils/track-utils.js'
import { fileExists, delay } from '../src/utils/download-utils.js'

describe('Modular Architecture Tests', () => {
  describe('Timestamp Utilities', () => {
    it('should export all required timestamp functions', () => {
      assert.strictEqual(typeof createStat, 'function')
      assert.strictEqual(typeof createSafeDate, 'function')
      assert.strictEqual(typeof getTimestamp, 'function')
    })

    it('should create safe dates correctly', () => {
      const validDate = createSafeDate('2023-01-01T00:00:00.000Z')
      assert.ok(validDate instanceof Date)
      assert.ok(!isNaN(validDate.getTime()))

      const invalidDate = createSafeDate('invalid')
      assert.strictEqual(invalidDate, undefined)

      const emptyDate = createSafeDate('')
      assert.strictEqual(emptyDate, undefined)
    })

    it('should get timestamps correctly', () => {
      const validDate = new Date('2023-01-01T00:00:00.000Z')
      const timestamp = getTimestamp(validDate)
      assert.ok(typeof timestamp === 'number')
      assert.ok(timestamp > 0)

      const invalidDate = new Date('invalid')
      const fallbackTimestamp = getTimestamp(invalidDate)
      assert.ok(typeof fallbackTimestamp === 'number')
      assert.ok(fallbackTimestamp > 0)
    })

    it('should create stat objects correctly', () => {
      const stat = createStat({
        mode: 0o755,
        size: 1024,
        isDir: true,
        mtime: new Date('2023-01-01T00:00:00.000Z'),
        ctime: new Date('2023-01-01T00:00:00.000Z'),
        atime: new Date('2023-01-01T00:00:00.000Z'),
      })
      
      assert.ok(typeof stat.mtime === 'number')
      assert.ok(typeof stat.ctime === 'number')
      assert.ok(typeof stat.atime === 'number')
      // Just verify the structure exists and has proper types
      assert.ok(typeof stat.mtime === 'number')
      assert.ok(typeof stat.ctime === 'number')
      assert.ok(typeof stat.atime === 'number')
      assert.ok(stat.mtime > 0)
      assert.ok(stat.ctime > 0)
      assert.ok(stat.atime > 0)
      assert.strictEqual(stat.mode, 0o755)
      assert.strictEqual(stat.size, 1024)
      assert.strictEqual(stat.isDir, true)
    })
  })

  describe('Path Utilities', () => {
    it('should export required path functions', () => {
      assert.strictEqual(typeof parsePath, 'function')
      assert.strictEqual(typeof sanitizeFilename, 'function')
    })

    it('should parse paths correctly', () => {
      const result = parsePath('/channels/test/tracks/file.txt')
      assert.strictEqual(result.root, 'channels')
      assert.strictEqual(result.channel, 'test')
      assert.strictEqual(result.subdir, 'tracks')
      assert.strictEqual(result.file, 'file.txt')
    })

    it('should sanitize filenames correctly', () => {
      const result = sanitizeFilename('Test Track! @ # $')
      // The function removes special chars and replaces spaces with dashes
      // Multiple consecutive special chars become a single dash
      assert.ok(result.includes('test-track'))
    })
  })

  describe('Content Utilities', () => {
    it('should export required content functions', () => {
      assert.strictEqual(typeof extractTagsFromTrack, 'function')
      assert.strictEqual(typeof formatTrackContent, 'function')
    })

    it('should extract tags from tracks correctly', () => {
      const track = { description: 'This is #test #track' }
      const tags = extractTagsFromTrack(track)
      assert.ok(tags.includes('test'))
      assert.ok(tags.includes('track'))
    })

    it('should format track content correctly', () => {
      const track = { 
        title: 'Test Track', 
        url: 'https://example.com', 
        description: 'Test description'
      }
      const content = formatTrackContent(track)
      assert.ok(content.includes('Test Track'))
      assert.ok(content.includes('https://example.com'))
    })
  })

  describe('Track Utilities', () => {
    it('should export required track functions', () => {
      assert.strictEqual(typeof extractTags, 'function')
    })

    it('should extract tags from tracks correctly', () => {
      const track = { description: 'This is #test #track' }
      const tags = extractTags(track)
      assert.ok(tags.includes('test'))
      assert.ok(tags.includes('track'))
    })
  })

  describe('Download Utilities', () => {
    it('should export required download functions', () => {
      assert.strictEqual(typeof fileExists, 'function')
      assert.strictEqual(typeof delay, 'function')
    })

    it('should have delay function that returns a promise', () => {
      const promise = delay(1)
      assert.ok(promise instanceof Promise)
    })
  })
})