import { createHash } from 'crypto'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { homedir } from 'os'

const CACHE_DIR = join(homedir(), '.config', 'ynab-tui')
const CACHE_FILE = join(CACHE_DIR, 'ai-cache.json')

interface CacheEntry {
  response: unknown
  timestamp: number
}

type Cache = Record<string, CacheEntry>

// Cache TTL: 30 days (responses don't change for same input)
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000

let memoryCache: Cache | null = null

/**
 * Generate a cache key from input parameters
 */
export const generateCacheKey = (type: string, ...inputs: string[]): string => {
  const data = [type, ...inputs].join('|')
  return createHash('md5').update(data).digest('hex')
}

/**
 * Load cache from disk
 */
const loadCache = async (): Promise<Cache> => {
  if (memoryCache) return memoryCache

  try {
    const data = await readFile(CACHE_FILE, 'utf-8')
    memoryCache = JSON.parse(data)
    return memoryCache!
  } catch {
    memoryCache = {}
    return memoryCache
  }
}

/**
 * Save cache to disk
 */
const saveCache = async (cache: Cache): Promise<void> => {
  try {
    await mkdir(dirname(CACHE_FILE), { recursive: true })
    await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2))
    memoryCache = cache
  } catch {
    // Ignore save errors
  }
}

/**
 * Get cached response if available and not expired
 */
export const getCachedResponse = async <T>(key: string): Promise<T | null> => {
  const cache = await loadCache()
  const entry = cache[key]

  if (!entry) return null

  // Check if expired
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    delete cache[key]
    await saveCache(cache)
    return null
  }

  return entry.response as T
}

/**
 * Store response in cache
 */
export const setCachedResponse = async <T>(key: string, response: T): Promise<void> => {
  const cache = await loadCache()
  cache[key] = {
    response,
    timestamp: Date.now(),
  }
  await saveCache(cache)
}

/**
 * Clear expired entries from cache
 */
export const cleanupCache = async (): Promise<number> => {
  const cache = await loadCache()
  const now = Date.now()
  let removed = 0

  for (const key of Object.keys(cache)) {
    if (now - cache[key].timestamp > CACHE_TTL_MS) {
      delete cache[key]
      removed++
    }
  }

  if (removed > 0) {
    await saveCache(cache)
  }

  return removed
}

/**
 * Get cache stats
 */
export const getCacheStats = async (): Promise<{ entries: number; sizeKb: number }> => {
  const cache = await loadCache()
  const entries = Object.keys(cache).length
  const sizeKb = Math.round(JSON.stringify(cache).length / 1024)
  return { entries, sizeKb }
}
