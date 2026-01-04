import type {
  AnalyzerInput,
  ReportOptions,
  SpendingReport,
  CategorySpending,
  PayeeSpending,
  MonthComparison,
  SpendingTrend,
  UncategorizedSummary,
  AccountSpending,
  CategoryAccumulator,
  PayeeAccumulator,
  CategoryInfo,
} from './types.js'
import type {
  TransactionDetail,
  CategoryGroupWithCategories,
  Account,
  Payee,
} from '../shared/ynab-client.js'

/**
 * Checks if a transaction is a transfer (between accounts).
 * Transfers have transfer_account_id set or payee starts with "Transfer".
 */
const isTransfer = (tx: TransactionDetail): boolean =>
  !!tx.transfer_account_id || tx.payee_name?.startsWith('Transfer :') === true

/**
 * Parses a YYYY-MM formatted month string into year and month numbers.
 */
const parseMonth = (month: string): { year: number; month: number } => {
  const [year, monthNum] = month.split('-').map(Number)
  return { year, month: monthNum }
}

/**
 * Checks if a transaction date falls within a given month.
 * Uses string comparison to avoid timezone issues with Date parsing.
 */
const isInMonth = (txDate: string, targetMonth: string): boolean => {
  return txDate.startsWith(targetMonth)
}

/**
 * Gets the previous month in YYYY-MM format.
 */
const getPreviousMonth = (month: string): string => {
  const { year, month: m } = parseMonth(month)
  if (m === 1) {
    return `${year - 1}-12`
  }
  return `${year}-${String(m - 1).padStart(2, '0')}`
}

/**
 * Generates an array of previous months from the target month.
 *
 * @example
 * getPreviousMonths('2024-03', 2) // => ['2024-02', '2024-01']
 */
const getPreviousMonths = (targetMonth: string, count: number): string[] => {
  const months: string[] = []
  let current = targetMonth
  for (let i = 0; i < count; i++) {
    current = getPreviousMonth(current)
    months.push(current)
  }
  return months
}

/**
 * Filters transactions by target month.
 */
export const filterTransactionsByMonth = (
  transactions: TransactionDetail[],
  month: string
): TransactionDetail[] =>
  transactions.filter((tx) => !tx.deleted && isInMonth(tx.date, month))

/**
 * Filters transactions by account ID.
 */
export const filterTransactionsByAccount = (
  transactions: TransactionDetail[],
  accountId: string
): TransactionDetail[] =>
  transactions.filter((tx) => tx.account_id === accountId)

/**
 * Finds account IDs matching a partial name (case-insensitive).
 */
const findMatchingAccountIds = (
  accounts: Account[],
  filter: string
): string[] => {
  const lowerFilter = filter.toLowerCase()
  return accounts
    .filter((a) => a.name.toLowerCase().includes(lowerFilter))
    .map((a) => a.id)
}

/**
 * Builds a category lookup map from category groups.
 */
const buildCategoryLookup = (
  categoryGroups: CategoryGroupWithCategories[],
  targetMonth: string
): Map<string, CategoryInfo> => {
  const lookup = new Map<string, CategoryInfo>()

  for (const group of categoryGroups) {
    if (group.hidden || group.deleted) continue

    for (const cat of group.categories) {
      if (cat.hidden || cat.deleted) continue

      lookup.set(cat.id, {
        id: cat.id,
        name: cat.name,
        groupName: group.name,
        budgeted: cat.budgeted,
      })
    }
  }

  return lookup
}

/**
 * Builds a payee lookup map.
 */
const buildPayeeLookup = (payees: Payee[]): Map<string, string> =>
  new Map(payees.filter((p) => !p.deleted).map((p) => [p.id, p.name]))

/**
 * Aggregates transactions by category.
 * Returns spending breakdown for each category with budget comparison.
 */
export const aggregateByCategory = (
  transactions: TransactionDetail[],
  categoryLookup: Map<string, CategoryInfo>
): CategoryAccumulator => {
  const accumulator: CategoryAccumulator = {}

  for (const tx of transactions) {
    if (!tx.category_id) continue

    const catInfo = categoryLookup.get(tx.category_id)
    if (!catInfo) continue

    if (!accumulator[tx.category_id]) {
      accumulator[tx.category_id] = {
        categoryId: tx.category_id,
        categoryName: catInfo.name,
        groupName: catInfo.groupName,
        spent: 0,
        budgeted: catInfo.budgeted > 0 ? catInfo.budgeted : null,
        transactionCount: 0,
      }
    }

    accumulator[tx.category_id].spent += tx.amount
    accumulator[tx.category_id].transactionCount += 1
  }

  return accumulator
}

/**
 * Converts category accumulator to sorted CategorySpending array.
 * Calculates percentOfTotal and budget utilization.
 */
const finalizeCategorySpending = (
  accumulator: CategoryAccumulator,
  totalSpent: number
): CategorySpending[] => {
  const absoluteTotal = Math.abs(totalSpent) || 1 // Prevent division by zero

  return Object.values(accumulator)
    .map((cat) => {
      const percentOfTotal = (Math.abs(cat.spent) / absoluteTotal) * 100
      const budgetUtilization =
        cat.budgeted !== null && cat.budgeted > 0
          ? (Math.abs(cat.spent) / cat.budgeted) * 100
          : null

      return {
        ...cat,
        percentOfTotal: Math.round(percentOfTotal * 10) / 10,
        budgetUtilization:
          budgetUtilization !== null
            ? Math.round(budgetUtilization * 10) / 10
            : null,
        isOverBudget:
          cat.budgeted !== null && Math.abs(cat.spent) > cat.budgeted,
      }
    })
    .sort((a, b) => a.spent - b.spent) // Most negative (highest spending) first
}

/**
 * Aggregates transactions by payee.
 * Returns top payees by spending amount.
 */
export const aggregateByPayee = (
  transactions: TransactionDetail[],
  payeeLookup: Map<string, string>,
  categoryLookup: Map<string, CategoryInfo>,
  limit: number
): PayeeSpending[] => {
  const accumulator: PayeeAccumulator = {}

  for (const tx of transactions) {
    // Only count expenses (negative amounts)
    if (tx.amount >= 0) continue
    if (!tx.payee_id) continue

    const payeeName = tx.payee_name || payeeLookup.get(tx.payee_id) || 'Unknown'

    if (!accumulator[tx.payee_id]) {
      accumulator[tx.payee_id] = {
        payeeId: tx.payee_id,
        payeeName,
        totalSpent: 0,
        transactionCount: 0,
        categories: new Set(),
      }
    }

    accumulator[tx.payee_id].totalSpent += tx.amount
    accumulator[tx.payee_id].transactionCount += 1

    if (tx.category_id) {
      const catInfo = categoryLookup.get(tx.category_id)
      if (catInfo) {
        accumulator[tx.payee_id].categories.add(catInfo.name)
      }
    }
  }

  const payees = Object.values(accumulator)
  const totalSpent = payees.reduce((sum, p) => sum + p.totalSpent, 0)
  const absoluteTotal = Math.abs(totalSpent) || 1

  return payees
    .sort((a, b) => a.totalSpent - b.totalSpent) // Most negative first
    .slice(0, limit)
    .map((p) => ({
      payeeId: p.payeeId,
      payeeName: p.payeeName,
      totalSpent: p.totalSpent,
      transactionCount: p.transactionCount,
      averageTransaction: Math.round(p.totalSpent / p.transactionCount),
      percentOfTotal:
        Math.round((Math.abs(p.totalSpent) / absoluteTotal) * 1000) / 10,
      categories: [...p.categories].sort(),
    }))
}

/**
 * Aggregates transactions by account.
 */
const aggregateByAccount = (
  transactions: TransactionDetail[],
  accounts: Account[]
): AccountSpending[] => {
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]))
  const accumulator: Record<
    string,
    { spent: number; income: number; count: number }
  > = {}

  for (const tx of transactions) {
    if (!accumulator[tx.account_id]) {
      accumulator[tx.account_id] = { spent: 0, income: 0, count: 0 }
    }

    if (tx.amount < 0) {
      accumulator[tx.account_id].spent += tx.amount
    } else {
      accumulator[tx.account_id].income += tx.amount
    }
    accumulator[tx.account_id].count += 1
  }

  return Object.entries(accumulator)
    .map(([accountId, data]) => ({
      accountId,
      accountName: accountMap.get(accountId) || 'Unknown',
      totalSpent: data.spent,
      totalIncome: data.income,
      transactionCount: data.count,
    }))
    .sort((a, b) => a.totalSpent - b.totalSpent)
}

/**
 * Collects uncategorized transaction summary.
 */
const getUncategorizedSummary = (
  transactions: TransactionDetail[]
): UncategorizedSummary => {
  const uncategorized = transactions.filter((tx) => !tx.category_id)
  const payeeNames = new Set<string>()

  let totalAmount = 0
  for (const tx of uncategorized) {
    totalAmount += tx.amount
    if (tx.payee_name) {
      payeeNames.add(tx.payee_name)
    }
  }

  return {
    count: uncategorized.length,
    totalAmount,
    payees: [...payeeNames].slice(0, 10).sort(),
  }
}

/**
 * Counts unique days with transactions.
 */
const countActiveDays = (transactions: TransactionDetail[]): number => {
  const days = new Set(transactions.map((tx) => tx.date))
  return days.size
}

/**
 * Builds a month comparison summary.
 */
const buildMonthComparison = (
  transactions: TransactionDetail[],
  month: string,
  categoryLookup: Map<string, CategoryInfo>
): MonthComparison => {
  const monthTxs = filterTransactionsByMonth(transactions, month)

  let totalSpent = 0
  let totalIncome = 0
  const categorySpending: Record<string, { name: string; spent: number }> = {}

  for (const tx of monthTxs) {
    if (tx.amount < 0) {
      totalSpent += tx.amount

      if (tx.category_id) {
        const catInfo = categoryLookup.get(tx.category_id)
        if (catInfo) {
          if (!categorySpending[tx.category_id]) {
            categorySpending[tx.category_id] = { name: catInfo.name, spent: 0 }
          }
          categorySpending[tx.category_id].spent += tx.amount
        }
      }
    } else {
      totalIncome += tx.amount
    }
  }

  // Find top category (most negative spending)
  const topCategory = Object.values(categorySpending).sort(
    (a, b) => a.spent - b.spent
  )[0] || null

  return {
    month,
    totalSpent,
    totalIncome,
    netChange: totalIncome + totalSpent,
    transactionCount: monthTxs.length,
    topCategory: topCategory
      ? { name: topCategory.name, spent: topCategory.spent }
      : null,
  }
}

/**
 * Calculates spending trends vs previous periods.
 */
export const calculateTrends = (
  currentMonth: MonthComparison,
  previousMonths: MonthComparison[]
): SpendingTrend => {
  if (previousMonths.length === 0) {
    return {
      vsLastMonth: null,
      vsAverage: null,
      averageMonthlySpending: null,
    }
  }

  // Compare to last month
  const lastMonth = previousMonths[0]
  const vsLastMonth =
    lastMonth.totalSpent !== 0
      ? ((currentMonth.totalSpent - lastMonth.totalSpent) /
          Math.abs(lastMonth.totalSpent)) *
        100
      : null

  // Compare to average of previous months
  const totalPreviousSpending = previousMonths.reduce(
    (sum, m) => sum + m.totalSpent,
    0
  )
  const averageMonthlySpending = totalPreviousSpending / previousMonths.length

  const vsAverage =
    averageMonthlySpending !== 0
      ? ((currentMonth.totalSpent - averageMonthlySpending) /
          Math.abs(averageMonthlySpending)) *
        100
      : null

  return {
    vsLastMonth: vsLastMonth !== null ? Math.round(vsLastMonth * 10) / 10 : null,
    vsAverage: vsAverage !== null ? Math.round(vsAverage * 10) / 10 : null,
    averageMonthlySpending: Math.round(averageMonthlySpending),
  }
}

/**
 * Main analyzer function. Produces a complete spending report from raw data.
 * Pure function with no side effects.
 *
 * @example
 * const report = analyzeSpending({
 *   transactions,
 *   categoryGroups,
 *   accounts,
 *   payees,
 *   options: { month: '2024-01', compareMonths: 3, ... },
 *   budgetName: 'My Budget',
 * })
 */
export const analyzeSpending = (input: AnalyzerInput): SpendingReport => {
  const { transactions, categoryGroups, accounts, payees, options, budgetName } =
    input

  // Build lookup maps
  const categoryLookup = buildCategoryLookup(categoryGroups, options.month)
  const payeeLookup = buildPayeeLookup(payees)

  // Filter transactions for the target month
  let monthTransactions = filterTransactionsByMonth(transactions, options.month)

  // Apply account filter if specified
  if (options.accountFilter) {
    const matchingAccountIds = findMatchingAccountIds(
      accounts,
      options.accountFilter
    )
    if (matchingAccountIds.length > 0) {
      monthTransactions = monthTransactions.filter((tx) =>
        matchingAccountIds.includes(tx.account_id)
      )
    }
  }

  // Exclude transfers unless explicitly included
  if (!options.includeTransfers) {
    monthTransactions = monthTransactions.filter((tx) => !isTransfer(tx))
  }

  // Calculate totals
  let totalSpent = 0
  let totalIncome = 0
  for (const tx of monthTransactions) {
    if (tx.amount < 0) {
      totalSpent += tx.amount
    } else {
      totalIncome += tx.amount
    }
  }

  // Aggregate by category
  const categoryAccumulator = aggregateByCategory(
    monthTransactions,
    categoryLookup
  )
  const categories = finalizeCategorySpending(categoryAccumulator, totalSpent)

  // Aggregate by payee (expenses only)
  const topPayees = aggregateByPayee(
    monthTransactions,
    payeeLookup,
    categoryLookup,
    options.topPayeesLimit
  )

  // Aggregate by account
  const accountSpending = aggregateByAccount(monthTransactions, accounts)

  // Get uncategorized summary
  const uncategorized = getUncategorizedSummary(monthTransactions)

  // Build month comparisons if requested
  const comparison: MonthComparison[] = []
  let trends: SpendingTrend = {
    vsLastMonth: null,
    vsAverage: null,
    averageMonthlySpending: null,
  }

  if (options.compareMonths > 0) {
    const previousMonthStrings = getPreviousMonths(
      options.month,
      options.compareMonths
    )

    // Build comparison for current month
    const currentMonthComparison = buildMonthComparison(
      transactions,
      options.month,
      categoryLookup
    )
    comparison.push(currentMonthComparison)

    // Build comparisons for previous months
    const previousComparisons = previousMonthStrings.map((m) =>
      buildMonthComparison(transactions, m, categoryLookup)
    )
    comparison.push(...previousComparisons)

    // Calculate trends
    trends = calculateTrends(currentMonthComparison, previousComparisons)
  }

  return {
    month: options.month,
    generatedAt: new Date().toISOString(),
    budgetName,
    accountFilter: options.accountFilter,

    summary: {
      totalSpent,
      totalIncome,
      netChange: totalIncome + totalSpent,
      transactionCount: monthTransactions.length,
      categoryCount: categories.length,
      activeDays: countActiveDays(monthTransactions),
    },

    categories,
    topPayees,
    accounts: accountSpending,
    comparison,
    trends,
    uncategorized,
  }
}
