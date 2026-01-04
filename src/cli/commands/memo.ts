import type { MemoOptions } from '../args.js'
import type { AppConfig } from '../../config/config-types.js'
import { createYnabClient, flattenCategories } from '../../shared/ynab-client.js'
import { createCategorizer } from '../../categorization/categorizer.js'
import { buildPayeePatterns } from '../../categorization/history-analyzer.js'
import { buildAIContext } from '../../shared/ai-context.js'
import { loadPayeeRules } from '../../config/config-service.js'
import { createFormatter, formatAmount, formatTable } from '../output.js'

interface MemoResult {
  id: string
  payee: string
  amount: number
  amountFormatted: string
  memo: string
  status: 'applied' | 'skipped' | 'error'
  reason?: string
}

interface MemoCommandResult {
  success: boolean
  summary: {
    total: number
    generated: number
    skipped: number
    errors: number
  }
  results: MemoResult[]
  formatted?: string
}

export const memoCommand = async (
  options: MemoOptions,
  config: AppConfig
): Promise<void> => {
  const formatter = createFormatter(options.format, options.quiet)

  // Validate options
  if (!options.ids && !options.allMissing) {
    formatter.error(
      'Either --ids or --all-missing must be specified',
      'Use --ids=tx1,tx2 to specify transaction IDs, or --all-missing to process all transactions without memos'
    )
  }

  formatter.progress('Connecting to YNAB...')

  const client = createYnabClient(
    config.ynab.accessToken,
    config.ynab.defaultBudgetId,
    config.ynab.defaultBudgetName
  )

  // Fetch data
  formatter.progress('Fetching transactions...')
  const [allTxs, categoryGroups, accounts] = await Promise.all([
    client.getTransactions(),
    client.getCategories(),
    client.getAccounts(),
  ])

  const categories = flattenCategories(categoryGroups)
  const payeeRules = await loadPayeeRules()

  // Determine which transactions to process
  let transactionsToProcess = allTxs.filter((tx) => !tx.deleted)

  if (options.ids) {
    const ids = options.ids.split(',').map((id) => id.trim())
    transactionsToProcess = transactionsToProcess.filter((tx) => ids.includes(tx.id))

    if (transactionsToProcess.length === 0) {
      formatter.error('No transactions found matching the provided IDs')
    }
  } else if (options.allMissing) {
    // Only categorized transactions without memos
    transactionsToProcess = transactionsToProcess.filter(
      (tx) => tx.category_id && (!tx.memo || tx.memo.trim() === '')
    )
  }

  if (transactionsToProcess.length === 0) {
    const result: MemoCommandResult = {
      success: true,
      summary: { total: 0, generated: 0, skipped: 0, errors: 0 },
      results: [],
      formatted: 'No transactions to process.',
    }
    formatter.success(result)
    return
  }

  formatter.progress(`Found ${transactionsToProcess.length} transactions to process`)

  // Build AI context
  formatter.progress('Building AI context...')
  const historicalPatterns = buildPayeePatterns(allTxs, categories)
  const aiContext = buildAIContext({
    userContext: config.userContext,
    accounts,
    payeeRules,
    categories,
    historicalPatterns,
  })

  // Create categorizer for memo generation
  const categorizer = createCategorizer(
    { openRouterApiKey: config.ai.openRouterApiKey, model: config.ai.model },
    aiContext
  )

  // Process transactions
  formatter.progress('Generating memos...')
  const results: MemoResult[] = []
  const updates: Array<{ id: string; memo: string }> = []
  let generated = 0
  let skipped = 0
  let errors = 0

  for (let i = 0; i < transactionsToProcess.length; i++) {
    const tx = transactionsToProcess[i]
    formatter.progress(
      `Processing ${i + 1}/${transactionsToProcess.length}: ${tx.payee_name || 'Unknown'}`
    )

    try {
      // Skip if has memo and not forcing replacement
      if (tx.memo && tx.memo.trim() !== '' && !options.forceReplace) {
        results.push({
          id: tx.id,
          payee: tx.payee_name || 'Unknown',
          amount: tx.amount,
          amountFormatted: formatAmount(tx.amount),
          memo: tx.memo,
          status: 'skipped',
          reason: 'Has existing memo',
        })
        skipped++
        continue
      }

      const memoResult = await categorizer.generateMemo(tx, options.forceReplace)

      if (memoResult) {
        results.push({
          id: tx.id,
          payee: tx.payee_name || 'Unknown',
          amount: tx.amount,
          amountFormatted: formatAmount(tx.amount),
          memo: memoResult.short,
          status: 'applied',
        })
        updates.push({ id: tx.id, memo: memoResult.short })
        generated++
      } else {
        results.push({
          id: tx.id,
          payee: tx.payee_name || 'Unknown',
          amount: tx.amount,
          amountFormatted: formatAmount(tx.amount),
          memo: '',
          status: 'skipped',
          reason: 'No memo generated',
        })
        skipped++
      }
    } catch (error) {
      results.push({
        id: tx.id,
        payee: tx.payee_name || 'Unknown',
        amount: tx.amount,
        amountFormatted: formatAmount(tx.amount),
        memo: '',
        status: 'error',
        reason: error instanceof Error ? error.message : 'Unknown error',
      })
      errors++
    }
  }

  // Apply updates to YNAB
  if (updates.length > 0) {
    formatter.progress(`Saving ${updates.length} memos to YNAB...`)
    await client.updateTransactions(
      updates.map((u) => ({ id: u.id, memo: u.memo }))
    )
  }

  const result: MemoCommandResult = {
    success: true,
    summary: {
      total: transactionsToProcess.length,
      generated,
      skipped,
      errors,
    },
    results,
  }

  // Add formatted text for text mode
  if (options.format === 'text') {
    const lines: string[] = []
    lines.push('Memo generation complete!')
    lines.push('')
    lines.push('Summary:')
    lines.push(`  Total:     ${result.summary.total}`)
    lines.push(`  Generated: ${result.summary.generated}`)
    lines.push(`  Skipped:   ${result.summary.skipped}`)
    lines.push(`  Errors:    ${result.summary.errors}`)

    const appliedResults = results.filter((r) => r.status === 'applied')
    if (appliedResults.length > 0) {
      lines.push('')
      lines.push('Generated memos:')
      const headers = ['Payee', 'Amount', 'Memo']
      const rows = appliedResults.map((r) => [
        r.payee.slice(0, 20),
        r.amountFormatted,
        r.memo.slice(0, 40),
      ])
      lines.push(formatTable(headers, rows))
    }

    result.formatted = lines.join('\n')
  }

  formatter.success(result)

  if (errors > 0) {
    process.exit(2)
  }
}
