import { describe, it, expect } from 'vitest'
import {
  analyzeSpending,
  filterTransactionsByMonth,
  filterTransactionsByAccount,
  aggregateByCategory,
  aggregateByPayee,
  calculateTrends,
} from '../spending-analyzer.js'
import type { AnalyzerInput, CategoryInfo, MonthComparison } from '../types.js'
import {
  createMockTransaction,
  createMockCategory,
  createMockCategoryGroup,
  createMockAccount,
} from '../../test-utils/fixtures.js'
import type { Payee } from '../../shared/ynab-client.js'

const createMockPayee = (overrides: Partial<Payee> = {}): Payee => ({
  id: `payee-${Math.random().toString(36).slice(2, 8)}`,
  name: 'Test Payee',
  deleted: false,
  transfer_account_id: null,
  ...overrides,
})

describe('filterTransactionsByMonth', () => {
  it('filters transactions by target month', () => {
    const transactions = [
      createMockTransaction({ id: 'tx-1', date: '2024-01-15' }),
      createMockTransaction({ id: 'tx-2', date: '2024-01-01' }),
      createMockTransaction({ id: 'tx-3', date: '2024-02-01' }),
      createMockTransaction({ id: 'tx-4', date: '2024-01-31' }),
    ]

    const result = filterTransactionsByMonth(transactions, '2024-01')

    expect(result).toHaveLength(3)
    expect(result.map((tx) => tx.id)).toContain('tx-1')
    expect(result.map((tx) => tx.id)).toContain('tx-2')
    expect(result.map((tx) => tx.id)).toContain('tx-4')
    expect(result.map((tx) => tx.id)).not.toContain('tx-3')
  })

  it('handles year rollover (December to January)', () => {
    const transactions = [
      createMockTransaction({ id: 'tx-1', date: '2023-12-15' }),
      createMockTransaction({ id: 'tx-2', date: '2024-01-01' }),
    ]

    const decResult = filterTransactionsByMonth(transactions, '2023-12')
    expect(decResult).toHaveLength(1)
    expect(decResult[0].id).toBe('tx-1')

    const janResult = filterTransactionsByMonth(transactions, '2024-01')
    expect(janResult).toHaveLength(1)
    expect(janResult[0].id).toBe('tx-2')
  })

  it('excludes deleted transactions', () => {
    const transactions = [
      createMockTransaction({ id: 'tx-1', date: '2024-01-15', deleted: false }),
      createMockTransaction({ id: 'tx-2', date: '2024-01-15', deleted: true }),
    ]

    const result = filterTransactionsByMonth(transactions, '2024-01')

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('tx-1')
  })

  it('returns empty array when no transactions match', () => {
    const transactions = [
      createMockTransaction({ date: '2024-02-15' }),
      createMockTransaction({ date: '2024-03-15' }),
    ]

    const result = filterTransactionsByMonth(transactions, '2024-01')

    expect(result).toEqual([])
  })

  it('handles empty transaction array', () => {
    const result = filterTransactionsByMonth([], '2024-01')

    expect(result).toEqual([])
  })
})

describe('filterTransactionsByAccount', () => {
  it('filters transactions by account ID', () => {
    const transactions = [
      createMockTransaction({ id: 'tx-1', account_id: 'acc-1' }),
      createMockTransaction({ id: 'tx-2', account_id: 'acc-2' }),
      createMockTransaction({ id: 'tx-3', account_id: 'acc-1' }),
    ]

    const result = filterTransactionsByAccount(transactions, 'acc-1')

    expect(result).toHaveLength(2)
    expect(result.map((tx) => tx.id)).toEqual(['tx-1', 'tx-3'])
  })

  it('returns empty array when no transactions match', () => {
    const transactions = [
      createMockTransaction({ account_id: 'acc-1' }),
      createMockTransaction({ account_id: 'acc-2' }),
    ]

    const result = filterTransactionsByAccount(transactions, 'acc-999')

    expect(result).toEqual([])
  })

  it('handles empty transaction array', () => {
    const result = filterTransactionsByAccount([], 'acc-1')

    expect(result).toEqual([])
  })
})

describe('aggregateByCategory', () => {
  const buildCategoryLookup = (): Map<string, CategoryInfo> => {
    const lookup = new Map<string, CategoryInfo>()
    lookup.set('cat-1', { id: 'cat-1', name: 'Groceries', groupName: 'Food', budgeted: 200000 })
    lookup.set('cat-2', { id: 'cat-2', name: 'Dining Out', groupName: 'Food', budgeted: 100000 })
    lookup.set('cat-3', { id: 'cat-3', name: 'Gas', groupName: 'Transportation', budgeted: 0 })
    return lookup
  }

  it('aggregates spending by category', () => {
    const categoryLookup = buildCategoryLookup()
    const transactions = [
      createMockTransaction({ category_id: 'cat-1', amount: -50000 }),
      createMockTransaction({ category_id: 'cat-1', amount: -30000 }),
      createMockTransaction({ category_id: 'cat-2', amount: -20000 }),
    ]

    const result = aggregateByCategory(transactions, categoryLookup)

    expect(Object.keys(result)).toHaveLength(2)
    expect(result['cat-1'].spent).toBe(-80000)
    expect(result['cat-1'].transactionCount).toBe(2)
    expect(result['cat-2'].spent).toBe(-20000)
    expect(result['cat-2'].transactionCount).toBe(1)
  })

  it('includes category and group names', () => {
    const categoryLookup = buildCategoryLookup()
    const transactions = [createMockTransaction({ category_id: 'cat-1', amount: -50000 })]

    const result = aggregateByCategory(transactions, categoryLookup)

    expect(result['cat-1'].categoryName).toBe('Groceries')
    expect(result['cat-1'].groupName).toBe('Food')
  })

  it('includes budget amount', () => {
    const categoryLookup = buildCategoryLookup()
    const transactions = [createMockTransaction({ category_id: 'cat-1', amount: -50000 })]

    const result = aggregateByCategory(transactions, categoryLookup)

    expect(result['cat-1'].budgeted).toBe(200000)
  })

  it('sets budgeted to null when budget is zero', () => {
    const categoryLookup = buildCategoryLookup()
    const transactions = [createMockTransaction({ category_id: 'cat-3', amount: -25000 })]

    const result = aggregateByCategory(transactions, categoryLookup)

    expect(result['cat-3'].budgeted).toBeNull()
  })

  it('skips transactions without category ID', () => {
    const categoryLookup = buildCategoryLookup()
    const transactions = [
      createMockTransaction({ category_id: 'cat-1', amount: -50000 }),
      createMockTransaction({ category_id: null, amount: -30000 }),
    ]

    const result = aggregateByCategory(transactions, categoryLookup)

    expect(Object.keys(result)).toHaveLength(1)
    expect(result['cat-1']).toBeDefined()
  })

  it('skips transactions with unknown category ID', () => {
    const categoryLookup = buildCategoryLookup()
    const transactions = [
      createMockTransaction({ category_id: 'cat-unknown', amount: -50000 }),
    ]

    const result = aggregateByCategory(transactions, categoryLookup)

    expect(Object.keys(result)).toHaveLength(0)
  })

  it('returns empty object when no transactions', () => {
    const categoryLookup = buildCategoryLookup()

    const result = aggregateByCategory([], categoryLookup)

    expect(result).toEqual({})
  })
})

describe('aggregateByPayee', () => {
  const buildPayeeLookup = (): Map<string, string> =>
    new Map([
      ['payee-1', 'Amazon'],
      ['payee-2', 'Grocery Store'],
      ['payee-3', 'Gas Station'],
    ])

  const buildCategoryLookup = (): Map<string, CategoryInfo> =>
    new Map([
      ['cat-1', { id: 'cat-1', name: 'Shopping', groupName: 'Expenses', budgeted: 0 }],
      ['cat-2', { id: 'cat-2', name: 'Groceries', groupName: 'Food', budgeted: 0 }],
    ])

  it('aggregates spending by payee', () => {
    const payeeLookup = buildPayeeLookup()
    const categoryLookup = buildCategoryLookup()
    const transactions = [
      createMockTransaction({ payee_id: 'payee-1', payee_name: 'Amazon', amount: -50000, category_id: 'cat-1' }),
      createMockTransaction({ payee_id: 'payee-1', payee_name: 'Amazon', amount: -30000, category_id: 'cat-1' }),
      createMockTransaction({ payee_id: 'payee-2', payee_name: 'Grocery Store', amount: -20000, category_id: 'cat-2' }),
    ]

    const result = aggregateByPayee(transactions, payeeLookup, categoryLookup, 10)

    expect(result).toHaveLength(2)
    const amazon = result.find((p) => p.payeeName === 'Amazon')
    expect(amazon?.totalSpent).toBe(-80000)
    expect(amazon?.transactionCount).toBe(2)
    expect(amazon?.averageTransaction).toBe(-40000)
  })

  it('calculates percent of total correctly', () => {
    const payeeLookup = buildPayeeLookup()
    const categoryLookup = buildCategoryLookup()
    const transactions = [
      createMockTransaction({ payee_id: 'payee-1', payee_name: 'Amazon', amount: -80000, category_id: 'cat-1' }),
      createMockTransaction({ payee_id: 'payee-2', payee_name: 'Grocery Store', amount: -20000, category_id: 'cat-2' }),
    ]

    const result = aggregateByPayee(transactions, payeeLookup, categoryLookup, 10)

    const amazon = result.find((p) => p.payeeName === 'Amazon')
    expect(amazon?.percentOfTotal).toBe(80.0)
    const grocery = result.find((p) => p.payeeName === 'Grocery Store')
    expect(grocery?.percentOfTotal).toBe(20.0)
  })

  it('only counts expenses (negative amounts)', () => {
    const payeeLookup = buildPayeeLookup()
    const categoryLookup = buildCategoryLookup()
    const transactions = [
      createMockTransaction({ payee_id: 'payee-1', payee_name: 'Amazon', amount: -50000, category_id: 'cat-1' }),
      createMockTransaction({ payee_id: 'payee-1', payee_name: 'Amazon', amount: 30000, category_id: 'cat-1' }), // Refund
    ]

    const result = aggregateByPayee(transactions, payeeLookup, categoryLookup, 10)

    expect(result).toHaveLength(1)
    expect(result[0].totalSpent).toBe(-50000)
    expect(result[0].transactionCount).toBe(1)
  })

  it('tracks categories used by payee', () => {
    const payeeLookup = buildPayeeLookup()
    const categoryLookup = buildCategoryLookup()
    const transactions = [
      createMockTransaction({ payee_id: 'payee-1', payee_name: 'Amazon', amount: -50000, category_id: 'cat-1' }),
      createMockTransaction({ payee_id: 'payee-1', payee_name: 'Amazon', amount: -30000, category_id: 'cat-2' }),
    ]

    const result = aggregateByPayee(transactions, payeeLookup, categoryLookup, 10)

    expect(result[0].categories).toEqual(['Groceries', 'Shopping']) // Sorted alphabetically
  })

  it('respects limit parameter', () => {
    const payeeLookup = buildPayeeLookup()
    const categoryLookup = buildCategoryLookup()
    const transactions = [
      createMockTransaction({ payee_id: 'payee-1', payee_name: 'Amazon', amount: -50000, category_id: 'cat-1' }),
      createMockTransaction({ payee_id: 'payee-2', payee_name: 'Grocery Store', amount: -30000, category_id: 'cat-2' }),
      createMockTransaction({ payee_id: 'payee-3', payee_name: 'Gas Station', amount: -20000, category_id: 'cat-1' }),
    ]

    const result = aggregateByPayee(transactions, payeeLookup, categoryLookup, 2)

    expect(result).toHaveLength(2)
    // Should have the two highest spending payees
    expect(result[0].payeeName).toBe('Amazon')
    expect(result[1].payeeName).toBe('Grocery Store')
  })

  it('sorts by spending amount (highest first)', () => {
    const payeeLookup = buildPayeeLookup()
    const categoryLookup = buildCategoryLookup()
    const transactions = [
      createMockTransaction({ payee_id: 'payee-1', payee_name: 'Amazon', amount: -20000, category_id: 'cat-1' }),
      createMockTransaction({ payee_id: 'payee-2', payee_name: 'Grocery Store', amount: -50000, category_id: 'cat-2' }),
      createMockTransaction({ payee_id: 'payee-3', payee_name: 'Gas Station', amount: -30000, category_id: 'cat-1' }),
    ]

    const result = aggregateByPayee(transactions, payeeLookup, categoryLookup, 10)

    expect(result[0].payeeName).toBe('Grocery Store')
    expect(result[1].payeeName).toBe('Gas Station')
    expect(result[2].payeeName).toBe('Amazon')
  })

  it('skips transactions without payee ID', () => {
    const payeeLookup = buildPayeeLookup()
    const categoryLookup = buildCategoryLookup()
    const transactions = [
      createMockTransaction({ payee_id: 'payee-1', payee_name: 'Amazon', amount: -50000, category_id: 'cat-1' }),
      createMockTransaction({ payee_id: null, payee_name: null, amount: -30000, category_id: 'cat-2' }),
    ]

    const result = aggregateByPayee(transactions, payeeLookup, categoryLookup, 10)

    expect(result).toHaveLength(1)
  })

  it('returns empty array when no transactions', () => {
    const payeeLookup = buildPayeeLookup()
    const categoryLookup = buildCategoryLookup()

    const result = aggregateByPayee([], payeeLookup, categoryLookup, 10)

    expect(result).toEqual([])
  })

  it('uses transaction payee_name over lookup', () => {
    const payeeLookup = new Map([['payee-1', 'Old Name']])
    const categoryLookup = buildCategoryLookup()
    const transactions = [
      createMockTransaction({ payee_id: 'payee-1', payee_name: 'New Name', amount: -50000, category_id: 'cat-1' }),
    ]

    const result = aggregateByPayee(transactions, payeeLookup, categoryLookup, 10)

    expect(result[0].payeeName).toBe('New Name')
  })

  it('falls back to lookup when payee_name is null', () => {
    const payeeLookup = new Map([['payee-1', 'Lookup Name']])
    const categoryLookup = buildCategoryLookup()
    const transactions = [
      createMockTransaction({ payee_id: 'payee-1', payee_name: null, amount: -50000, category_id: 'cat-1' }),
    ]

    const result = aggregateByPayee(transactions, payeeLookup, categoryLookup, 10)

    expect(result[0].payeeName).toBe('Lookup Name')
  })
})

describe('calculateTrends', () => {
  it('calculates vsLastMonth correctly', () => {
    const currentMonth: MonthComparison = {
      month: '2024-03',
      totalSpent: -100000,
      totalIncome: 200000,
      netChange: 100000,
      transactionCount: 10,
      topCategory: null,
    }
    const previousMonths: MonthComparison[] = [
      {
        month: '2024-02',
        totalSpent: -80000, // Spent less last month
        totalIncome: 200000,
        netChange: 120000,
        transactionCount: 8,
        topCategory: null,
      },
    ]

    const result = calculateTrends(currentMonth, previousMonths)

    // Current: -100000, Last: -80000
    // Change: (-100000 - (-80000)) / |-80000| * 100 = -20000 / 80000 * 100 = -25%
    expect(result.vsLastMonth).toBe(-25)
  })

  it('calculates vsAverage correctly', () => {
    const currentMonth: MonthComparison = {
      month: '2024-03',
      totalSpent: -100000,
      totalIncome: 200000,
      netChange: 100000,
      transactionCount: 10,
      topCategory: null,
    }
    const previousMonths: MonthComparison[] = [
      { month: '2024-02', totalSpent: -80000, totalIncome: 200000, netChange: 120000, transactionCount: 8, topCategory: null },
      { month: '2024-01', totalSpent: -120000, totalIncome: 200000, netChange: 80000, transactionCount: 12, topCategory: null },
    ]

    const result = calculateTrends(currentMonth, previousMonths)

    // Average: (-80000 + -120000) / 2 = -100000
    // Change: (-100000 - (-100000)) / |-100000| * 100 = 0%
    expect(result.vsAverage).toBe(0)
    expect(result.averageMonthlySpending).toBe(-100000)
  })

  it('returns null values when no previous months', () => {
    const currentMonth: MonthComparison = {
      month: '2024-03',
      totalSpent: -100000,
      totalIncome: 200000,
      netChange: 100000,
      transactionCount: 10,
      topCategory: null,
    }

    const result = calculateTrends(currentMonth, [])

    expect(result.vsLastMonth).toBeNull()
    expect(result.vsAverage).toBeNull()
    expect(result.averageMonthlySpending).toBeNull()
  })

  it('handles zero spending in previous month', () => {
    const currentMonth: MonthComparison = {
      month: '2024-03',
      totalSpent: -100000,
      totalIncome: 200000,
      netChange: 100000,
      transactionCount: 10,
      topCategory: null,
    }
    const previousMonths: MonthComparison[] = [
      { month: '2024-02', totalSpent: 0, totalIncome: 200000, netChange: 200000, transactionCount: 0, topCategory: null },
    ]

    const result = calculateTrends(currentMonth, previousMonths)

    expect(result.vsLastMonth).toBeNull()
  })

  it('rounds to one decimal place', () => {
    const currentMonth: MonthComparison = {
      month: '2024-03',
      totalSpent: -100000,
      totalIncome: 200000,
      netChange: 100000,
      transactionCount: 10,
      topCategory: null,
    }
    const previousMonths: MonthComparison[] = [
      { month: '2024-02', totalSpent: -90000, totalIncome: 200000, netChange: 110000, transactionCount: 9, topCategory: null },
    ]

    const result = calculateTrends(currentMonth, previousMonths)

    // (-100000 - (-90000)) / 90000 * 100 = -10000 / 90000 * 100 = -11.111...
    expect(result.vsLastMonth).toBe(-11.1)
  })

  it('handles negative trend (less spending)', () => {
    const currentMonth: MonthComparison = {
      month: '2024-03',
      totalSpent: -50000,
      totalIncome: 200000,
      netChange: 150000,
      transactionCount: 5,
      topCategory: null,
    }
    const previousMonths: MonthComparison[] = [
      { month: '2024-02', totalSpent: -100000, totalIncome: 200000, netChange: 100000, transactionCount: 10, topCategory: null },
    ]

    const result = calculateTrends(currentMonth, previousMonths)

    // (-50000 - (-100000)) / 100000 * 100 = 50000 / 100000 * 100 = 50%
    expect(result.vsLastMonth).toBe(50)
  })
})

describe('analyzeSpending', () => {
  const createDefaultInput = (): AnalyzerInput => ({
    transactions: [],
    categoryGroups: [
      createMockCategoryGroup({
        id: 'group-1',
        name: 'Food',
        categories: [
          createMockCategory({ id: 'cat-1', name: 'Groceries', category_group_id: 'group-1', budgeted: 200000 }),
          createMockCategory({ id: 'cat-2', name: 'Dining Out', category_group_id: 'group-1', budgeted: 100000 }),
        ],
      }),
      createMockCategoryGroup({
        id: 'group-2',
        name: 'Transportation',
        categories: [
          createMockCategory({ id: 'cat-3', name: 'Gas', category_group_id: 'group-2', budgeted: 75000 }),
        ],
      }),
    ],
    accounts: [
      createMockAccount({ id: 'acc-1', name: 'Checking' }),
      createMockAccount({ id: 'acc-2', name: 'Credit Card' }),
    ],
    payees: [
      createMockPayee({ id: 'payee-1', name: 'Amazon' }),
      createMockPayee({ id: 'payee-2', name: 'Kroger' }),
    ],
    options: {
      month: '2024-01',
      compareMonths: 0,
      format: 'json',
      includeTransfers: false,
      topPayeesLimit: 10,
    },
    budgetName: 'Test Budget',
  })

  it('returns correct month and budget name', () => {
    const input = createDefaultInput()

    const result = analyzeSpending(input)

    expect(result.month).toBe('2024-01')
    expect(result.budgetName).toBe('Test Budget')
  })

  it('calculates summary totals correctly', () => {
    const input = createDefaultInput()
    input.transactions = [
      createMockTransaction({ date: '2024-01-15', amount: -50000, category_id: 'cat-1', account_id: 'acc-1' }),
      createMockTransaction({ date: '2024-01-20', amount: -30000, category_id: 'cat-2', account_id: 'acc-1' }),
      createMockTransaction({ date: '2024-01-25', amount: 100000, category_id: 'cat-1', account_id: 'acc-1' }), // Income
    ]

    const result = analyzeSpending(input)

    expect(result.summary.totalSpent).toBe(-80000)
    expect(result.summary.totalIncome).toBe(100000)
    expect(result.summary.netChange).toBe(20000)
    expect(result.summary.transactionCount).toBe(3)
  })

  it('counts active days correctly', () => {
    const input = createDefaultInput()
    input.transactions = [
      createMockTransaction({ date: '2024-01-15', amount: -50000, account_id: 'acc-1' }),
      createMockTransaction({ date: '2024-01-15', amount: -30000, account_id: 'acc-1' }), // Same day
      createMockTransaction({ date: '2024-01-20', amount: -20000, account_id: 'acc-1' }),
    ]

    const result = analyzeSpending(input)

    expect(result.summary.activeDays).toBe(2)
  })

  it('filters transactions by month', () => {
    const input = createDefaultInput()
    input.transactions = [
      createMockTransaction({ date: '2024-01-15', amount: -50000, account_id: 'acc-1' }),
      createMockTransaction({ date: '2024-02-15', amount: -30000, account_id: 'acc-1' }), // Different month
    ]

    const result = analyzeSpending(input)

    expect(result.summary.totalSpent).toBe(-50000)
    expect(result.summary.transactionCount).toBe(1)
  })

  it('applies account filter', () => {
    const input = createDefaultInput()
    input.options.accountFilter = 'Checking'
    input.transactions = [
      createMockTransaction({ date: '2024-01-15', amount: -50000, account_id: 'acc-1' }), // Checking
      createMockTransaction({ date: '2024-01-20', amount: -30000, account_id: 'acc-2' }), // Credit Card
    ]

    const result = analyzeSpending(input)

    expect(result.summary.totalSpent).toBe(-50000)
    expect(result.summary.transactionCount).toBe(1)
    expect(result.accountFilter).toBe('Checking')
  })

  it('excludes transfers by default', () => {
    const input = createDefaultInput()
    input.transactions = [
      createMockTransaction({
        date: '2024-01-15',
        amount: -50000,
        account_id: 'acc-1',
        transfer_account_id: null,
      }),
      createMockTransaction({
        date: '2024-01-20',
        amount: -30000,
        account_id: 'acc-1',
        transfer_account_id: 'acc-2', // Transfer
      }),
    ]

    const result = analyzeSpending(input)

    expect(result.summary.totalSpent).toBe(-50000)
    expect(result.summary.transactionCount).toBe(1)
  })

  it('includes transfers when specified', () => {
    const input = createDefaultInput()
    input.options.includeTransfers = true
    input.transactions = [
      createMockTransaction({
        date: '2024-01-15',
        amount: -50000,
        account_id: 'acc-1',
        transfer_account_id: null,
      }),
      createMockTransaction({
        date: '2024-01-20',
        amount: -30000,
        account_id: 'acc-1',
        transfer_account_id: 'acc-2',
      }),
    ]

    const result = analyzeSpending(input)

    expect(result.summary.totalSpent).toBe(-80000)
    expect(result.summary.transactionCount).toBe(2)
  })

  it('excludes Transfer payee name even without transfer_account_id', () => {
    const input = createDefaultInput()
    input.transactions = [
      createMockTransaction({
        date: '2024-01-15',
        amount: -50000,
        account_id: 'acc-1',
        payee_name: 'Transfer : Savings',
        transfer_account_id: null,
      }),
      createMockTransaction({
        date: '2024-01-20',
        amount: -30000,
        account_id: 'acc-1',
        payee_name: 'Amazon',
        transfer_account_id: null,
      }),
    ]

    const result = analyzeSpending(input)

    expect(result.summary.totalSpent).toBe(-30000)
    expect(result.summary.transactionCount).toBe(1)
  })

  it('generates category breakdown', () => {
    const input = createDefaultInput()
    input.transactions = [
      createMockTransaction({ date: '2024-01-15', amount: -50000, category_id: 'cat-1', account_id: 'acc-1' }),
      createMockTransaction({ date: '2024-01-20', amount: -30000, category_id: 'cat-1', account_id: 'acc-1' }),
      createMockTransaction({ date: '2024-01-25', amount: -20000, category_id: 'cat-2', account_id: 'acc-1' }),
    ]

    const result = analyzeSpending(input)

    expect(result.categories).toHaveLength(2)
    expect(result.summary.categoryCount).toBe(2)

    const groceries = result.categories.find((c) => c.categoryName === 'Groceries')
    expect(groceries?.spent).toBe(-80000)
    expect(groceries?.budgeted).toBe(200000)
    expect(groceries?.transactionCount).toBe(2)
  })

  it('generates top payees list', () => {
    const input = createDefaultInput()
    input.transactions = [
      createMockTransaction({
        date: '2024-01-15',
        amount: -50000,
        category_id: 'cat-1',
        payee_id: 'payee-1',
        payee_name: 'Amazon',
        account_id: 'acc-1',
      }),
      createMockTransaction({
        date: '2024-01-20',
        amount: -30000,
        category_id: 'cat-1',
        payee_id: 'payee-2',
        payee_name: 'Kroger',
        account_id: 'acc-1',
      }),
    ]

    const result = analyzeSpending(input)

    expect(result.topPayees).toHaveLength(2)
    expect(result.topPayees[0].payeeName).toBe('Amazon')
    expect(result.topPayees[1].payeeName).toBe('Kroger')
  })

  it('generates account breakdown', () => {
    const input = createDefaultInput()
    input.transactions = [
      createMockTransaction({ date: '2024-01-15', amount: -50000, account_id: 'acc-1' }),
      createMockTransaction({ date: '2024-01-20', amount: -30000, account_id: 'acc-2' }),
    ]

    const result = analyzeSpending(input)

    expect(result.accounts).toHaveLength(2)
    const checking = result.accounts.find((a) => a.accountName === 'Checking')
    expect(checking?.totalSpent).toBe(-50000)
  })

  it('tracks uncategorized transactions', () => {
    const input = createDefaultInput()
    input.transactions = [
      createMockTransaction({
        date: '2024-01-15',
        amount: -50000,
        category_id: null,
        payee_name: 'Unknown Store',
        account_id: 'acc-1',
      }),
      createMockTransaction({
        date: '2024-01-20',
        amount: -30000,
        category_id: 'cat-1',
        payee_name: 'Amazon',
        account_id: 'acc-1',
      }),
    ]

    const result = analyzeSpending(input)

    expect(result.uncategorized.count).toBe(1)
    expect(result.uncategorized.totalAmount).toBe(-50000)
    expect(result.uncategorized.payees).toContain('Unknown Store')
  })

  it('generates month comparisons when compareMonths > 0', () => {
    const input = createDefaultInput()
    input.options.compareMonths = 2
    input.transactions = [
      createMockTransaction({ date: '2024-01-15', amount: -50000, category_id: 'cat-1', account_id: 'acc-1' }),
      createMockTransaction({ date: '2023-12-15', amount: -60000, category_id: 'cat-1', account_id: 'acc-1' }),
      createMockTransaction({ date: '2023-11-15', amount: -70000, category_id: 'cat-1', account_id: 'acc-1' }),
    ]

    const result = analyzeSpending(input)

    expect(result.comparison).toHaveLength(3) // Current + 2 previous
    expect(result.comparison[0].month).toBe('2024-01')
    expect(result.comparison[1].month).toBe('2023-12')
    expect(result.comparison[2].month).toBe('2023-11')
  })

  it('calculates trends when comparing months', () => {
    const input = createDefaultInput()
    input.options.compareMonths = 1
    input.transactions = [
      createMockTransaction({ date: '2024-01-15', amount: -100000, category_id: 'cat-1', account_id: 'acc-1' }),
      createMockTransaction({ date: '2023-12-15', amount: -80000, category_id: 'cat-1', account_id: 'acc-1' }),
    ]

    const result = analyzeSpending(input)

    expect(result.trends.vsLastMonth).not.toBeNull()
    expect(result.trends.averageMonthlySpending).toBe(-80000)
  })

  it('returns empty comparison when compareMonths is 0', () => {
    const input = createDefaultInput()
    input.options.compareMonths = 0

    const result = analyzeSpending(input)

    expect(result.comparison).toEqual([])
    expect(result.trends.vsLastMonth).toBeNull()
    expect(result.trends.vsAverage).toBeNull()
  })

  it('handles empty transaction set', () => {
    const input = createDefaultInput()
    input.transactions = []

    const result = analyzeSpending(input)

    expect(result.summary.totalSpent).toBe(0)
    expect(result.summary.totalIncome).toBe(0)
    expect(result.summary.netChange).toBe(0)
    expect(result.summary.transactionCount).toBe(0)
    expect(result.summary.activeDays).toBe(0)
    expect(result.categories).toEqual([])
    expect(result.topPayees).toEqual([])
  })

  it('skips hidden categories', () => {
    const input = createDefaultInput()
    input.categoryGroups = [
      createMockCategoryGroup({
        id: 'group-1',
        name: 'Food',
        categories: [
          createMockCategory({ id: 'cat-1', name: 'Groceries', hidden: false }),
          createMockCategory({ id: 'cat-hidden', name: 'Hidden Cat', hidden: true }),
        ],
      }),
    ]
    input.transactions = [
      createMockTransaction({ date: '2024-01-15', amount: -50000, category_id: 'cat-1', account_id: 'acc-1' }),
      createMockTransaction({ date: '2024-01-20', amount: -30000, category_id: 'cat-hidden', account_id: 'acc-1' }),
    ]

    const result = analyzeSpending(input)

    // Only cat-1 should appear in categories
    expect(result.categories).toHaveLength(1)
    expect(result.categories[0].categoryName).toBe('Groceries')
  })

  it('skips hidden category groups', () => {
    const input = createDefaultInput()
    input.categoryGroups = [
      createMockCategoryGroup({
        id: 'group-visible',
        name: 'Visible Group',
        hidden: false,
        categories: [createMockCategory({ id: 'cat-1', name: 'Groceries' })],
      }),
      createMockCategoryGroup({
        id: 'group-hidden',
        name: 'Hidden Group',
        hidden: true,
        categories: [createMockCategory({ id: 'cat-2', name: 'Secret' })],
      }),
    ]
    input.transactions = [
      createMockTransaction({ date: '2024-01-15', amount: -50000, category_id: 'cat-1', account_id: 'acc-1' }),
      createMockTransaction({ date: '2024-01-20', amount: -30000, category_id: 'cat-2', account_id: 'acc-1' }),
    ]

    const result = analyzeSpending(input)

    expect(result.categories).toHaveLength(1)
    expect(result.categories[0].categoryName).toBe('Groceries')
  })

  it('sets generatedAt timestamp', () => {
    const input = createDefaultInput()
    const before = new Date().toISOString()

    const result = analyzeSpending(input)

    const after = new Date().toISOString()
    expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(result.generatedAt >= before).toBe(true)
    expect(result.generatedAt <= after).toBe(true)
  })

  it('calculates budget utilization correctly', () => {
    const input = createDefaultInput()
    input.transactions = [
      createMockTransaction({ date: '2024-01-15', amount: -150000, category_id: 'cat-1', account_id: 'acc-1' }), // 75% of 200000
    ]

    const result = analyzeSpending(input)

    const groceries = result.categories.find((c) => c.categoryName === 'Groceries')
    expect(groceries?.budgetUtilization).toBe(75)
    expect(groceries?.isOverBudget).toBe(false)
  })

  it('marks over-budget categories', () => {
    const input = createDefaultInput()
    input.transactions = [
      createMockTransaction({ date: '2024-01-15', amount: -250000, category_id: 'cat-1', account_id: 'acc-1' }), // 125% of 200000
    ]

    const result = analyzeSpending(input)

    const groceries = result.categories.find((c) => c.categoryName === 'Groceries')
    expect(groceries?.budgetUtilization).toBe(125)
    expect(groceries?.isOverBudget).toBe(true)
  })

  it('calculates percent of total for categories', () => {
    const input = createDefaultInput()
    input.transactions = [
      createMockTransaction({ date: '2024-01-15', amount: -80000, category_id: 'cat-1', account_id: 'acc-1' }),
      createMockTransaction({ date: '2024-01-20', amount: -20000, category_id: 'cat-2', account_id: 'acc-1' }),
    ]

    const result = analyzeSpending(input)

    const groceries = result.categories.find((c) => c.categoryName === 'Groceries')
    expect(groceries?.percentOfTotal).toBe(80)
    const dining = result.categories.find((c) => c.categoryName === 'Dining Out')
    expect(dining?.percentOfTotal).toBe(20)
  })
})
