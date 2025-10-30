import { describe, it } from 'node:test'
import assert from 'node:assert'

/**
 * Functional tests that simulate real user workflows
 */
describe('Functional Tests - Main Workflows', () => {
  // Test the configuration loading functionality
  it('should load and save configuration properly', async () => {
    const config = await import('../../src/config.js')
    
    // Check that config functions exist
    assert.strictEqual(typeof config.loadSettings, 'function')
    assert.strictEqual(typeof config.loadFavorites, 'function') 
    assert.strictEqual(typeof config.loadDownloads, 'function')
    
    // Test loading settings (function should exist and return a promise)
    const settings = await config.loadSettings()
    assert.ok(settings !== undefined)
    assert.ok(typeof settings === 'object')
    
    // Test configuration properties exist
    assert.ok(settings.ytdlp)
    assert.ok(settings.features)
    assert.ok(settings.paths)
  })



  // Test timestamp utilities with realistic scenarios
  it('should handle realistic timestamp scenarios', async () => {
    const { createSafeDate, createStat } = await import('../../src/utils/timestamps.js')
    
    // Test valid timestamp scenario
    const validDateStr = '2023-06-15T10:30:00.000Z'
    const validDate = createSafeDate(validDateStr)
    assert.ok(validDate instanceof Date)
    assert.ok(!isNaN(validDate.getTime()))
    
    // Test invalid timestamp scenario
    const invalidDate = createSafeDate('invalid-date')
    assert.strictEqual(invalidDate, undefined)
    
    // Test empty string scenario
    const emptyDate = createSafeDate('')
    assert.strictEqual(emptyDate, undefined)
    
    // Test creating stat objects with various date scenarios
    const statWithValidDates = createStat({
      mtime: createSafeDate('2023-06-15T10:30:00.000Z'),
      atime: createSafeDate('2023-06-16T11:30:00.000Z'),
      ctime: createSafeDate('2023-06-14T09:30:00.000Z'),
      mode: 0o644,
      size: 1024
    })
    
    assert.ok(statWithValidDates.mtime > 0)
    assert.ok(statWithValidDates.atime > 0)
    assert.ok(statWithValidDates.ctime > 0)
    assert.strictEqual(statWithValidDates.size, 1024)
    
    // Test creating stat with no dates (should use defaults)
    const statWithNoDates = createStat({
      mode: 0o644,
      size: 512
    })
    
    assert.ok(statWithNoDates.mtime > 0) // Should have current time
    assert.ok(statWithNoDates.atime > 0)
    assert.ok(statWithNoDates.ctime > 0)
    assert.strictEqual(statWithNoDates.size, 512)
  })

  // Test path parsing with realistic Radio4000 filesystem paths
  it('should parse realistic filesystem paths correctly', async () => {
    const { parsePath } = await import('../../src/utils/path-utils.js')
    
    const testCases = [
      {
        path: '/channels/test-channel',
        expected: { root: 'channels', channel: 'test-channel', subdir: undefined }
      },
      {
        path: '/channels/test-channel/tracks',
        expected: { root: 'channels', channel: 'test-channel', subdir: 'tracks' }
      },
      {
        path: '/channels/test-channel/tracks/song-title.txt',
        expected: { root: 'channels', channel: 'test-channel', subdir: 'tracks', file: 'song-title.txt' }
      },
      {
        path: '/channels/test-channel/tags/electronic',
        expected: { root: 'channels', channel: 'test-channel', subdir: 'tags', file: 'electronic' }
      },
      {
        path: '/channels/test-channel/tags/electronic/song.txt',
        expected: { root: 'channels', channel: 'test-channel', subdir: 'tags', file: 'electronic', file2: 'song.txt' }
      }
    ]
    
    for (const testCase of testCases) {
      const result = parsePath(testCase.path)
      assert.strictEqual(result.root, testCase.expected.root, `Path: ${testCase.path} - root mismatch`)
      if (testCase.expected.channel) {
        assert.strictEqual(result.channel, testCase.expected.channel, `Path: ${testCase.path} - channel mismatch`)
      }
      if (testCase.expected.subdir) {
        assert.strictEqual(result.subdir, testCase.expected.subdir, `Path: ${testCase.path} - subdir mismatch`)
      }
      if (testCase.expected.file) {
        assert.strictEqual(result.file, testCase.expected.file, `Path: ${testCase.path} - file mismatch`)
      }
      if (testCase.expected.file2) {
        assert.strictEqual(result.file2, testCase.expected.file2, `Path: ${testCase.path} - file2 mismatch`)
      }
    }
  })

  // Test content utilities with realistic track data
  it('should format track content and extract tags properly', async () => {
    const { formatTrackContent } = await import('../../src/utils/content-utils.js')
    const { extractTagsFromTrack } = await import('../../src/utils/content-utils.js')
    
    // Test track with rich metadata
    const testTrack = {
      title: 'Test Song Title',
      url: 'https://youtube.com/watch?v=abc123',
      description: 'This is a #test track with #electronic #music elements',
      created_at: '2023-01-15T10:30:00.000Z',
      updated_at: '2023-06-20T14:45:00.000Z',
      discogs_url: 'https://discogs.com/release/12345'
    }
    
    // Test content formatting
    const formattedContent = formatTrackContent(testTrack)
    assert.ok(formattedContent.includes('Test Song Title'))
    assert.ok(formattedContent.includes('https://youtube.com/watch?v=abc123'))
    assert.ok(formattedContent.includes('This is a #test track'))
    assert.ok(formattedContent.includes('1/15/2023'))  // Date is formatted as M/D/YYYY
    assert.ok(formattedContent.includes('#test #electronic #music'))
    
    // Test tag extraction
    const extractedTags = extractTagsFromTrack(testTrack)
    assert.ok(extractedTags.includes('test'))
    assert.ok(extractedTags.includes('electronic'))
    assert.ok(extractedTags.includes('music'))
  })

  // Test filename sanitization with realistic track titles
  it('should sanitize track titles properly for filesystem compatibility', async () => {
    const { sanitizeFilename } = await import('../../src/utils/path-utils.js')
    
    const testCases = [
      { input: 'Artist - Song Title', expected: 'artist---song-title' },  // " - " becomes 3 dashes: space->dash, dash->dash, space->dash
      { input: 'Song with "Quotes" and (Parentheses)', expected: 'song-with-quotes-and-parentheses' },
      { input: 'Track & Symbol', expected: 'track-symbol' },
      { input: 'Special!@#$Characters%^&*()', expected: 'specialcharacters' },  // Special chars are removed, not replaced with dashes
      { input: 'Normal Title', expected: 'normal-title' },
      { input: 'Track featuring Artist ft. Guest', expected: 'track-featuring-artist-ft-guest' },
      { input: 'My Amazing Track [Official Video]', expected: 'my-amazing-track-official-video' }
    ]
    
    for (const testCase of testCases) {
      const result = sanitizeFilename(testCase.input)
      assert.strictEqual(result, testCase.expected, `Input: "${testCase.input}" -> Expected: "${testCase.expected}", Got: "${result}"`)
    }
  })
})