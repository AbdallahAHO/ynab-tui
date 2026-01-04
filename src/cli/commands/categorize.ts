import type { CategorizeOptions } from '../args.js'
import type { AppConfig } from '../../config/config-types.js'
import {
  createYnabClient,
  flattenCategories,
  type TransactionDetail,
} from '../../shared/ynab-client.js'
import { createCategorizer } from '../../categorization/categorizer.js'
import { buildPayeePatterns } from '../../categorization/history-analyzer.js'
import { buildAIContext } from '../../shared/ai-context.js'
import { loadPayeeRules } from '../../config/config-service.js'
import { createFormatter, formatAmount, formatTable } from '../output.js'

interface CategorizedTransaction {
  id: string
  payee: string
  amount: number
  amountFormatted: string
  category: string
  confidence: number
  memo?: string
  status: 'applied' | 'dry-run'
}

interface SkippedTransaction {
  id: string
  payee: string
  amount: number
  amountFormatted: string
  reason: 'low_confidence' | 'error'
  confidence?: number
  error?: string
}

interface CategorizeResult {
  success: boolean
  summary: {
    total: number
    categorized: number
    skipped: number
    errors: number
  }
  transactions: CategorizedTransaction[]
  skipped: SkippedTransaction[]
  formatted?: string
}

export const categorizeCommand = async (
  options: CategorizeOptions,
  config: AppConfig
): Promise<void> => {
  const formatter = createFormatter(options.format, options.quiet)

  formatter.progress('Connecting to YNAB...')

  const client = createYnabClient(
    config.ynab.accessToken,
    config.ynab.defaultBudgetId,
    config.ynab.defaultBudgetName
  )

  // Fetch all required data
  formatter.progress('Fetching transactions and categories...')
  const [uncategorizedTxs, allTxs, categoryGroups, accounts, payees] = await Promise.all([
    client.getUncategorizedTransactions(options.since),
    client.getTransactions(options.since),
    client.getCategories(),
    client.getAccounts(),
    client.getPayees(),
  ])

  const categories = flattenCategories(categoryGroups)
  const payeeRules = await loadPayeeRules()

  // Filter by account if specified
  let transactionsToProcess = uncategorizedTxs
  if (options.account) {
    const accountNameLower = options.account.toLowerCase()
    const matchingAccountIds = accounts
      .filter((a) => a.name.toLowerCase().includes(accountNameLower))
      .map((a) => a.id)

    if (matchingAccountIds.length === 0) {
      formatter.error(`No account found matching "${options.account}"`)
    }

    transactionsToProcess = transactionsToProcess.filter((tx) =>
      matchingAccountIds.includes(tx.account_id)
    )
  }

  if (transactionsToProcess.length === 0) {
    const result: CategorizeResult = {
      success: true,
      summary: { total: 0, categorized: 0, skipped: 0, errors: 0 },
      transactions: [],
      skipped: [],
      formatted: 'No uncategorized transactions found.',
    }
    formatter.success(result)
    return
  }

  formatter.progress(`Found ${transactionsToProcess.length} uncategorized transactions`)

  // Build AI context from historical data
  formatter.progress('Building AI context from history...')
  const historicalPatterns = buildPayeePatterns(allTxs, categories)
  const aiContext = buildAIContext({
    userContext: config.userContext,
    accounts,
    payeeRules,
    categories,
    historicalPatterns,
  })

  // Create categorizer
  const categorizer = createCategorizer(
    { openRouterApiKey: config.ai.openRouterApiKey, model: config.ai.model },
    aiContext
  )

  // Process transactions
  formatter.progress('Categorizing transactions...')
  const categorizedTxs: CategorizedTransaction[] = []
  const skippedTxs: SkippedTransaction[] = []
  const updates: Array<{ id: string; category_id: string; memo?: string }> = []
  let errorCount = 0

  for (let i = 0; i < transactionsToProcess.length; i++) {
    const tx = transactionsToProcess[i]
    formatter.progress(`Processing ${i + 1}/${transactionsToProcess.length}: ${tx.payee_name || 'Unknown'}`)

    try {
      const result = await categorizer.categorize(tx)

      if (result.confidence >= options.threshold) {
        const entry: CategorizedTransaction = {
          id: tx.id,
          payee: tx.payee_name || 'Unknown',
          amount: tx.amount,
          amountFormatted: formatAmount(tx.amount),
          category: result.categoryName,
          confidence: result.confidence,
          status: options.dryRun ? 'dry-run' : 'applied',
        }

        // Handle memo generation if requested
        if (options.applyMemos && result.suggestedMemo) {
          entry.memo = result.suggestedMemo.short
        }

        categorizedTxs.push(entry)

        if (!options.dryRun) {
          updates.push({
            id: tx.id,
            category_id: result.categoryId,
            ...(entry.memo ? { memo: entry.memo } : {}),
          })
        }
      } else {
        skippedTxs.push({
          id: tx.id,
          payee: tx.payee_name || 'Unknown',
          amount: tx.amount,
          amountFormatted: formatAmount(tx.amount),
          reason: 'low_confidence',
          confidence: result.confidence,
        })
      }
    } catch (error) {
      errorCount++
      skippedTxs.push({
        id: tx.id,
        payee: tx.payee_name || 'Unknown',
        amount: tx.amount,
        amountFormatted: formatAmount(tx.amount),
        reason: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  // Apply updates to YNAB
  if (!options.dryRun && updates.length > 0) {
    formatter.progress(`Saving ${updates.length} categorizations to YNAB...`)
    await client.updateTransactions(updates)
  }

  const result: CategorizeResult = {
    success: true,
    summary: {
      total: transactionsToProcess.length,
      categorized: categorizedTxs.length,
      skipped: skippedTxs.length,
      errors: errorCount,
    },
    transactions: categorizedTxs,
    skipped: skippedTxs,
  }

  // Add formatted text for text mode
  if (options.format === 'text') {
    const lines: string[] = []
    lines.push(`${options.dryRun ? '[DRY RUN] ' : ''}Categorization complete!`)
    lines.push('')
    lines.push(`Summary:`)
    lines.push(`  Total:       ${result.summary.total}`)
    lines.push(`  Categorized: ${result.summary.categorized}`)
    lines.push(`  Skipped:     ${result.summary.skipped}`)
    lines.push(`  Errors:      ${result.summary.errors}`)

    if (categorizedTxs.length > 0) {
      lines.push('')
      lines.push('Categorized transactions:')
      const headers = ['Payee', 'Amount', 'Category', 'Confidence']
      const rows = categorizedTxs.map((tx) => [
        tx.payee.slice(0, 25),
        tx.amountFormatted,
        tx.category.slice(0, 20),
        `${Math.round(tx.confidence * 100)}%`,
      ])
      lines.push(formatTable(headers, rows))
    }

    if (skippedTxs.length > 0) {
      lines.push('')
      lines.push('Skipped transactions:')
      const headers = ['Payee', 'Amount', 'Reason']
      const rows = skippedTxs.map((tx) => [
        tx.payee.slice(0, 25),
        tx.amountFormatted,
        tx.reason === 'low_confidence'
          ? `Low confidence (${Math.round((tx.confidence || 0) * 100)}%)`
          : `Error: ${tx.error}`,
      ])
      lines.push(formatTable(headers, rows))
    }

    result.formatted = lines.join('\n')
  }

  formatter.success(result)

  // Exit with code 2 if partial success (some errors)
  if (errorCount > 0) {
    process.exit(2)
  }
}
