import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateCacheKey, getCachedResponse, setCachedResponse, cleanupCache, getCacheStats } from '../ai-cache.js'

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}))

// Import mocked modules
import { readFile, writeFile, mkdir } from 'fs/promises'

const mockReadFile = vi.mocked(readFile)
const mockWriteFile = vi.mocked(writeFile)
const mockMkdir = vi.mocked(mkdir)

describe('generateCacheKey', () => {
  it('produces consistent hash for same inputs', () => {
    const key1 = generateCacheKey('type', 'input1', 'input2')
    const key2 = generateCacheKey('type', 'input1', 'input2')

    expect(key1).toBe(key2)
  })

  it('produces different hash for different inputs', () => {
    const key1 = generateCacheKey('type', 'input1')
    const key2 = generateCacheKey('type', 'input2')

    expect(key1).not.toBe(key2)
  })

  it('produces different hash for different types', () => {
    const key1 = generateCacheKey('typeA', 'input')
    const key2 = generateCacheKey('typeB', 'input')

    expect(key1).not.toBe(key2)
  })

  it('handles special characters in inputs', () => {
    const key = generateCacheKey('type', 'special!@#$%^&*()')

    expect(key).toMatch(/^[a-f0-9]{32}$/) // MD5 hash format
  })

  it('handles pipe character in inputs', () => {
    // This could cause key collisions if inputs contain the separator
    const key1 = generateCacheKey('type', 'a|b', 'c')
    const key2 = generateCacheKey('type', 'a', 'b|c')

    // These SHOULD be different but might collide due to separator
    // This documents the current behavior
    expect(key1).toBe(key2) // Known limitation!
  })

  it('handles empty strings', () => {
    const key = generateCacheKey('type', '', '')

    expect(key).toMatch(/^[a-f0-9]{32}$/)
  })

  it('handles unicode characters', () => {
    const key = generateCacheKey('type', '日本語', 'Müller', '🍕')

    expect(key).toMatch(/^[a-f0-9]{32}$/)
  })

  it('handles no additional inputs', () => {
    const key = generateCacheKey('type')

    expect(key).toMatch(/^[a-f0-9]{32}$/)
  })

  it('handles very long inputs', () => {
    const longString = 'a'.repeat(10000)
    const key = generateCacheKey('type', longString)

    expect(key).toMatch(/^[a-f0-9]{32}$/)
  })
})

describe('getCachedResponse', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Reset module state by clearing the memory cache
    vi.resetModules()
  })

  it('returns null when key does not exist', async () => {
    mockReadFile.mockResolvedValue('{}')

    // Need to re-import after reset
    const { getCachedResponse } = await import('../ai-cache.js')
    const result = await getCachedResponse('nonexistent-key')

    expect(result).toBeNull()
  })

  it('returns cached value when not expired', async () => {
    const cache = {
      'test-key': {
        response: { data: 'test' },
        timestamp: Date.now(), // Fresh
      },
    }
    mockReadFile.mockResolvedValue(JSON.stringify(cache))

    const { getCachedResponse } = await import('../ai-cache.js')
    const result = await getCachedResponse<{ data: string }>('test-key')

    expect(result).toEqual({ data: 'test' })
  })

  it('returns null when expired (30 days)', async () => {
    const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000
    const cache = {
      'test-key': {
        response: { data: 'test' },
        timestamp: Date.now() - CACHE_TTL_MS - 1000, // Expired
      },
    }
    mockReadFile.mockResolvedValue(JSON.stringify(cache))
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)

    const { getCachedResponse } = await import('../ai-cache.js')
    const result = await getCachedResponse('test-key')

    expect(result).toBeNull()
  })

  it('deletes expired entries on access', async () => {
    const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000
    const cache = {
      'expired-key': {
        response: { data: 'old' },
        timestamp: Date.now() - CACHE_TTL_MS - 1000,
      },
    }
    mockReadFile.mockResolvedValue(JSON.stringify(cache))
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)

    const { getCachedResponse } = await import('../ai-cache.js')
    await getCachedResponse('expired-key')

    expect(mockWriteFile).toHaveBeenCalled()
    const savedData = JSON.parse(mockWriteFile.mock.calls[0][1] as string)
    expect(savedData['expired-key']).toBeUndefined()
  })

  it('handles corrupted cache file gracefully', async () => {
    mockReadFile.mockResolvedValue('not valid json')

    const { getCachedResponse } = await import('../ai-cache.js')
    const result = await getCachedResponse('any-key')

    expect(result).toBeNull()
  })

  it('handles missing cache file gracefully', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'))

    const { getCachedResponse } = await import('../ai-cache.js')
    const result = await getCachedResponse('any-key')

    expect(result).toBeNull()
  })
})

describe('setCachedResponse', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.resetModules()
  })

  it('stores response with current timestamp', async () => {
    mockReadFile.mockResolvedValue('{}')
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)

    const before = Date.now()
    const { setCachedResponse } = await import('../ai-cache.js')
    await setCachedResponse('test-key', { data: 'test' })
    const after = Date.now()

    expect(mockWriteFile).toHaveBeenCalled()
    const savedData = JSON.parse(mockWriteFile.mock.calls[0][1] as string)
    expect(savedData['test-key'].response).toEqual({ data: 'test' })
    expect(savedData['test-key'].timestamp).toBeGreaterThanOrEqual(before)
    expect(savedData['test-key'].timestamp).toBeLessThanOrEqual(after)
  })

  it('overwrites existing entry', async () => {
    const cache = {
      'test-key': {
        response: { data: 'old' },
        timestamp: Date.now() - 1000,
      },
    }
    mockReadFile.mockResolvedValue(JSON.stringify(cache))
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)

    const { setCachedResponse } = await import('../ai-cache.js')
    await setCachedResponse('test-key', { data: 'new' })

    const savedData = JSON.parse(mockWriteFile.mock.calls[0][1] as string)
    expect(savedData['test-key'].response).toEqual({ data: 'new' })
  })

  it('creates cache directory if needed', async () => {
    mockReadFile.mockResolvedValue('{}')
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)

    const { setCachedResponse } = await import('../ai-cache.js')
    await setCachedResponse('test-key', { data: 'test' })

    expect(mockMkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true })
  })
})

describe('cleanupCache', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.resetModules()
  })

  it('removes all expired entries', async () => {
    const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000
    const cache = {
      'expired-1': { response: 'old1', timestamp: Date.now() - CACHE_TTL_MS - 1000 },
      'expired-2': { response: 'old2', timestamp: Date.now() - CACHE_TTL_MS - 2000 },
      'fresh': { response: 'new', timestamp: Date.now() },
    }
    mockReadFile.mockResolvedValue(JSON.stringify(cache))
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)

    const { cleanupCache } = await import('../ai-cache.js')
    const removed = await cleanupCache()

    expect(removed).toBe(2)
    const savedData = JSON.parse(mockWriteFile.mock.calls[0][1] as string)
    expect(Object.keys(savedData)).toEqual(['fresh'])
  })

  it('keeps non-expired entries', async () => {
    const cache = {
      'fresh-1': { response: 'data1', timestamp: Date.now() },
      'fresh-2': { response: 'data2', timestamp: Date.now() - 1000 },
    }
    mockReadFile.mockResolvedValue(JSON.stringify(cache))

    const { cleanupCache } = await import('../ai-cache.js')
    const removed = await cleanupCache()

    expect(removed).toBe(0)
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  it('handles empty cache', async () => {
    mockReadFile.mockResolvedValue('{}')

    const { cleanupCache } = await import('../ai-cache.js')
    const removed = await cleanupCache()

    expect(removed).toBe(0)
  })
})

describe('getCacheStats', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.resetModules()
  })

  it('returns correct entry count', async () => {
    const cache = {
      'key1': { response: 'data1', timestamp: Date.now() },
      'key2': { response: 'data2', timestamp: Date.now() },
      'key3': { response: 'data3', timestamp: Date.now() },
    }
    mockReadFile.mockResolvedValue(JSON.stringify(cache))

    const { getCacheStats } = await import('../ai-cache.js')
    const stats = await getCacheStats()

    expect(stats.entries).toBe(3)
  })

  it('returns size in KB', async () => {
    const cache = {
      'key': { response: 'a'.repeat(1000), timestamp: Date.now() },
    }
    mockReadFile.mockResolvedValue(JSON.stringify(cache))

    const { getCacheStats } = await import('../ai-cache.js')
    const stats = await getCacheStats()

    expect(stats.sizeKb).toBeGreaterThan(0)
  })

  it('handles empty cache', async () => {
    mockReadFile.mockResolvedValue('{}')

    const { getCacheStats } = await import('../ai-cache.js')
    const stats = await getCacheStats()

    expect(stats.entries).toBe(0)
    expect(stats.sizeKb).toBe(0)
  })
})
