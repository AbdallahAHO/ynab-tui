/**
 * Monthly Spending Report feature.
 *
 * Provides spending analysis and budget comparison for YNAB transactions.
 * Supports both CLI output (JSON/text) and future TUI integration.
 */

// Analyzer
export {
  analyzeSpending,
  filterTransactionsByMonth,
  filterTransactionsByAccount,
  aggregateByCategory,
  aggregateByPayee,
  calculateTrends,
} from './spending-analyzer.js'

// Types
export type {
  ReportOutputFormat,
  ReportOptions,
  CategorySpending,
  PayeeSpending,
  MonthComparison,
  SpendingTrend,
  UncategorizedSummary,
  AccountSpending,
  SpendingReport,
  ReportResult,
  ReportError,
  ReportOutput,
  AnalyzerInput,
  CategoryInfo,
  CategoryAccumulator,
  PayeeAccumulator,
} from './types.js'

// Re-export YNAB types for convenience
export type { TransactionDetail, Category, Account } from './types.js'
