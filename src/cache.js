import { config } from './config.js'

/**
 * Simple in-memory cache with TTL
 */
class Cache {
  constructor() {
    this.data = new Map()
  }

  /**
   * Get value from cache if not expired
   */
  get(key) {
    const item = this.data.get(key)
    if (!item) return null

    if (Date.now() > item.expires) {
      this.data.delete(key)
      return null
    }

    return item.value
  }

  /**
   * Set value in cache with TTL
   */
  set(key, value, ttl = config.cacheTTL) {
    this.data.set(key, {
      value,
      expires: Date.now() + ttl
    })
  }

  /**
   * Clear all cache
   */
  clear() {
    this.data.clear()
  }

  /**
   * Remove specific key
   */
  delete(key) {
    this.data.delete(key)
  }
}

export const cache = new Cache()

/**
 * Cached wrapper for SDK calls
 */
export async function cachedCall(key, fn) {
  const cached = cache.get(key)
  if (cached !== null) {
    return cached
  }

  const result = await fn()
  cache.set(key, result)
  return result
}
