import assert from 'assert'
import { cache, cachedCall } from '../src/cache.js'
import { assertEquals } from './helpers.js'

export default function(runner) {
  runner.test('cache: set and get', async () => {
    cache.clear()
    cache.set('test-key', 'test-value')
    const value = cache.get('test-key')
    assertEquals(value, 'test-value')
  })

  runner.test('cache: get non-existent key returns null', async () => {
    cache.clear()
    const value = cache.get('non-existent')
    assertEquals(value, null)
  })

  runner.test('cache: expired values return null', async () => {
    cache.clear()
    cache.set('expiring-key', 'expiring-value', 10) // 10ms TTL

    // Should exist immediately
    let value = cache.get('expiring-key')
    assertEquals(value, 'expiring-value')

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 20))

    // Should be null after expiration
    value = cache.get('expiring-key')
    assertEquals(value, null)
  })

  runner.test('cache: delete removes key', async () => {
    cache.clear()
    cache.set('delete-me', 'value')
    assertEquals(cache.get('delete-me'), 'value')

    cache.delete('delete-me')
    assertEquals(cache.get('delete-me'), null)
  })

  runner.test('cache: clear removes all keys', async () => {
    cache.clear()
    cache.set('key1', 'value1')
    cache.set('key2', 'value2')
    cache.set('key3', 'value3')

    cache.clear()

    assertEquals(cache.get('key1'), null)
    assertEquals(cache.get('key2'), null)
    assertEquals(cache.get('key3'), null)
  })

  runner.test('cachedCall: caches function result', async () => {
    cache.clear()
    let callCount = 0

    const testFn = async () => {
      callCount++
      return 'result'
    }

    const result1 = await cachedCall('fn-key', testFn)
    assertEquals(result1, 'result')
    assertEquals(callCount, 1)

    // Second call should use cache
    const result2 = await cachedCall('fn-key', testFn)
    assertEquals(result2, 'result')
    assertEquals(callCount, 1) // Should not have called function again
  })

  runner.test('cachedCall: calls function on cache miss', async () => {
    cache.clear()
    let callCount = 0

    const testFn = async () => {
      callCount++
      return `result-${callCount}`
    }

    const result1 = await cachedCall('key1', testFn)
    assertEquals(result1, 'result-1')

    const result2 = await cachedCall('key2', testFn)
    assertEquals(result2, 'result-2')

    assertEquals(callCount, 2)
  })

  runner.test('cache: handles complex objects', async () => {
    cache.clear()
    const obj = { foo: 'bar', nested: { value: 42 } }
    cache.set('complex', obj)

    const retrieved = cache.get('complex')
    assertEquals(retrieved, obj)
  })
}
