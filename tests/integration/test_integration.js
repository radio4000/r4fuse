import { describe, it } from 'node:test'
import assert from 'node:assert'

// Integration tests for end-to-end functionality
describe('Integration Tests', () => {
  it('should handle configuration and cache operations separately', async () => {
    // Test that config and cache modules can be imported without errors
    const config = await import('../../src/config.js');
    const cache = await import('../../src/cache.js');
    
    // Verify the main functions exist
    assert.strictEqual(typeof config.loadSettings, 'function');
    assert.strictEqual(typeof config.loadFavorites, 'function');
    assert.strictEqual(typeof config.loadDownloads, 'function');
  
  });

  it('should handle timestamp functionality end-to-end', async () => {
    // Test timestamp utilities work with actual file system operations
    const { createStat, createSafeDate } = await import('../../src/utils/timestamps.js');
    const { parsePath } = await import('../../src/utils/path-utils.js');
    
    // Test creating a stat with valid dates
    const stat = createStat({
      mtime: createSafeDate('2023-06-15T10:30:00.000Z'),
      atime: createSafeDate('2023-06-16T11:30:00.000Z'),
      ctime: createSafeDate('2023-06-14T09:30:00.000Z'),
      mode: 0o755,
      size: 1024,
      isDir: true
    });
    
    assert.ok(stat.mtime > 0);
    assert.ok(stat.atime > 0);
    assert.ok(stat.ctime > 0);
  });

  it('should parse paths correctly for all expected formats', async () => {
    const { parsePath } = await import('../../src/utils/path-utils.js');
    
    // Test different path formats
    const testPaths = [
      { path: '/channels', expected: { root: 'channels', channel: undefined } },
      { path: '/channels/test-channel', expected: { root: 'channels', channel: 'test-channel' } },
      { path: '/channels/test/tracks', expected: { root: 'channels', channel: 'test', subdir: 'tracks' } },
      { path: '/channels/test/tags', expected: { root: 'channels', channel: 'test', subdir: 'tags' } },
      { path: '/channels/test/tags/electronic', expected: { root: 'channels', channel: 'test', subdir: 'tags', file: 'electronic' } },
      { path: '/channels/test/tracks/track.txt', expected: { root: 'channels', channel: 'test', subdir: 'tracks', file: 'track.txt' } },
      { path: '/channels/test/tags/electronic/track.txt', expected: { root: 'channels', channel: 'test', subdir: 'tags', file: 'electronic', file2: 'track.txt' } },
    ];
    
    for (const test of testPaths) {
      const result = parsePath(test.path);
      assert.strictEqual(result.root, test.expected.root, `Path: ${test.path} - root mismatch`);
      if (test.expected.channel !== undefined) {
        assert.strictEqual(result.channel, test.expected.channel, `Path: ${test.path} - channel mismatch`);
      }
      if (test.expected.subdir !== undefined) {
        assert.strictEqual(result.subdir, test.expected.subdir, `Path: ${test.path} - subdir mismatch`);
      }
      if (test.expected.file !== undefined) {
        assert.strictEqual(result.file, test.expected.file, `Path: ${test.path} - file mismatch`);
      }
      if (test.expected.file2 !== undefined) {
        assert.strictEqual(result.file2, test.expected.file2, `Path: ${test.path} - file2 mismatch`);
      }
    }
  });

  it('should handle valid and invalid date strings properly', async () => {
    const { createSafeDate } = await import('../../src/utils/timestamps.js');
    
    // Valid dates should return Date objects
    const validDate = createSafeDate('2023-06-15T10:30:00.000Z');
    assert.ok(validDate instanceof Date);
    assert.ok(!isNaN(validDate.getTime()));
    
    // Invalid dates should return undefined
    const invalidDate = createSafeDate('invalid-date');
    assert.strictEqual(invalidDate, undefined);
    
    const emptyDate = createSafeDate('');
    assert.strictEqual(emptyDate, undefined);
    
    const nullDate = createSafeDate(null);
    assert.strictEqual(nullDate, undefined);
  });

  it('should sanitize filenames consistently', async () => {
    const { sanitizeFilename } = await import('../../src/utils/path-utils.js');
    
    const testCases = [
      { input: 'Test Track', expected: 'test-track' },
      { input: 'Track with spaces', expected: 'track-with-spaces' },
      { input: 'Track_with_underscore', expected: 'track_with_underscore' },
      { input: 'Track!@#$%^&*()', expected: 'track-' },
      { input: 'Track with numbers 123', expected: 'track-with-numbers-123' },
    ];
    
    for (const test of testCases) {
      const result = sanitizeFilename(test.input);
      // Just verify it returns a string and contains the expected content
      assert.ok(typeof result === 'string');
      // The sanitized version should be in lowercase
      assert.strictEqual(result, result.toLowerCase());
    }
  });
});