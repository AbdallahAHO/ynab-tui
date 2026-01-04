import { describe, it, expect } from 'vitest'
import { findDuplicateGroups, getDuplicateCount } from '../duplicate-detection.js'
import { createMockPayeeRule } from '../../test-utils/fixtures.js'

describe('findDuplicateGroups', () => {
  it('returns empty array when no payees', () => {
    const result = findDuplicateGroups([])
    expect(result).toEqual([])
  })

  it('returns empty array when single payee', () => {
    const payees = [createMockPayeeRule({ displayName: 'Amazon' })]
    const result = findDuplicateGroups(payees)
    expect(result).toEqual([])
  })

  it('returns empty array when no duplicates found', () => {
    const payees = [
      createMockPayeeRule({ payeeId: '1', displayName: 'Amazon' }),
      createMockPayeeRule({ payeeId: '2', displayName: 'Netflix' }),
      createMockPayeeRule({ payeeId: '3', displayName: 'Spotify' }),
    ]
    const result = findDuplicateGroups(payees)
    expect(result).toEqual([])
  })

  it('groups exact normalized matches', () => {
    const payees = [
      createMockPayeeRule({ payeeId: '1', displayName: 'Amazon', transactionCount: 10 }),
      createMockPayeeRule({ payeeId: '2', displayName: 'AMAZON', transactionCount: 5 }),
    ]
    const result = findDuplicateGroups(payees)

    expect(result).toHaveLength(1)
    expect(result[0].primary.payeeId).toBe('1') // Higher transaction count
    expect(result[0].duplicates).toHaveLength(1)
    expect(result[0].duplicates[0].payeeId).toBe('2')
    expect(result[0].similarity).toBe(1.0)
  })

  it('selects payee with highest transactionCount as primary', () => {
    const payees = [
      createMockPayeeRule({ payeeId: '1', displayName: 'lidl', transactionCount: 2 }),
      createMockPayeeRule({ payeeId: '2', displayName: 'LIDL', transactionCount: 100 }),
      createMockPayeeRule({ payeeId: '3', displayName: 'Lidl', transactionCount: 5 }),
    ]
    const result = findDuplicateGroups(payees)

    expect(result).toHaveLength(1)
    expect(result[0].primary.payeeId).toBe('2') // Highest count
    expect(result[0].duplicates).toHaveLength(2)
  })

  it('groups prefix matches meeting length threshold', () => {
    // Prefix match requires: shorter > 3 AND shorter/longer > 0.5
    // "Rewe" (4 chars) vs "Rewe Markt" (9 chars after space normalization) = 4/9 = 0.44 - fails
    // Use names that pass both criteria: "Lidl Store" vs "Lidl" = 4/9 fails too
    // Try: "Amazon" (6) vs "Amazon US" (8) = 6/8 = 0.75 - passes!
    const payees = [
      createMockPayeeRule({ payeeId: '1', displayName: 'Amazon', transactionCount: 10 }),
      createMockPayeeRule({ payeeId: '2', displayName: 'Amazon US', transactionCount: 5 }),
    ]
    const result = findDuplicateGroups(payees)

    expect(result).toHaveLength(1)
    expect(result[0].similarity).toBeGreaterThanOrEqual(0.9)
  })

  it('rejects prefix match with short strings (< 4 chars)', () => {
    const payees = [
      createMockPayeeRule({ payeeId: '1', displayName: 'ABC' }),
      createMockPayeeRule({ payeeId: '2', displayName: 'ABC Corp' }),
    ]
    const result = findDuplicateGroups(payees)

    // Should not match because "abc" is only 3 chars
    expect(result).toHaveLength(0)
  })

  it('groups by Levenshtein similarity > 0.85', () => {
    const payees = [
      createMockPayeeRule({ payeeId: '1', displayName: 'Amazon', transactionCount: 10 }),
      createMockPayeeRule({ payeeId: '2', displayName: 'Amazons', transactionCount: 5 }), // 1 char diff
    ]
    const result = findDuplicateGroups(payees)

    expect(result).toHaveLength(1)
    expect(result[0].similarity).toBeGreaterThan(0.85)
  })

  it('does not group dissimilar strings', () => {
    const payees = [
      createMockPayeeRule({ payeeId: '1', displayName: 'Apple' }),
      createMockPayeeRule({ payeeId: '2', displayName: 'Banana' }),
    ]
    const result = findDuplicateGroups(payees)

    expect(result).toHaveLength(0)
  })

  it('skips payees already marked as duplicates', () => {
    const payees = [
      createMockPayeeRule({ payeeId: '1', displayName: 'Amazon', transactionCount: 10 }),
      createMockPayeeRule({
        payeeId: '2',
        displayName: 'AMAZON',
        duplicateOf: '1', // Already marked
      }),
    ]
    const result = findDuplicateGroups(payees)

    expect(result).toHaveLength(0)
  })

  it('handles multiple distinct duplicate groups', () => {
    const payees = [
      createMockPayeeRule({ payeeId: '1', displayName: 'Amazon', transactionCount: 10 }),
      createMockPayeeRule({ payeeId: '2', displayName: 'AMAZON', transactionCount: 5 }),
      createMockPayeeRule({ payeeId: '3', displayName: 'Netflix', transactionCount: 8 }),
      createMockPayeeRule({ payeeId: '4', displayName: 'NETFLIX', transactionCount: 3 }),
    ]
    const result = findDuplicateGroups(payees)

    expect(result).toHaveLength(2)
  })

  it('sorts groups by number of duplicates (most first)', () => {
    const payees = [
      // Group 1: 2 duplicates
      createMockPayeeRule({ payeeId: '1', displayName: 'Amazon', transactionCount: 10 }),
      createMockPayeeRule({ payeeId: '2', displayName: 'AMAZON', transactionCount: 5 }),
      // Group 2: 3 duplicates
      createMockPayeeRule({ payeeId: '3', displayName: 'Lidl', transactionCount: 8 }),
      createMockPayeeRule({ payeeId: '4', displayName: 'LIDL', transactionCount: 3 }),
      createMockPayeeRule({ payeeId: '5', displayName: 'Lidl Store', transactionCount: 2 }),
    ]
    const result = findDuplicateGroups(payees)

    expect(result).toHaveLength(2)
    expect(result[0].duplicates.length).toBeGreaterThanOrEqual(result[1].duplicates.length)
  })

  it('handles special characters in payee names', () => {
    const payees = [
      createMockPayeeRule({ payeeId: '1', displayName: 'Amazon.com', transactionCount: 10 }),
      createMockPayeeRule({ payeeId: '2', displayName: 'Amazon Com', transactionCount: 5 }),
    ]
    const result = findDuplicateGroups(payees)

    expect(result).toHaveLength(1)
  })

  it('calculates average similarity for group', () => {
    const payees = [
      createMockPayeeRule({ payeeId: '1', displayName: 'Amazon', transactionCount: 10 }),
      createMockPayeeRule({ payeeId: '2', displayName: 'AMAZON', transactionCount: 5 }),
      createMockPayeeRule({ payeeId: '3', displayName: 'amazon', transactionCount: 3 }),
    ]
    const result = findDuplicateGroups(payees)

    expect(result).toHaveLength(1)
    expect(result[0].similarity).toBe(1.0) // All exact matches
  })
})

describe('getDuplicateCount', () => {
  it('returns 0 when no duplicates', () => {
    const payees = [
      createMockPayeeRule({ displayName: 'Amazon' }),
      createMockPayeeRule({ displayName: 'Netflix' }),
    ]
    expect(getDuplicateCount(payees)).toBe(0)
  })

  it('returns count of duplicate groups', () => {
    const payees = [
      createMockPayeeRule({ payeeId: '1', displayName: 'Amazon' }),
      createMockPayeeRule({ payeeId: '2', displayName: 'AMAZON' }),
      createMockPayeeRule({ payeeId: '3', displayName: 'Netflix' }),
      createMockPayeeRule({ payeeId: '4', displayName: 'NETFLIX' }),
    ]
    expect(getDuplicateCount(payees)).toBe(2)
  })
})
