import { describe, it, expect } from 'vitest'
import { buildPayeePatterns, findMatchingPatterns, formatPatternsForPrompt } from '../history-analyzer.js'
import { createMockTransaction, createMockCategory } from '../../test-utils/fixtures.js'

describe('buildPayeePatterns', () => {
  it('returns empty array when no transactions', () => {
    const result = buildPayeePatterns([], [])
    expect(result).toEqual([])
  })

  it('groups transactions by normalized payee name', () => {
    const categories = [createMockCategory({ id: 'cat-1', name: 'Groceries' })]
    const transactions = [
      createMockTransaction({ payee_name: 'Amazon', category_id: 'cat-1' }),
      createMockTransaction({ payee_name: 'AMAZON', category_id: 'cat-1' }),
      createMockTransaction({ payee_name: 'amazon', category_id: 'cat-1' }),
    ]

    const result = buildPayeePatterns(transactions, categories)

    expect(result).toHaveLength(1)
    expect(result[0].occurrences).toBe(3)
  })

  it('calculates correct confidence score', () => {
    const categories = [
      createMockCategory({ id: 'cat-1', name: 'Groceries' }),
      createMockCategory({ id: 'cat-2', name: 'Shopping' }),
    ]
    const transactions = [
      createMockTransaction({ payee_name: 'Amazon', category_id: 'cat-1' }),
      createMockTransaction({ payee_name: 'Amazon', category_id: 'cat-1' }),
      createMockTransaction({ payee_name: 'Amazon', category_id: 'cat-1' }),
      createMockTransaction({ payee_name: 'Amazon', category_id: 'cat-2' }),
    ]

    const result = buildPayeePatterns(transactions, categories)

    expect(result).toHaveLength(1)
    expect(result[0].confidence).toBe(0.75) // 3 out of 4
    expect(result[0].categoryName).toBe('Groceries')
  })

  it('filters out uncategorized transactions', () => {
    const categories = [createMockCategory({ id: 'cat-1', name: 'Groceries' })]
    const transactions = [
      createMockTransaction({ payee_name: 'Amazon', category_id: 'cat-1' }),
      createMockTransaction({ payee_name: 'Amazon', category_id: null }), // Uncategorized
      createMockTransaction({ payee_name: 'Amazon', category_id: undefined }), // Uncategorized
    ]

    const result = buildPayeePatterns(transactions, categories)

    expect(result).toHaveLength(1)
    expect(result[0].occurrences).toBe(1)
  })

  it('filters out deleted transactions', () => {
    const categories = [createMockCategory({ id: 'cat-1', name: 'Groceries' })]
    const transactions = [
      createMockTransaction({ payee_name: 'Amazon', category_id: 'cat-1', deleted: false }),
      createMockTransaction({ payee_name: 'Amazon', category_id: 'cat-1', deleted: true }),
    ]

    const result = buildPayeePatterns(transactions, categories)

    expect(result).toHaveLength(1)
    expect(result[0].occurrences).toBe(1)
  })

  it('returns patterns sorted by occurrence', () => {
    const categories = [
      createMockCategory({ id: 'cat-1', name: 'Groceries' }),
      createMockCategory({ id: 'cat-2', name: 'Shopping' }),
    ]
    const transactions = [
      createMockTransaction({ payee_name: 'Lidl', category_id: 'cat-1' }),
      createMockTransaction({ payee_name: 'Amazon', category_id: 'cat-2' }),
      createMockTransaction({ payee_name: 'Amazon', category_id: 'cat-2' }),
      createMockTransaction({ payee_name: 'Amazon', category_id: 'cat-2' }),
    ]

    const result = buildPayeePatterns(transactions, categories)

    expect(result).toHaveLength(2)
    expect(result[0].payeeName).toBe('Amazon') // 3 occurrences
    expect(result[1].payeeName).toBe('Lidl') // 1 occurrence
  })

  it('handles transactions with no payee', () => {
    const categories = [createMockCategory({ id: 'cat-1', name: 'Groceries' })]
    const transactions = [
      createMockTransaction({ payee_name: null, category_id: 'cat-1' }),
      createMockTransaction({ payee_name: '', category_id: 'cat-1' }),
      createMockTransaction({ payee_name: 'Amazon', category_id: 'cat-1' }),
    ]

    const result = buildPayeePatterns(transactions, categories)

    expect(result).toHaveLength(1)
    expect(result[0].payeeName).toBe('Amazon')
  })

  it('skips categories not in category list', () => {
    const categories = [createMockCategory({ id: 'cat-1', name: 'Groceries' })]
    const transactions = [
      createMockTransaction({ payee_name: 'Amazon', category_id: 'cat-unknown' }),
    ]

    const result = buildPayeePatterns(transactions, categories)

    expect(result).toHaveLength(0)
  })

  it('preserves original payee name casing', () => {
    const categories = [createMockCategory({ id: 'cat-1', name: 'Groceries' })]
    const transactions = [
      createMockTransaction({ payee_name: 'AMAZON.COM', category_id: 'cat-1' }),
    ]

    const result = buildPayeePatterns(transactions, categories)

    expect(result[0].payeeName).toBe('AMAZON.COM')
    expect(result[0].normalizedName).toBe('amazoncom')
  })

  it('handles multiple payees with different categories', () => {
    const categories = [
      createMockCategory({ id: 'cat-1', name: 'Groceries' }),
      createMockCategory({ id: 'cat-2', name: 'Entertainment' }),
    ]
    const transactions = [
      createMockTransaction({ payee_name: 'Lidl', category_id: 'cat-1' }),
      createMockTransaction({ payee_name: 'Netflix', category_id: 'cat-2' }),
    ]

    const result = buildPayeePatterns(transactions, categories)

    expect(result).toHaveLength(2)
    expect(result.find((p) => p.payeeName === 'Lidl')?.categoryName).toBe('Groceries')
    expect(result.find((p) => p.payeeName === 'Netflix')?.categoryName).toBe('Entertainment')
  })
})

describe('findMatchingPatterns', () => {
  const patterns = [
    {
      payeeName: 'Amazon',
      normalizedName: 'amazon',
      categoryId: 'cat-1',
      categoryName: 'Shopping',
      occurrences: 10,
      confidence: 0.9,
    },
    {
      payeeName: 'Amazon Prime',
      normalizedName: 'amazonprime',
      categoryId: 'cat-2',
      categoryName: 'Subscriptions',
      occurrences: 5,
      confidence: 1.0,
    },
    {
      payeeName: 'Netflix',
      normalizedName: 'netflix',
      categoryId: 'cat-2',
      categoryName: 'Subscriptions',
      occurrences: 8,
      confidence: 1.0,
    },
  ]

  it('finds exact normalized match', () => {
    const result = findMatchingPatterns('Amazon', patterns)

    expect(result).toHaveLength(2) // amazon and amazonprime (contains amazon)
    expect(result.some((p) => p.payeeName === 'Amazon')).toBe(true)
  })

  it('finds substring match (pattern contains payee)', () => {
    const result = findMatchingPatterns('prime', patterns)

    expect(result).toHaveLength(1)
    expect(result[0].payeeName).toBe('Amazon Prime')
  })

  it('finds substring match (payee contains pattern)', () => {
    const result = findMatchingPatterns('Amazon Video Service', patterns)

    // "amazonvideoservice" contains "amazon"
    expect(result.some((p) => p.normalizedName === 'amazon')).toBe(true)
  })

  it('returns empty array when no match', () => {
    const result = findMatchingPatterns('Spotify', patterns)

    expect(result).toEqual([])
  })

  it('handles normalized name with special chars', () => {
    const result = findMatchingPatterns('AMAZON.COM', patterns)

    expect(result.length).toBeGreaterThan(0)
    expect(result.some((p) => p.payeeName === 'Amazon')).toBe(true)
  })

  it('is case-insensitive', () => {
    const result = findMatchingPatterns('NETFLIX', patterns)

    expect(result).toHaveLength(1)
    expect(result[0].payeeName).toBe('Netflix')
  })

  it('handles empty payee name', () => {
    const result = findMatchingPatterns('', patterns)

    // Empty string matches everything (substring match)
    expect(result).toHaveLength(patterns.length)
  })

  it('handles empty patterns array', () => {
    const result = findMatchingPatterns('Amazon', [])

    expect(result).toEqual([])
  })
})

describe('formatPatternsForPrompt', () => {
  const patterns = [
    {
      payeeName: 'Amazon',
      normalizedName: 'amazon',
      categoryId: 'cat-1',
      categoryName: 'Shopping',
      occurrences: 10,
      confidence: 0.9,
    },
    {
      payeeName: 'Netflix',
      normalizedName: 'netflix',
      categoryId: 'cat-2',
      categoryName: 'Subscriptions',
      occurrences: 5,
      confidence: 1.0,
    },
  ]

  it('formats patterns as bullet list', () => {
    const result = formatPatternsForPrompt(patterns)

    expect(result).toContain('- "Amazon"')
    expect(result).toContain('- "Netflix"')
  })

  it('includes category name', () => {
    const result = formatPatternsForPrompt(patterns)

    expect(result).toContain('→ Shopping')
    expect(result).toContain('→ Subscriptions')
  })

  it('includes confidence percentage', () => {
    const result = formatPatternsForPrompt(patterns)

    expect(result).toContain('90%') // 0.9 * 100
    expect(result).toContain('100%') // 1.0 * 100
  })

  it('includes occurrence count', () => {
    const result = formatPatternsForPrompt(patterns)

    expect(result).toContain('10 txns')
    expect(result).toContain('5 txns')
  })

  it('respects limit parameter', () => {
    const result = formatPatternsForPrompt(patterns, 1)

    expect(result).toContain('Amazon')
    expect(result).not.toContain('Netflix')
  })

  it('uses default limit of 50', () => {
    const manyPatterns = Array.from({ length: 60 }, (_, i) => ({
      payeeName: `Payee ${i}`,
      normalizedName: `payee${i}`,
      categoryId: `cat-${i}`,
      categoryName: `Category ${i}`,
      occurrences: 1,
      confidence: 1.0,
    }))

    const result = formatPatternsForPrompt(manyPatterns)
    const lines = result.split('\n')

    expect(lines).toHaveLength(50)
  })

  it('handles empty patterns array', () => {
    const result = formatPatternsForPrompt([])

    expect(result).toBe('')
  })

  it('formats complete pattern line correctly', () => {
    const result = formatPatternsForPrompt(patterns)
    const lines = result.split('\n')

    expect(lines[0]).toBe('- "Amazon" → Shopping (90% of 10 txns)')
    expect(lines[1]).toBe('- "Netflix" → Subscriptions (100% of 5 txns)')
  })
})
