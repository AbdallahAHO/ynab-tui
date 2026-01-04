import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockPayeeRule, createMockCategory } from '../../test-utils/fixtures.js'
import type { Payee } from '../../shared/ynab-client.js'

// Create hoisted mock functions
const {
  mockLoadPayeeRules,
  mockSavePayeeRules,
  mockUpdatePayeeRulesAtomic,
  mockGenerateObject,
  mockGetCachedResponse,
  mockSetCachedResponse,
} = vi.hoisted(() => ({
  mockLoadPayeeRules: vi.fn(),
  mockSavePayeeRules: vi.fn(),
  mockUpdatePayeeRulesAtomic: vi.fn(),
  mockGenerateObject: vi.fn(),
  mockGetCachedResponse: vi.fn(),
  mockSetCachedResponse: vi.fn(),
}))

// Mock dependencies
vi.mock('../../config/config-service.js', () => ({
  loadPayeeRules: mockLoadPayeeRules,
  savePayeeRules: mockSavePayeeRules,
  updatePayeeRulesAtomic: mockUpdatePayeeRulesAtomic,
}))

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

// Import functions under test
import {
  syncPayeesWithYnab,
  getNewPayees,
  findPayeeRule,
  updatePayeeRule,
  markPayeeConfigured,
  getAllPayeeRules,
  setPayeeCategory,
  improvePayeeWithAI,
} from '../payee-service.js'

describe('syncPayeesWithYnab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates new rules for new YNAB payees', async () => {
    mockLoadPayeeRules.mockResolvedValue([])
    mockSavePayeeRules.mockResolvedValue(undefined)

    const ynabPayees: Payee[] = [
      { id: 'payee-1', name: 'Amazon', deleted: false, transfer_account_id: null },
      { id: 'payee-2', name: 'Netflix', deleted: false, transfer_account_id: null },
    ]

    const result = await syncPayeesWithYnab(ynabPayees)

    expect(result.newPayees).toHaveLength(2)
    expect(result.updatedCount).toBe(0)
    expect(result.totalCount).toBe(2)
    expect(result.newPayees[0].isNew).toBe(true)
  })

  it('updates lastSeen for existing payees', async () => {
    const existingRule = createMockPayeeRule({
      payeeId: 'payee-1',
      payeeName: 'Amazon',
      lastSeen: '2024-01-01',
    })
    mockLoadPayeeRules.mockResolvedValue([existingRule])
    mockSavePayeeRules.mockResolvedValue(undefined)

    const ynabPayees: Payee[] = [
      { id: 'payee-1', name: 'Amazon', deleted: false, transfer_account_id: null },
    ]

    const result = await syncPayeesWithYnab(ynabPayees)

    expect(result.newPayees).toHaveLength(0)
    expect(result.updatedCount).toBe(1)
    expect(mockSavePayeeRules).toHaveBeenCalled()
    const savedRules = mockSavePayeeRules.mock.calls[0][0]
    expect(savedRules[0].lastSeen).not.toBe('2024-01-01') // Updated
  })

  it('preserves existing rule configuration on update', async () => {
    const existingRule = createMockPayeeRule({
      payeeId: 'payee-1',
      payeeName: 'Amazon',
      displayName: 'Amazon.com',
      defaultCategoryId: 'cat-shopping',
      aiTags: ['ecommerce'],
    })
    mockLoadPayeeRules.mockResolvedValue([existingRule])
    mockSavePayeeRules.mockResolvedValue(undefined)

    const ynabPayees: Payee[] = [
      { id: 'payee-1', name: 'AMAZON', deleted: false, transfer_account_id: null },
    ]

    await syncPayeesWithYnab(ynabPayees)

    const savedRules = mockSavePayeeRules.mock.calls[0][0]
    expect(savedRules[0].displayName).toBe('Amazon.com')
    expect(savedRules[0].defaultCategoryId).toBe('cat-shopping')
    expect(savedRules[0].aiTags).toEqual(['ecommerce'])
  })

  it('handles mixed new and existing payees', async () => {
    const existingRule = createMockPayeeRule({
      payeeId: 'payee-1',
      payeeName: 'Amazon',
    })
    mockLoadPayeeRules.mockResolvedValue([existingRule])
    mockSavePayeeRules.mockResolvedValue(undefined)

    const ynabPayees: Payee[] = [
      { id: 'payee-1', name: 'Amazon', deleted: false, transfer_account_id: null },
      { id: 'payee-2', name: 'Netflix', deleted: false, transfer_account_id: null },
    ]

    const result = await syncPayeesWithYnab(ynabPayees)

    expect(result.newPayees).toHaveLength(1)
    expect(result.updatedCount).toBe(1)
    expect(result.totalCount).toBe(2)
  })
})

describe('getNewPayees', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns only payees with isNew flag', async () => {
    const rules = [
      createMockPayeeRule({ payeeId: '1', isNew: true }),
      createMockPayeeRule({ payeeId: '2', isNew: false }),
      createMockPayeeRule({ payeeId: '3', isNew: true }),
    ]
    mockLoadPayeeRules.mockResolvedValue(rules)

    const result = await getNewPayees()

    expect(result).toHaveLength(2)
    expect(result.every((r) => r.isNew)).toBe(true)
  })

  it('returns empty array when no new payees', async () => {
    const rules = [
      createMockPayeeRule({ payeeId: '1', isNew: false }),
      createMockPayeeRule({ payeeId: '2', isNew: false }),
    ]
    mockLoadPayeeRules.mockResolvedValue(rules)

    const result = await getNewPayees()

    expect(result).toHaveLength(0)
  })
})

describe('findPayeeRule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('finds payee by normalized name', async () => {
    const rules = [
      createMockPayeeRule({ payeeId: '1', payeeName: 'AMAZON', normalizedName: 'amazon' }),
      createMockPayeeRule({ payeeId: '2', payeeName: 'Netflix', normalizedName: 'netflix' }),
    ]
    mockLoadPayeeRules.mockResolvedValue(rules)

    const result = await findPayeeRule('Amazon')

    expect(result?.payeeId).toBe('1')
  })

  it('returns undefined when payee not found', async () => {
    const rules = [createMockPayeeRule({ normalizedName: 'amazon' })]
    mockLoadPayeeRules.mockResolvedValue(rules)

    const result = await findPayeeRule('Netflix')

    expect(result).toBeUndefined()
  })

  it('matches case-insensitively via normalization', async () => {
    const rules = [createMockPayeeRule({ payeeId: '1', normalizedName: 'amazoncom' })]
    mockLoadPayeeRules.mockResolvedValue(rules)

    const result = await findPayeeRule('AMAZON.COM')

    expect(result?.payeeId).toBe('1')
  })
})

describe('updatePayeeRule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates specified fields atomically', async () => {
    mockUpdatePayeeRulesAtomic.mockImplementation(async (fn: Function) => {
      const rules = [
        createMockPayeeRule({ payeeId: 'payee-1', displayName: 'Old Name' }),
      ]
      fn(rules)
    })

    await updatePayeeRule('payee-1', { displayName: 'New Name' })

    expect(mockUpdatePayeeRulesAtomic).toHaveBeenCalled()
  })

  it('preserves unspecified fields', async () => {
    let capturedRules: any[] = []
    mockUpdatePayeeRulesAtomic.mockImplementation(async (fn: Function) => {
      const rules = [
        createMockPayeeRule({
          payeeId: 'payee-1',
          displayName: 'Original',
          defaultCategoryId: 'cat-1',
          aiTags: ['tag1'],
        }),
      ]
      capturedRules = fn(rules)
    })

    await updatePayeeRule('payee-1', { displayName: 'Updated' })

    expect(capturedRules[0].displayName).toBe('Updated')
    expect(capturedRules[0].defaultCategoryId).toBe('cat-1')
    expect(capturedRules[0].aiTags).toEqual(['tag1'])
  })

  it('returns unchanged rules if payee not found', async () => {
    let capturedRules: any[] = []
    mockUpdatePayeeRulesAtomic.mockImplementation(async (fn: Function) => {
      const rules = [createMockPayeeRule({ payeeId: 'other-id' })]
      capturedRules = fn(rules)
    })

    await updatePayeeRule('non-existent', { displayName: 'New' })

    expect(capturedRules[0].displayName).not.toBe('New')
  })
})

describe('markPayeeConfigured', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets isNew to false', async () => {
    let capturedRules: any[] = []
    mockUpdatePayeeRulesAtomic.mockImplementation(async (fn: Function) => {
      const rules = [createMockPayeeRule({ payeeId: 'payee-1', isNew: true })]
      capturedRules = fn(rules)
    })

    await markPayeeConfigured('payee-1')

    expect(capturedRules[0].isNew).toBe(false)
  })
})

describe('getAllPayeeRules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns all rules sorted by lastSeen descending', async () => {
    const rules = [
      createMockPayeeRule({ payeeId: '1', lastSeen: '2024-01-01' }),
      createMockPayeeRule({ payeeId: '2', lastSeen: '2024-06-01' }),
      createMockPayeeRule({ payeeId: '3', lastSeen: '2024-03-01' }),
    ]
    mockLoadPayeeRules.mockResolvedValue(rules)

    const result = await getAllPayeeRules()

    expect(result[0].payeeId).toBe('2') // Most recent
    expect(result[1].payeeId).toBe('3')
    expect(result[2].payeeId).toBe('1') // Oldest
  })

  it('returns empty array when no rules', async () => {
    mockLoadPayeeRules.mockResolvedValue([])

    const result = await getAllPayeeRules()

    expect(result).toEqual([])
  })
})

describe('setPayeeCategory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets category and marks as configured', async () => {
    let capturedRules: any[] = []
    mockUpdatePayeeRulesAtomic.mockImplementation(async (fn: Function) => {
      const rules = [createMockPayeeRule({ payeeId: 'payee-1', isNew: true })]
      capturedRules = fn(rules)
    })

    await setPayeeCategory('payee-1', 'cat-groceries', 'Groceries')

    expect(capturedRules[0].defaultCategoryId).toBe('cat-groceries')
    expect(capturedRules[0].defaultCategoryName).toBe('Groceries')
    expect(capturedRules[0].isNew).toBe(false)
  })
})

describe('improvePayeeWithAI', () => {
  const config = {
    openRouterApiKey: 'test-key',
    model: 'test-model',
  }

  const categories = [
    createMockCategory({ id: 'cat-groceries', name: 'Groceries' }),
    createMockCategory({ id: 'cat-shopping', name: 'Shopping' }),
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns cached result when available', async () => {
    const cachedResult = {
      displayName: 'Amazon',
      tags: ['ecommerce'],
      suggestedCategoryName: 'Shopping',
      suggestedCategoryId: 'cat-shopping',
    }
    mockGetCachedResponse.mockImplementation(() => Promise.resolve(cachedResult))

    const result = await improvePayeeWithAI(config, 'AMAZON', categories)

    expect(result).toEqual(cachedResult)
    expect(mockGenerateObject).not.toHaveBeenCalled()
  })

  it('calls AI when no cache hit', async () => {
    mockGetCachedResponse.mockImplementation(() => Promise.resolve(null))
    mockGenerateObject.mockResolvedValue({
      object: {
        displayName: 'Amazon',
        tags: ['ecommerce', 'shopping'],
        suggestedCategoryName: 'Shopping',
        context: 'E-commerce marketplace',
      },
    })

    const result = await improvePayeeWithAI(config, 'AMAZON', categories)

    expect(mockGenerateObject).toHaveBeenCalled()
    expect(result.displayName).toBe('Amazon')
    expect(result.tags).toEqual(['ecommerce', 'shopping'])
  })

  it('caches AI results', async () => {
    mockGetCachedResponse.mockImplementation(() => Promise.resolve(null))
    mockGenerateObject.mockResolvedValue({
      object: {
        displayName: 'Netflix',
        tags: ['streaming'],
        context: 'Streaming service',
      },
    })

    await improvePayeeWithAI(config, 'NETFLIX', categories)

    expect(mockSetCachedResponse).toHaveBeenCalled()
  })

  it('matches suggested category to category ID', async () => {
    mockGetCachedResponse.mockImplementation(() => Promise.resolve(null))
    mockGenerateObject.mockResolvedValue({
      object: {
        displayName: 'Lidl',
        tags: ['grocery'],
        suggestedCategoryName: 'Groceries',
        context: 'Discount supermarket',
      },
    })

    const result = await improvePayeeWithAI(config, 'LIDL', categories)

    expect(result.suggestedCategoryId).toBe('cat-groceries')
    expect(result.suggestedCategoryName).toBe('Groceries')
  })

  it('handles non-matching category suggestion', async () => {
    mockGetCachedResponse.mockImplementation(() => Promise.resolve(null))
    mockGenerateObject.mockResolvedValue({
      object: {
        displayName: 'Gas Station',
        tags: ['fuel'],
        suggestedCategoryName: 'Transportation', // Not in our categories
        context: 'Fuel station',
      },
    })

    const result = await improvePayeeWithAI(config, 'SHELL', categories)

    expect(result.suggestedCategoryId).toBeUndefined()
  })

  it('includes user context in prompt when provided', async () => {
    mockGetCachedResponse.mockImplementation(() => Promise.resolve(null))
    mockGenerateObject.mockResolvedValue({
      object: {
        displayName: 'Rewe',
        tags: ['grocery'],
      },
    })

    const configWithContext = {
      ...config,
      userContext: {
        location: { country: 'Germany', city: 'Berlin' },
        language: 'German',
      },
    }

    await improvePayeeWithAI(configWithContext, 'REWE', categories)

    const systemPrompt = mockGenerateObject.mock.calls[0][0].system
    expect(systemPrompt).toContain('Berlin')
    expect(systemPrompt).toContain('Germany')
  })
})
