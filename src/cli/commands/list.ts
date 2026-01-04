import type { ListOptions } from '../args.js'
import type { AppConfig } from '../../config/config-types.js'
import { createYnabClient, type TransactionDetail } from '../../shared/ynab-client.js'
import { createFormatter, formatAmount, formatTable } from '../output.js'

interface TransactionOutput {
  id: string
  date: string
  payee: string
  amount: number
  amountFormatted: string
  account: string
  category: string | null
  memo: string
}

interface ListResult {
  success: boolean
  count: number
  transactions: TransactionOutput[]
  formatted?: string
}

export const listCommand = async (options: ListOptions, config: AppConfig): Promise<void> => {
  const formatter = createFormatter(options.format, options.quiet)

  formatter.progress('Fetching transactions from YNAB...')

  const client = createYnabClient(
    config.ynab.accessToken,
    config.ynab.defaultBudgetId,
    config.ynab.defaultBudgetName
  )

  // Fetch data in parallel
  const [transactions, accounts, categoryGroups] = await Promise.all([
    options.uncategorized
      ? client.getUncategorizedTransactions(options.since)
      : client.getTransactions(options.since),
    client.getAccounts(),
    client.getCategories(),
  ])

  // Build lookup maps
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]))
  const categoryMap = new Map(
    categoryGroups.flatMap((g) =>
      g.categories.filter((c) => !c.hidden && !c.deleted).map((c) => [c.id, c.name])
    )
  )

  // Filter and transform transactions
  let filtered = transactions.filter((tx) => !tx.deleted)

  // Filter by account name if specified
  if (options.account) {
    const accountNameLower = options.account.toLowerCase()
    const matchingAccountIds = accounts
      .filter((a) => a.name.toLowerCase().includes(accountNameLower))
      .map((a) => a.id)

    if (matchingAccountIds.length === 0) {
      formatter.error(`No account found matching "${options.account}"`)
    }

    filtered = filtered.filter((tx) => matchingAccountIds.includes(tx.account_id))
  }

  // Sort by date (newest first)
  filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // Apply limit
  filtered = filtered.slice(0, options.limit)

  // Transform to output format
  const outputTransactions: TransactionOutput[] = filtered.map((tx) => ({
    id: tx.id,
    date: tx.date,
    payee: tx.payee_name || 'Unknown',
    amount: tx.amount,
    amountFormatted: formatAmount(tx.amount),
    account: accountMap.get(tx.account_id) || 'Unknown',
    category: tx.category_id ? categoryMap.get(tx.category_id) || null : null,
    memo: tx.memo || '',
  }))

  const result: ListResult = {
    success: true,
    count: outputTransactions.length,
    transactions: outputTransactions,
  }

  // Add formatted text for text mode
  if (options.format === 'text') {
    if (outputTransactions.length === 0) {
      result.formatted = 'No transactions found.'
    } else {
      const headers = ['Date', 'Payee', 'Amount', 'Account', 'Category']
      const rows = outputTransactions.map((tx) => [
        tx.date,
        tx.payee.slice(0, 30),
        tx.amountFormatted,
        tx.account.slice(0, 15),
        tx.category || '(uncategorized)',
      ])
      result.formatted = `Found ${result.count} transactions:\n\n${formatTable(headers, rows)}`
    }
  }

  formatter.success(result)
}
