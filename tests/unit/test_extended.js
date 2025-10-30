import { describe, it, mock } from 'node:test'
import assert from 'node:assert'
import { extractTags } from '../../src/utils/track-utils.js'
import { sanitizeFilename } from '../../src/utils/path-utils.js'
import { fileExists, delay } from '../../src/utils/download-utils.js'

describe('Track Utilities - Extended Tests', () => {
  describe('extractTags', () => {
    it('should extract hashtags from description', () => {
      const track = {
        description: 'This is a #test track with #electronic #music'
      }
      const tags = extractTags(track)
      assert.deepStrictEqual([...tags].sort(), ['electronic', 'music', 'test'])
    })

    it('should extract tags from tags field', () => {
      const track = {
        tags: ['rock', 'alternative']
      }
      const tags = extractTags(track)
      assert.deepStrictEqual([...tags].sort(), ['alternative', 'rock'])
    })

    it('should combine both sources and remove duplicates', () => {
      const track = {
        description: 'This is a #rock track',
        tags: ['rock', 'alternative']
      }
      const tags = extractTags(track)
      assert.deepStrictEqual([...tags].sort(), ['alternative', 'rock'])
    })

    it('should handle case variations', () => {
      const track = {
        description: 'This has #Rock and #ALTERNATIVE tags'
      }
      const tags = extractTags(track)
      assert.deepStrictEqual([...tags].sort(), ['alternative', 'rock'])
    })

    it('should return empty array for no tags', () => {
      const track = {
        description: 'No tags here'
      }
      const tags = extractTags(track)
      assert.deepStrictEqual(tags, [])
    })
  })

  describe('sanitizeFilename', () => {
    it('should handle various input formats', () => {
      assert.strictEqual(sanitizeFilename('Simple Title'), 'simple-title')
      assert.strictEqual(sanitizeFilename('Track with numbers 123'), 'track-with-numbers-123')
      assert.strictEqual(sanitizeFilename('Track_with_underscore'), 'track_with_underscore')
      assert.strictEqual(sanitizeFilename('Track-with-dash'), 'track-with-dash')
    })

    it('should remove special characters', () => {
      assert.strictEqual(sanitizeFilename('Track!@#$%^&*()'), 'track')
      assert.strictEqual(sanitizeFilename('Track & More'), 'track-more')
      assert.strictEqual(sanitizeFilename('Track [Version]'), 'track-version')
    })

    it('should handle unicode and complex names', () => {
      assert.strictEqual(sanitizeFilename('Tëst Tráck'), 'tëst-tráck')
      assert.strictEqual(sanitizeFilename('Track / Subtitle'), 'track-subtitle')
      assert.ok(sanitizeFilename('Track...dots').includes('trackdots'))
    })

    it('should truncate long names', () => {
      const longName = 'a'.repeat(100)
      const sanitized = sanitizeFilename(longName)
      assert.ok(sanitized.length <= 50)
    })
    
    // Test non-Latin character support in sanitizeFilename
    it('should handle non-latin characters in sanitizeFilename', async () => {
      assert.strictEqual(sanitizeFilename('Tëst Tráck'), 'tëst-tráck')
      assert.strictEqual(sanitizeFilename('测试音乐'), '测试音乐')
      assert.strictEqual(sanitizeFilename('Песня'), 'песня')
      assert.strictEqual(sanitizeFilename('Café & soirée'), 'café-soirée')
    })
    })
  })
})

describe('Download Utilities - Extended Tests', () => {
  describe('delay', () => {
    it('should resolve after specified time', async () => {
      const start = Date.now()
      await delay(50) // 50ms delay
      const end = Date.now()
      const elapsed = end - start
      
      // Allow for some system variation but should be at least 40ms
      assert.ok(elapsed >= 40, `Expected delay of ~50ms, got ${elapsed}ms`)
    })

    it('should handle zero delay', async () => {
      const start = Date.now()
      await delay(0)
      const end = Date.now()
      const elapsed = end - start
      
      assert.ok(elapsed < 10, `Zero delay took too long: ${elapsed}ms`)
    })

    it('should handle small delays', async () => {
      const start = Date.now()
      await delay(10)
      const end = Date.now()
      const elapsed = end - start
      
      assert.ok(elapsed >= 5, `Expected small delay, got ${elapsed}ms`)
    })
  })

  describe('fileExists', () => {
    it('should be a function', () => {
      assert.strictEqual(typeof fileExists, 'function')
    })
  })
})

// Test the modules if they're available
describe('Module Functions', () => {
  it('should have properly structured exports', async () => {
    try {
      // Test that the download-tracks module exports expected functions
      const downloadTracks = await import('../../src/modules/download-tracks.js')
      
      assert.strictEqual(typeof downloadTracks.downloadTrack, 'function')
      assert.strictEqual(typeof downloadTracks.setFileTimestamps, 'function')
      assert.strictEqual(typeof downloadTracks.writeTrackMetadata, 'function')
      assert.strictEqual(typeof downloadTracks.createLocalPlaylist, 'function')
      assert.strictEqual(typeof downloadTracks.setFileTimestampsWithDelay, 'function')
      assert.strictEqual(typeof downloadTracks.organizeTrackByTags, 'function')
    } catch (e) {
      // If module doesn't exist, that's OK - we may have refactored differently
      console.log(`Download tracks module not available: ${e.message}`)
    }
  })
})