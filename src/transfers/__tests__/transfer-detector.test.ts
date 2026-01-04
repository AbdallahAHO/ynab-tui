import { describe, it, expect } from 'vitest'
import {
  detectTransfers,
  findTransferPairForTransaction,
  isTransferTransaction,
  getOtherTransaction,
} from '../transfer-detector.js'
import { createMockTransaction, createMockAccount } from '../../test-utils/fixtures.js'

describe('detectTransfers', () => {
  it('returns empty array when no transactions', () => {
    const result = detectTransfers([], [])
    expect(result).toEqual([])
  })

  it('returns empty array when single transaction', () => {
    const transactions = [createMockTransaction()]
    const accounts = [createMockAccount({ id: 'account-1' })]
    const result = detectTransfers(transactions, accounts)
    expect(result).toEqual([])
  })

  it('detects transfer pair with matching amounts', () => {
    const accounts = [
      createMockAccount({ id: 'checking', name: 'Checking' }),
      createMockAccount({ id: 'savings', name: 'Savings' }),
    ]
    const transactions = [
      createMockTransaction({
        id: 'tx-out',
        account_id: 'checking',
        amount: -50000, // -$50.00 outflow
        date: '2024-01-15',
      }),
      createMockTransaction({
        id: 'tx-in',
        account_id: 'savings',
        amount: 50000, // +$50.00 inflow
        date: '2024-01-15',
      }),
    ]

    const result = detectTransfers(transactions, accounts)

    expect(result).toHaveLength(1)
    expect(result[0].outflow.id).toBe('tx-out')
    expect(result[0].inflow.id).toBe('tx-in')
    expect(result[0].fromAccount.name).toBe('Checking')
    expect(result[0].toAccount.name).toBe('Savings')
    expect(result[0].confidence).toBe(1.0)
  })

  it('calculates lower confidence for dates 1-3 days apart', () => {
    const accounts = [
      createMockAccount({ id: 'checking', name: 'Checking' }),
      createMockAccount({ id: 'savings', name: 'Savings' }),
    ]
    const transactions = [
      createMockTransaction({
        id: 'tx-out',
        account_id: 'checking',
        amount: -50000,
        date: '2024-01-15',
      }),
      createMockTransaction({
        id: 'tx-in',
        account_id: 'savings',
        amount: 50000,
        date: '2024-01-17', // 2 days later
      }),
    ]

    const result = detectTransfers(transactions, accounts)

    expect(result).toHaveLength(1)
    expect(result[0].confidence).toBeLessThan(1.0)
    expect(result[0].confidence).toBeGreaterThan(0.7)
  })

  it('does not match transactions more than 3 days apart', () => {
    const accounts = [
      createMockAccount({ id: 'checking', name: 'Checking' }),
      createMockAccount({ id: 'savings', name: 'Savings' }),
    ]
    const transactions = [
      createMockTransaction({
        id: 'tx-out',
        account_id: 'checking',
        amount: -50000,
        date: '2024-01-15',
      }),
      createMockTransaction({
        id: 'tx-in',
        account_id: 'savings',
        amount: 50000,
        date: '2024-01-20', // 5 days later
      }),
    ]

    const result = detectTransfers(transactions, accounts)

    expect(result).toHaveLength(0)
  })

  it('does not match transactions with different amounts', () => {
    const accounts = [
      createMockAccount({ id: 'checking', name: 'Checking' }),
      createMockAccount({ id: 'savings', name: 'Savings' }),
    ]
    const transactions = [
      createMockTransaction({
        id: 'tx-out',
        account_id: 'checking',
        amount: -50000,
        date: '2024-01-15',
      }),
      createMockTransaction({
        id: 'tx-in',
        account_id: 'savings',
        amount: 60000, // Different amount
        date: '2024-01-15',
      }),
    ]

    const result = detectTransfers(transactions, accounts)

    expect(result).toHaveLength(0)
  })

  it('excludes same-account matches (refunds)', () => {
    const accounts = [createMockAccount({ id: 'checking', name: 'Checking' })]
    const transactions = [
      createMockTransaction({
        id: 'tx-out',
        account_id: 'checking',
        amount: -50000,
        date: '2024-01-15',
      }),
      createMockTransaction({
        id: 'tx-in',
        account_id: 'checking', // Same account
        amount: 50000,
        date: '2024-01-15',
      }),
    ]

    const result = detectTransfers(transactions, accounts)

    expect(result).toHaveLength(0)
  })

  it('excludes already-categorized transactions', () => {
    const accounts = [
      createMockAccount({ id: 'checking', name: 'Checking' }),
      createMockAccount({ id: 'savings', name: 'Savings' }),
    ]
    const transactions = [
      createMockTransaction({
        id: 'tx-out',
        account_id: 'checking',
        amount: -50000,
        date: '2024-01-15',
        category_id: 'some-category', // Already categorized
      }),
      createMockTransaction({
        id: 'tx-in',
        account_id: 'savings',
        amount: 50000,
        date: '2024-01-15',
      }),
    ]

    const result = detectTransfers(transactions, accounts)

    expect(result).toHaveLength(0)
  })

  it('excludes deleted transactions', () => {
    const accounts = [
      createMockAccount({ id: 'checking', name: 'Checking' }),
      createMockAccount({ id: 'savings', name: 'Savings' }),
    ]
    const transactions = [
      createMockTransaction({
        id: 'tx-out',
        account_id: 'checking',
        amount: -50000,
        date: '2024-01-15',
        deleted: true,
      }),
      createMockTransaction({
        id: 'tx-in',
        account_id: 'savings',
        amount: 50000,
        date: '2024-01-15',
      }),
    ]

    const result = detectTransfers(transactions, accounts)

    expect(result).toHaveLength(0)
  })

  it('handles multiple transfer pairs', () => {
    const accounts = [
      createMockAccount({ id: 'checking', name: 'Checking' }),
      createMockAccount({ id: 'savings', name: 'Savings' }),
      createMockAccount({ id: 'credit', name: 'Credit Card' }),
    ]
    const transactions = [
      // Transfer 1: Checking → Savings
      createMockTransaction({
        id: 'tx-1-out',
        account_id: 'checking',
        amount: -50000,
        date: '2024-01-15',
      }),
      createMockTransaction({
        id: 'tx-1-in',
        account_id: 'savings',
        amount: 50000,
        date: '2024-01-15',
      }),
      // Transfer 2: Checking → Credit Card
      createMockTransaction({
        id: 'tx-2-out',
        account_id: 'checking',
        amount: -100000,
        date: '2024-01-15',
      }),
      createMockTransaction({
        id: 'tx-2-in',
        account_id: 'credit',
        amount: 100000,
        date: '2024-01-15',
      }),
    ]

    const result = detectTransfers(transactions, accounts)

    expect(result).toHaveLength(2)
  })

  it('picks best match when multiple transactions have same amount', () => {
    const accounts = [
      createMockAccount({ id: 'checking', name: 'Checking' }),
      createMockAccount({ id: 'savings', name: 'Savings' }),
      createMockAccount({ id: 'other', name: 'Other' }),
    ]
    const transactions = [
      createMockTransaction({
        id: 'tx-out',
        account_id: 'checking',
        amount: -50000,
        date: '2024-01-15',
      }),
      createMockTransaction({
        id: 'tx-in-1',
        account_id: 'savings',
        amount: 50000,
        date: '2024-01-15', // Same day (higher confidence)
      }),
      createMockTransaction({
        id: 'tx-in-2',
        account_id: 'other',
        amount: 50000,
        date: '2024-01-17', // 2 days later (lower confidence)
      }),
    ]

    const result = detectTransfers(transactions, accounts)

    expect(result).toHaveLength(1)
    expect(result[0].inflow.id).toBe('tx-in-1') // Best match (same day)
    expect(result[0].confidence).toBe(1.0)
  })

  it('sorts pairs by confidence descending', () => {
    const accounts = [
      createMockAccount({ id: 'checking', name: 'Checking' }),
      createMockAccount({ id: 'savings', name: 'Savings' }),
    ]
    const transactions = [
      // Lower confidence pair (2 days apart)
      createMockTransaction({
        id: 'tx-1-out',
        account_id: 'checking',
        amount: -50000,
        date: '2024-01-15',
      }),
      createMockTransaction({
        id: 'tx-1-in',
        account_id: 'savings',
        amount: 50000,
        date: '2024-01-17',
      }),
      // Higher confidence pair (same day)
      createMockTransaction({
        id: 'tx-2-out',
        account_id: 'checking',
        amount: -100000,
        date: '2024-01-20',
      }),
      createMockTransaction({
        id: 'tx-2-in',
        account_id: 'savings',
        amount: 100000,
        date: '2024-01-20',
      }),
    ]

    const result = detectTransfers(transactions, accounts)

    expect(result).toHaveLength(2)
    expect(result[0].confidence).toBeGreaterThanOrEqual(result[1].confidence)
  })
})

describe('findTransferPairForTransaction', () => {
  it('returns undefined when transaction not in any pair', () => {
    const result = findTransferPairForTransaction([], 'tx-123')
    expect(result).toBeUndefined()
  })

  it('finds pair for outflow transaction', () => {
    const accounts = [
      createMockAccount({ id: 'checking', name: 'Checking' }),
      createMockAccount({ id: 'savings', name: 'Savings' }),
    ]
    const transactions = [
      createMockTransaction({
        id: 'tx-out',
        account_id: 'checking',
        amount: -50000,
        date: '2024-01-15',
      }),
      createMockTransaction({
        id: 'tx-in',
        account_id: 'savings',
        amount: 50000,
        date: '2024-01-15',
      }),
    ]
    const pairs = detectTransfers(transactions, accounts)

    const result = findTransferPairForTransaction(pairs, 'tx-out')

    expect(result).toBeDefined()
    expect(result?.outflow.id).toBe('tx-out')
  })

  it('finds pair for inflow transaction', () => {
    const accounts = [
      createMockAccount({ id: 'checking', name: 'Checking' }),
      createMockAccount({ id: 'savings', name: 'Savings' }),
    ]
    const transactions = [
      createMockTransaction({
        id: 'tx-out',
        account_id: 'checking',
        amount: -50000,
        date: '2024-01-15',
      }),
      createMockTransaction({
        id: 'tx-in',
        account_id: 'savings',
        amount: 50000,
        date: '2024-01-15',
      }),
    ]
    const pairs = detectTransfers(transactions, accounts)

    const result = findTransferPairForTransaction(pairs, 'tx-in')

    expect(result).toBeDefined()
    expect(result?.inflow.id).toBe('tx-in')
  })
})

describe('isTransferTransaction', () => {
  it('returns false for non-transfer transaction', () => {
    const result = isTransferTransaction([], 'tx-123')
    expect(result).toBe(false)
  })

  it('returns true for outflow in transfer pair', () => {
    const accounts = [
      createMockAccount({ id: 'checking', name: 'Checking' }),
      createMockAccount({ id: 'savings', name: 'Savings' }),
    ]
    const transactions = [
      createMockTransaction({
        id: 'tx-out',
        account_id: 'checking',
        amount: -50000,
        date: '2024-01-15',
      }),
      createMockTransaction({
        id: 'tx-in',
        account_id: 'savings',
        amount: 50000,
        date: '2024-01-15',
      }),
    ]
    const pairs = detectTransfers(transactions, accounts)

    expect(isTransferTransaction(pairs, 'tx-out')).toBe(true)
    expect(isTransferTransaction(pairs, 'tx-in')).toBe(true)
    expect(isTransferTransaction(pairs, 'tx-other')).toBe(false)
  })
})

describe('getOtherTransaction', () => {
  it('returns inflow when given outflow id', () => {
    const accounts = [
      createMockAccount({ id: 'checking', name: 'Checking' }),
      createMockAccount({ id: 'savings', name: 'Savings' }),
    ]
    const transactions = [
      createMockTransaction({
        id: 'tx-out',
        account_id: 'checking',
        amount: -50000,
        date: '2024-01-15',
      }),
      createMockTransaction({
        id: 'tx-in',
        account_id: 'savings',
        amount: 50000,
        date: '2024-01-15',
      }),
    ]
    const pairs = detectTransfers(transactions, accounts)

    const other = getOtherTransaction(pairs[0], 'tx-out')

    expect(other.id).toBe('tx-in')
  })

  it('returns outflow when given inflow id', () => {
    const accounts = [
      createMockAccount({ id: 'checking', name: 'Checking' }),
      createMockAccount({ id: 'savings', name: 'Savings' }),
    ]
    const transactions = [
      createMockTransaction({
        id: 'tx-out',
        account_id: 'checking',
        amount: -50000,
        date: '2024-01-15',
      }),
      createMockTransaction({
        id: 'tx-in',
        account_id: 'savings',
        amount: 50000,
        date: '2024-01-15',
      }),
    ]
    const pairs = detectTransfers(transactions, accounts)

    const other = getOtherTransaction(pairs[0], 'tx-in')

    expect(other.id).toBe('tx-out')
  })
})
