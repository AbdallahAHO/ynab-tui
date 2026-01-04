import type { ReportOptions } from '../args.js'
import type { AppConfig } from '../../config/config-types.js'
import { createYnabClient } from '../../shared/ynab-client.js'
import { createFormatter, formatTable } from '../output.js'
import { analyzeSpending, type SpendingReport, type ReportResult } from '../../reporting/index.js'

/**
 * Formats milliunits as currency (USD).
 */
const formatMoney = (milliunits: number): string => {
  const dollars = milliunits / 1000
  return dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

/**
 * Formats a percentage with one decimal place.
 */
const formatPercent = (value: number | null): string => {
  if (value === null) return '-'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

/**
 * Creates a progress bar visual for budget utilization.
 */
const progressBar = (percent: number | null, width = 10): string => {
  if (percent === null) return '-'.repeat(width)
  const filled = Math.min(Math.round((percent / 100) * width), width)
  const empty = width - filled
  return `[${'='.repeat(filled)}${' '.repeat(empty)}]`
}

/**
 * Generates a formatted text report for terminal display.
 */
const formatTextReport = (report: SpendingReport): string => {
  const lines: string[] = []
  const divider = '─'.repeat(60)

  // Header
  lines.push('')
  lines.push(`  Monthly Spending Report: ${report.month}`)
  lines.push(`  Budget: ${report.budgetName}`)
  if (report.accountFilter) {
    lines.push(`  Account Filter: ${report.accountFilter}`)
  }
  lines.push(`  Generated: ${new Date(report.generatedAt).toLocaleString()}`)
  lines.push('')
  lines.push(divider)

  // Summary Section
  lines.push('')
  lines.push('  SUMMARY')
  lines.push('')
  lines.push(`  Total Spent:    ${formatMoney(report.summary.totalSpent)}`)
  lines.push(`  Total Income:   ${formatMoney(report.summary.totalIncome)}`)
  lines.push(`  Net Change:     ${formatMoney(report.summary.netChange)}`)
  lines.push('')
  lines.push(`  Transactions:   ${report.summary.transactionCount}`)
  lines.push(`  Categories:     ${report.summary.categoryCount}`)
  lines.push(`  Active Days:    ${report.summary.activeDays}`)

  // Trends Section (if comparison data exists)
  if (report.trends.vsLastMonth !== null || report.trends.vsAverage !== null) {
    lines.push('')
    lines.push(divider)
    lines.push('')
    lines.push('  TRENDS')
    lines.push('')
    if (report.trends.vsLastMonth !== null) {
      const trend = report.trends.vsLastMonth < 0 ? 'less' : 'more'
      lines.push(
        `  vs Last Month:  ${formatPercent(report.trends.vsLastMonth)} (${trend} spending)`
      )
    }
    if (report.trends.vsAverage !== null) {
      const trend = report.trends.vsAverage < 0 ? 'below' : 'above'
      lines.push(
        `  vs Average:     ${formatPercent(report.trends.vsAverage)} (${trend} average)`
      )
    }
    if (report.trends.averageMonthlySpending !== null) {
      lines.push(
        `  Avg Monthly:    ${formatMoney(report.trends.averageMonthlySpending)}`
      )
    }
  }

  // Category Breakdown
  lines.push('')
  lines.push(divider)
  lines.push('')
  lines.push('  SPENDING BY CATEGORY')
  lines.push('')

  if (report.categories.length === 0) {
    lines.push('  No categorized spending found.')
  } else {
    const categoryHeaders = ['Category', 'Spent', 'Budget', 'Used', 'Status']
    const categoryRows = report.categories.slice(0, 15).map((cat) => {
      const status = cat.isOverBudget
        ? 'OVER'
        : cat.budgetUtilization !== null && cat.budgetUtilization > 80
          ? 'WARN'
          : 'OK'
      return [
        `${cat.categoryName.slice(0, 20)}`,
        formatMoney(cat.spent),
        cat.budgeted !== null ? formatMoney(cat.budgeted) : '-',
        cat.budgetUtilization !== null ? `${cat.budgetUtilization.toFixed(0)}%` : '-',
        status,
      ]
    })

    lines.push(formatTable(categoryHeaders, categoryRows))

    if (report.categories.length > 15) {
      lines.push('')
      lines.push(`  ... and ${report.categories.length - 15} more categories`)
    }
  }

  // Top Payees
  lines.push('')
  lines.push(divider)
  lines.push('')
  lines.push('  TOP PAYEES')
  lines.push('')

  if (report.topPayees.length === 0) {
    lines.push('  No payee spending found.')
  } else {
    const payeeHeaders = ['Payee', 'Spent', 'Txns', '% of Total']
    const payeeRows = report.topPayees.map((p) => [
      p.payeeName.slice(0, 25),
      formatMoney(p.totalSpent),
      String(p.transactionCount),
      `${p.percentOfTotal.toFixed(1)}%`,
    ])

    lines.push(formatTable(payeeHeaders, payeeRows))
  }

  // Account Breakdown
  if (report.accounts.length > 1 || report.accountFilter) {
    lines.push('')
    lines.push(divider)
    lines.push('')
    lines.push('  SPENDING BY ACCOUNT')
    lines.push('')

    const accountHeaders = ['Account', 'Spent', 'Income', 'Net', 'Txns']
    const accountRows = report.accounts.map((a) => [
      a.accountName.slice(0, 20),
      formatMoney(a.totalSpent),
      formatMoney(a.totalIncome),
      formatMoney(a.totalIncome + a.totalSpent),
      String(a.transactionCount),
    ])

    lines.push(formatTable(accountHeaders, accountRows))
  }

  // Month Comparison
  if (report.comparison.length > 1) {
    lines.push('')
    lines.push(divider)
    lines.push('')
    lines.push('  MONTH-OVER-MONTH COMPARISON')
    lines.push('')

    const compHeaders = ['Month', 'Spent', 'Income', 'Net', 'Top Category']
    const compRows = report.comparison.map((m) => [
      m.month,
      formatMoney(m.totalSpent),
      formatMoney(m.totalIncome),
      formatMoney(m.netChange),
      m.topCategory ? m.topCategory.name.slice(0, 15) : '-',
    ])

    lines.push(formatTable(compHeaders, compRows))
  }

  // Uncategorized Warning
  if (report.uncategorized.count > 0) {
    lines.push('')
    lines.push(divider)
    lines.push('')
    lines.push('  UNCATEGORIZED TRANSACTIONS')
    lines.push('')
    lines.push(`  Count:  ${report.uncategorized.count}`)
    lines.push(`  Amount: ${formatMoney(report.uncategorized.totalAmount)}`)
    if (report.uncategorized.payees.length > 0) {
      lines.push(`  Payees: ${report.uncategorized.payees.slice(0, 5).join(', ')}`)
    }
  }

  lines.push('')
  lines.push(divider)
  lines.push('')

  return lines.join('\n')
}

/**
 * Validates YYYY-MM format for month.
 */
const validateMonth = (month: string): boolean => {
  const regex = /^\d{4}-(0[1-9]|1[0-2])$/
  if (!regex.test(month)) return false

  const [year] = month.split('-').map(Number)
  const currentYear = new Date().getFullYear()

  // Allow reasonable year range (2010-2030)
  return year >= 2010 && year <= 2030
}

/**
 * Gets the current month in YYYY-MM format.
 */
const getCurrentMonth = (): string => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

/**
 * Gets the first day of a month N months ago (for fetching enough transactions).
 */
const getStartDate = (targetMonth: string, previousMonths: number): string => {
  const [year, month] = targetMonth.split('-').map(Number)
  const date = new Date(year, month - 1 - previousMonths, 1)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Report CLI command implementation.
 *
 * @example
 * ynab-tui report --month 2024-01 --compare 3 --format text
 */
export const reportCommand = async (
  options: ReportOptions,
  config: AppConfig
): Promise<void> => {
  const formatter = createFormatter(options.format, options.quiet)

  // Validate month format
  const month = options.month || getCurrentMonth()
  if (!validateMonth(month)) {
    formatter.error(
      `Invalid month format: "${options.month}"`,
      'Expected format: YYYY-MM (e.g., 2024-01)'
    )
  }

  formatter.progress(`Generating spending report for ${month}...`)

  const client = createYnabClient(
    config.ynab.accessToken,
    config.ynab.defaultBudgetId,
    config.ynab.defaultBudgetName
  )

  // Determine how far back we need to fetch transactions
  const startDate = getStartDate(month, options.compare)
  formatter.progress(`Fetching transactions since ${startDate}...`)

  // Fetch all data in parallel
  const [transactions, categoryGroups, accounts, payees] = await Promise.all([
    client.getTransactions(startDate),
    client.getCategories(),
    client.getAccounts(),
    client.getPayees(),
  ])

  formatter.progress(
    `Analyzing ${transactions.length} transactions across ${categoryGroups.length} category groups...`
  )

  // Run the analyzer
  const report = analyzeSpending({
    transactions,
    categoryGroups,
    accounts,
    payees,
    options: {
      month,
      accountFilter: options.account,
      compareMonths: options.compare,
      format: options.format,
      includeTransfers: false,
      topPayeesLimit: 10,
    },
    budgetName: client.getBudgetName(),
  })

  // Build result
  const result: ReportResult = {
    success: true,
    report,
  }

  // Add formatted text for text mode
  if (options.format === 'text') {
    result.formatted = formatTextReport(report)
  }

  formatter.success(result)
}
