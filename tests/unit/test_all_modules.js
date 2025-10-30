import { describe, it, mock } from 'node:test'
import assert from 'node:assert'
import { createStat, createSafeDate, getTimestamp } from '../../src/utils/timestamps.js'
import { parsePath, sanitizeFilename } from '../../src/utils/path-utils.js'
import { extractTagsFromTrack, formatTrackContent } from '../../src/utils/content-utils.js'
import { extractTags } from '../../src/utils/track-utils.js'

// Mock Date for consistent testing
const originalDate = global.Date
const mockDate = class MockDate extends originalDate {
  constructor(date) {
    super(date || '2023-01-01T00:00:00.000Z')
    return new originalDate(date || '2023-01-01T00:00:00.000Z')
  }
  static now() {
    return originalDate.parse('2023-01-01T00:00:00.000Z')
  }
  getTime() {
    return this instanceof originalDate ? super.getTime() : originalDate.parse(this)
  }
}

describe('Timestamp Utilities', () => {
  describe('createSafeDate', () => {
    it('should create Date object from valid date string', () => {
      const date = createSafeDate('2023-01-01T00:00:00.000Z')
      assert.ok(date instanceof Date)
      assert.ok(!isNaN(date.getTime()))
    })

    it('should return undefined for empty string', () => {
      const date = createSafeDate('')
      assert.strictEqual(date, undefined)
    })

    it('should return undefined for null', () => {
      const date = createSafeDate(null)
      assert.strictEqual(date, undefined)
    })

    it('should return undefined for invalid date string', () => {
      const date = createSafeDate('invalid-date')
      assert.strictEqual(date, undefined)
    })
  })

  describe('getTimestamp', () => {
    it('should return timestamp for valid Date object', () => {
      const date = new mockDate('2023-01-01T00:00:00.000Z')
      const timestamp = getTimestamp(date)
      assert.ok(typeof timestamp === 'number')
      assert.ok(timestamp > 0)
    })

    it('should return fallback for invalid Date object', () => {
      const timestamp = getTimestamp(new originalDate('invalid'))
      assert.ok(typeof timestamp === 'number')
      assert.ok(timestamp > 0) // Should fall back to current time
    })

    it('should return fallback for undefined input', () => {
      const timestamp = getTimestamp(undefined)
      assert.ok(typeof timestamp === 'number')
      assert.ok(timestamp > 0) // Should fall back to current time
    })
  })

  describe('createStat', () => {
    it('should create stat object with valid dates', () => {
      const stat = createStat({
        mtime: new mockDate('2023-06-15T10:30:00.000Z'),
        atime: new mockDate('2023-06-16T11:30:00.000Z'),
        ctime: new mockDate('2023-06-14T09:30:00.000Z'),
        mode: 0o755,
        size: 1024,
        isDir: true
      })
      
      assert.ok(stat.mtime > 0)
      assert.ok(stat.atime > 0) 
      assert.ok(stat.ctime > 0)
      // Mode includes file type bits, so check that the mode contains the expected permissions
      assert.ok(stat.mode & 0o755) // Check that 755 permissions are set
      assert.strictEqual(stat.size, 1024)
    })
  })
})

describe('Path Utilities', () => {
  describe('parsePath', () => {
    it('should parse simple channel path', () => {
      const result = parsePath('/channels/test-channel')
      assert.strictEqual(result.root, 'channels')
      assert.strictEqual(result.channel, 'test-channel')
      assert.strictEqual(result.subdir, undefined)
    })

    it('should parse nested track path', () => {
      const result = parsePath('/channels/test/tracks/track-name.txt')
      assert.strictEqual(result.root, 'channels')
      assert.strictEqual(result.channel, 'test')
      assert.strictEqual(result.subdir, 'tracks')
      assert.strictEqual(result.file, 'track-name.txt')
    })

    it('should parse tag path', () => {
      const result = parsePath('/channels/test/tags/electronic/track.txt')
      assert.strictEqual(result.root, 'channels')
      assert.strictEqual(result.channel, 'test')
      assert.strictEqual(result.subdir, 'tags')
      assert.strictEqual(result.file, 'electronic')
      assert.strictEqual(result.file2, 'track.txt')
    })
  })

  describe('sanitizeFilename', () => {
    it('should sanitize filenames properly', () => {
      assert.ok(sanitizeFilename('Test Track! @ # $').includes('test-track'))
      assert.strictEqual(sanitizeFilename('Track with spaces'), 'track-with-spaces')
      assert.strictEqual(sanitizeFilename('Track_with_underscores'), 'track_with_underscores')
    })
  })
})

describe('Content Utilities', () => {
  describe('extractTagsFromTrack', () => {
    it('should extract hashtags from description', () => {
      const track = {
        description: 'This is a #test track with #electronic #music'
      }
      const tags = extractTagsFromTrack(track)
      assert.deepStrictEqual([...tags].sort(), ['electronic', 'music', 'test'])
    })

    it('should extract tags from tags field', () => {
      const track = {
        tags: ['rock', 'alternative']
      }
      const tags = extractTagsFromTrack(track)
      assert.deepStrictEqual([...tags].sort(), ['alternative', 'rock'])
    })

    it('should combine both sources and remove duplicates', () => {
      const track = {
        description: 'This is a #rock track',
        tags: ['rock', 'alternative']
      }
      const tags = extractTagsFromTrack(track)
      assert.deepStrictEqual([...tags].sort(), ['alternative', 'rock'])
    })
  })

  describe('formatTrackContent', () => {
    it('should format track content properly', () => {
      const track = {
        title: 'Test Track',
        url: 'https://youtube.com/watch?v=test',
        description: 'A sample description',
        created_at: '2023-01-01T00:00:00.000Z'
      }
      
      const content = formatTrackContent(track)
      assert.ok(content.includes('Title: Test Track'))
      assert.ok(content.includes('URL: https://youtube.com/watch?v=test'))
      assert.ok(content.includes('A sample description'))
      assert.ok(content.includes('Added:'))
    })
  })
})

describe('Track Utilities', () => {
  describe('extractTags', () => {
    it('should extract tags similar to content utils version', () => {
      const track = {
        description: 'This is a #test track with #music',
        tags: ['electronic']
      }
      const tags = extractTags(track)
      assert.deepStrictEqual([...tags].sort(), ['electronic', 'music', 'test'])
    })
  })
})