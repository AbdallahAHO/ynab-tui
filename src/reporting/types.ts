/**
 * Types for the Monthly Spending Report feature.
 *
 * These types support both CLI output (JSON/text) and future TUI integration.
 * All monetary values use YNAB milliunits (1000 = $1.00).
 */

// Re-export YNAB types we depend on
export type { TransactionDetail, Category, Account } from '../shared/ynab-client.js'

/**
 * Output format for CLI reporting
 *
 * @example
 * // JSON for piping to jq
 * ynab-tui report --format json | jq '.categories[0]'
 *
 * // Text for human reading
 * ynab-tui report --format text
 */
export type ReportOutputFormat = 'json' | 'text'

/**
 * Options for generating a spending report.
 *
 * @example
 * const options: ReportOptions = {
 *   month: '2024-01',
 *   accountFilter: 'Checking',
 *   compareMonths: 3,
 *   format: 'text',
 *   includeTransfers: false,
 * }
 */
export interface ReportOptions {
  /** Target month in YYYY-MM format */
  month: string
  /** Filter by account name (partial match, case-insensitive) */
  accountFilter?: string
  /** Number of previous months to compare (0 = no comparison) */
  compareMonths: number
  /** Output format */
  format: ReportOutputFormat
  /** Whether to include transfer transactions in the report */
  includeTransfers: boolean
  /** Limit top payees shown (default: 10) */
  topPayeesLimit: number
}

/**
 * Spending breakdown for a single category.
 *
 * @example
 * const groceries: CategorySpending = {
 *   categoryId: 'cat-123',
 *   categoryName: 'Groceries',
 *   groupName: 'Everyday Expenses',
 *   spent: -150000, // -$150.00 in milliunits
 *   budgeted: 200000, // $200.00 budgeted
 *   transactionCount: 8,
 *   percentOfTotal: 25.5,
 *   budgetUtilization: 75.0,
 *   isOverBudget: false,
 * }
 */
export interface CategorySpending {
  categoryId: string
  categoryName: string
  groupName: string
  /** Total spent in milliunits (negative for expenses) */
  spent: number
  /** Budget amount in milliunits (null if no budget set) */
  budgeted: number | null
  /** Number of transactions in this category */
  transactionCount: number
  /** Percentage of total spending this category represents */
  percentOfTotal: number
  /** Budget utilization as percentage (null if no budget) */
  budgetUtilization: number | null
  /** Whether spending exceeded budget */
  isOverBudget: boolean
}

/**
 * Spending breakdown for a single payee.
 *
 * @example
 * const amazon: PayeeSpending = {
 *   payeeId: 'payee-456',
 *   payeeName: 'Amazon',
 *   totalSpent: -75000, // -$75.00
 *   transactionCount: 3,
 *   averageTransaction: -25000, // -$25.00 average
 *   percentOfTotal: 12.5,
 *   categories: ['Shopping', 'Groceries'],
 * }
 */
export interface PayeeSpending {
  payeeId: string
  payeeName: string
  /** Total spent at this payee in milliunits */
  totalSpent: number
  /** Number of transactions with this payee */
  transactionCount: number
  /** Average transaction amount in milliunits */
  averageTransaction: number
  /** Percentage of total spending */
  percentOfTotal: number
  /** Category names this payee was assigned to */
  categories: string[]
}

/**
 * Month-over-month comparison data.
 *
 * @example
 * const comparison: MonthComparison = {
 *   month: '2024-01',
 *   totalSpent: -500000,
 *   totalIncome: 800000,
 *   netChange: 300000,
 *   transactionCount: 45,
 *   topCategory: {
 *     name: 'Dining Out',
 *     spent: -120000,
 *   },
 * }
 */
export interface MonthComparison {
  /** Month in YYYY-MM format */
  month: string
  /** Total spent in milliunits (negative) */
  totalSpent: number
  /** Total income in milliunits (positive) */
  totalIncome: number
  /** Net change (income + spending) */
  netChange: number
  /** Number of transactions */
  transactionCount: number
  /** Category with highest spending */
  topCategory: {
    name: string
    spent: number
  } | null
}

/**
 * Trend data comparing current month to previous periods.
 *
 * @example
 * const trend: SpendingTrend = {
 *   vsLastMonth: -15.5, // 15.5% less spending than last month
 *   vsAverage: 8.2,     // 8.2% more than 3-month average
 *   averageMonthlySpending: -480000,
 * }
 */
export interface SpendingTrend {
  /** Percentage change vs previous month (negative = less spending) */
  vsLastMonth: number | null
  /** Percentage change vs period average */
  vsAverage: number | null
  /** Average monthly spending over comparison period */
  averageMonthlySpending: number | null
}

/**
 * Summary of uncategorized transactions.
 * Helps users identify transactions that need attention.
 */
export interface UncategorizedSummary {
  /** Number of uncategorized transactions */
  count: number
  /** Total amount in milliunits */
  totalAmount: number
  /** List of payee names with uncategorized transactions */
  payees: string[]
}

/**
 * Account-level spending breakdown.
 *
 * @example
 * const checking: AccountSpending = {
 *   accountId: 'acc-789',
 *   accountName: 'Checking',
 *   totalSpent: -400000,
 *   totalIncome: 600000,
 *   transactionCount: 35,
 * }
 */
export interface AccountSpending {
  accountId: string
  accountName: string
  /** Total spending from this account (negative) */
  totalSpent: number
  /** Total income to this account (positive) */
  totalIncome: number
  /** Number of transactions */
  transactionCount: number
}

/**
 * Complete spending report for a month.
 *
 * @example
 * const report: SpendingReport = {
 *   month: '2024-01',
 *   generatedAt: '2024-01-15T10:30:00Z',
 *   budgetName: 'My Budget',
 *   summary: { ... },
 *   categories: [...],
 *   topPayees: [...],
 *   accounts: [...],
 *   comparison: [...],
 *   trends: { ... },
 *   uncategorized: { ... },
 * }
 */
export interface SpendingReport {
  /** Report month in YYYY-MM format */
  month: string
  /** ISO timestamp when report was generated */
  generatedAt: string
  /** Name of the YNAB budget */
  budgetName: string
  /** Account filter applied (if any) */
  accountFilter?: string

  /** High-level spending summary */
  summary: {
    totalSpent: number
    totalIncome: number
    netChange: number
    transactionCount: number
    categoryCount: number
    /** Days in month with transactions */
    activeDays: number
  }

  /** Spending by category, sorted by amount (highest spending first) */
  categories: CategorySpending[]

  /** Top payees by spending amount */
  topPayees: PayeeSpending[]

  /** Spending by account */
  accounts: AccountSpending[]

  /** Month-over-month comparison (empty if compareMonths = 0) */
  comparison: MonthComparison[]

  /** Trend analysis */
  trends: SpendingTrend

  /** Uncategorized transaction summary */
  uncategorized: UncategorizedSummary
}

/**
 * Result type for CLI output.
 * Includes both structured data and formatted text.
 */
export interface ReportResult {
  success: boolean
  report: SpendingReport
  /** Pre-formatted text output (only for text format) */
  formatted?: string
}

/**
 * Error result when report generation fails.
 */
export interface ReportError {
  success: false
  error: string
  details?: unknown
}

/**
 * Union type for report command output.
 */
export type ReportOutput = ReportResult | ReportError

/**
 * Parameters for the spending analyzer function.
 * Used internally to pass data from CLI to analyzer.
 */
export interface AnalyzerInput {
  /** All transactions for the report period */
  transactions: import('../shared/ynab-client.js').TransactionDetail[]
  /** Category groups with budget info */
  categoryGroups: import('../shared/ynab-client.js').CategoryGroupWithCategories[]
  /** Account list */
  accounts: import('../shared/ynab-client.js').Account[]
  /** Payee list */
  payees: import('../shared/ynab-client.js').Payee[]
  /** Report options */
  options: ReportOptions
  /** Budget name for display */
  budgetName: string
}

/**
 * Helper type for category lookup.
 */
export interface CategoryInfo {
  id: string
  name: string
  groupName: string
  budgeted: number
}

/**
 * Helper type for building category spending data.
 * Used internally by the analyzer.
 */
export interface CategoryAccumulator {
  [categoryId: string]: {
    categoryId: string
    categoryName: string
    groupName: string
    spent: number
    budgeted: number | null
    transactionCount: number
  }
}

/**
 * Helper type for building payee spending data.
 * Used internally by the analyzer.
 */
export interface PayeeAccumulator {
  [payeeId: string]: {
    payeeId: string
    payeeName: string
    totalSpent: number
    transactionCount: number
    categories: Set<string>
  }
}
