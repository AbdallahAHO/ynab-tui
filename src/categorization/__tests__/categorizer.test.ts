import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockTransaction, createMockPayeeRule, createMockCategory } from '../../test-utils/fixtures.js'
import type { AIContext } from '../../shared/ai-context.js'

// Create hoisted mock functions that can be referenced in vi.mock factories
const { mockGenerateObject, mockGetCachedResponse, mockSetCachedResponse } = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(),
  mockGetCachedResponse: vi.fn(),
  mockSetCachedResponse: vi.fn(),
}))

// Mock dependencies using hoisted mocks
vi.mock('ai', () => ({
  generateObject: mockGenerateObject,
}))

vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: () => () => ({ modelId: 'mock-model' }),
}))

vi.mock('../../shared/ai-cache.js', () => ({
  generateCacheKey: vi.fn(() => 'mock-cache-key'),
  getCachedResponse: mockGetCachedResponse,
  setCachedResponse: mockSetCachedResponse,
}))

// Import the module under test
import { createCategorizer } from '../categorizer.js'

const createMockAIContext = (): AIContext => ({
  user: {},
  accounts: {
    list: [{ id: 'account-1', name: 'Checking', type: 'checking' }],
    contexts: {},
  },
  payees: {
    rules: [],
    tagIndex: new Map(),
  },
  categories: {
    list: [
      createMockCategory({ id: 'cat-groceries', name: 'Groceries' }),
      createMockCategory({ id: 'cat-shopping', name: 'Shopping' }),
      createMockCategory({ id: 'cat-bills', name: 'Bills' }),
    ],
    formatted: '- cat-groceries: Groceries\n- cat-shopping: Shopping\n- cat-bills: Bills',
  },
  patterns: {
    historical: [],
  },
})

describe('createCategorizer', () => {
  const config = {
    openRouterApiKey: 'test-api-key',
    model: 'test-model',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('categorize', () => {
    it('uses payee rule when available (0.99 confidence)', async () => {
      const context = createMockAIContext()
      context.payees.rules = [
        createMockPayeeRule({
          payeeName: 'AMAZON',
          normalizedName: 'amazon',
          displayName: 'Amazon',
          defaultCategoryId: 'cat-shopping',
          defaultCategoryName: 'Shopping',
        }),
      ]

      const categorizer = createCategorizer(config, context)
      const result = await categorizer.categorize(
        createMockTransaction({ payee_name: 'AMAZON' })
      )

      expect(result.categoryId).toBe('cat-shopping')
      expect(result.categoryName).toBe('Shopping')
      expect(result.confidence).toBe(0.99)
      expect(result.reasoning).toContain('Matched payee rule')
      expect(mockGenerateObject).not.toHaveBeenCalled()
    })

    it('returns cached result when available', async () => {
      const cachedResult = {
        categoryId: 'cat-groceries',
        categoryName: 'Groceries',
        confidence: 0.9,
        reasoning: 'Cached result',
        alternatives: [],
      }
      mockGetCachedResponse.mockImplementation(() => Promise.resolve(cachedResult))

      const context = createMockAIContext()
      const categorizer = createCategorizer(config, context)
      const result = await categorizer.categorize(
        createMockTransaction({ payee_name: 'Lidl', memo: null })
      )

      expect(result).toEqual(cachedResult)
      expect(mockGenerateObject).not.toHaveBeenCalled()
    })

    it('skips cache for transactions with memo', async () => {
      mockGetCachedResponse.mockResolvedValue(null)
      mockGenerateObject.mockResolvedValue({
        object: {
          categoryId: 'cat-groceries',
          categoryName: 'Groceries',
          confidence: 0.85,
          reasoning: 'AI result',
          alternatives: [],
        },
      })

      const context = createMockAIContext()
      const categorizer = createCategorizer(config, context)
      await categorizer.categorize(
        createMockTransaction({ payee_name: 'Lidl', memo: 'Weekly shopping' })
      )

      // Should not check cache for transactions with memo
      expect(mockGetCachedResponse).not.toHaveBeenCalled()
    })

    it('validates category ID exists', async () => {
      mockGetCachedResponse.mockResolvedValue(null)
      mockGenerateObject.mockResolvedValue({
        object: {
          categoryId: 'invalid-id', // ID doesn't exist
          categoryName: 'Groceries', // But name matches
          confidence: 0.85,
          reasoning: 'AI result',
          alternatives: [],
        },
      })

      const context = createMockAIContext()
      const categorizer = createCategorizer(config, context)
      const result = await categorizer.categorize(
        createMockTransaction({ payee_name: 'Lidl', memo: null })
      )

      // Should have fixed the ID to match the name
      expect(result.categoryId).toBe('cat-groceries')
    })

    it('calls AI when no payee rule and no cache', async () => {
      mockGetCachedResponse.mockResolvedValue(null)
      mockGenerateObject.mockResolvedValue({
        object: {
          categoryId: 'cat-groceries',
          categoryName: 'Groceries',
          confidence: 0.85,
          reasoning: 'AI analyzed',
          alternatives: [],
        },
      })

      const context = createMockAIContext()
      const categorizer = createCategorizer(config, context)
      await categorizer.categorize(
        createMockTransaction({ payee_name: 'New Store', memo: null })
      )

      expect(mockGenerateObject).toHaveBeenCalled()
    })

    it('caches AI results', async () => {
      mockGetCachedResponse.mockResolvedValue(null)
      mockGenerateObject.mockResolvedValue({
        object: {
          categoryId: 'cat-groceries',
          categoryName: 'Groceries',
          confidence: 0.85,
          reasoning: 'AI analyzed',
          alternatives: [],
        },
      })

      const context = createMockAIContext()
      const categorizer = createCategorizer(config, context)
      await categorizer.categorize(
        createMockTransaction({ payee_name: 'New Store', memo: null })
      )

      expect(mockSetCachedResponse).toHaveBeenCalled()
    })

    it('normalizes payee name for rule matching', async () => {
      const context = createMockAIContext()
      context.payees.rules = [
        createMockPayeeRule({
          payeeName: 'AMAZON.COM',
          normalizedName: 'amazoncom',
          displayName: 'Amazon',
          defaultCategoryId: 'cat-shopping',
          defaultCategoryName: 'Shopping',
        }),
      ]

      const categorizer = createCategorizer(config, context)
      const result = await categorizer.categorize(
        createMockTransaction({ payee_name: 'AMAZON.COM*AMZN' }) // Different format
      )

      // Should NOT match because normalized name is different
      // 'amazoncomamzn' !== 'amazoncom'
      expect(mockGenerateObject).toHaveBeenCalled()
    })
  })

  describe('categorizeBatch', () => {
    it('processes multiple transactions', async () => {
      mockGetCachedResponse.mockResolvedValue(null)
      mockGenerateObject.mockResolvedValue({
        object: {
          categoryId: 'cat-groceries',
          categoryName: 'Groceries',
          confidence: 0.85,
          reasoning: 'AI result',
          alternatives: [],
        },
      })

      const context = createMockAIContext()
      const categorizer = createCategorizer(config, context)
      const results = await categorizer.categorizeBatch([
        createMockTransaction({ id: 'tx-1', payee_name: 'Store 1' }),
        createMockTransaction({ id: 'tx-2', payee_name: 'Store 2' }),
      ])

      expect(results.size).toBe(2)
      expect(results.has('tx-1')).toBe(true)
      expect(results.has('tx-2')).toBe(true)
    })

    it('returns map of results', async () => {
      mockGetCachedResponse.mockResolvedValue(null)
      mockGenerateObject.mockResolvedValue({
        object: {
          categoryId: 'cat-groceries',
          categoryName: 'Groceries',
          confidence: 0.85,
          reasoning: 'AI result',
          alternatives: [],
        },
      })

      const context = createMockAIContext()
      const categorizer = createCategorizer(config, context)
      const results = await categorizer.categorizeBatch([
        createMockTransaction({ id: 'tx-1', payee_name: 'Store' }),
      ])

      expect(results).toBeInstanceOf(Map)
      const result = results.get('tx-1')
      expect(result?.categoryId).toBe('cat-groceries')
    })

    it('handles partial failures gracefully', async () => {
      mockGetCachedResponse.mockResolvedValue(null)
      mockGenerateObject
        .mockResolvedValueOnce({
          object: {
            categoryId: 'cat-groceries',
            categoryName: 'Groceries',
            confidence: 0.85,
            reasoning: 'Success',
            alternatives: [],
          },
        })
        .mockRejectedValueOnce(new Error('API error'))

      const context = createMockAIContext()
      const categorizer = createCategorizer(config, context)
      const results = await categorizer.categorizeBatch([
        createMockTransaction({ id: 'tx-1', payee_name: 'Store 1' }),
        createMockTransaction({ id: 'tx-2', payee_name: 'Store 2' }),
      ])

      expect(results.size).toBe(2)

      const success = results.get('tx-1')
      expect(success?.confidence).toBe(0.85)

      const failure = results.get('tx-2')
      expect(failure?.confidence).toBe(0)
      expect(failure?.reasoning).toContain('Failed to categorize')
    })

    it('handles empty transaction list', async () => {
      const context = createMockAIContext()
      const categorizer = createCategorizer(config, context)
      const results = await categorizer.categorizeBatch([])

      expect(results.size).toBe(0)
    })
  })
})
