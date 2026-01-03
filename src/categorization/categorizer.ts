import { generateObject } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { TransactionDetail, Category } from '../shared/ynab-client.js'
import { categorizationResultSchema, type CategorizationResult, type PayeePattern } from './categorization-types.js'
import { formatPatternsForPrompt } from './history-analyzer.js'
import type { PayeeRule } from '../payees/payee-types.js'
import { normalizePayeeName } from '../payees/payee-types.js'
import type { UserContext } from '../config/config-types.js'
import { generateCacheKey, getCachedResponse, setCachedResponse } from '../shared/ai-cache.js'

interface CategorizerConfig {
  openRouterApiKey: string
  model: string
  payeeRules?: PayeeRule[]
  userContext?: UserContext
}

interface Categorizer {
  categorize: (transaction: TransactionDetail) => Promise<CategorizationResult>
  categorizeBatch: (transactions: TransactionDetail[]) => Promise<Map<string, CategorizationResult>>
}

/**
 * Creates an AI categorizer with historical context.
 *
 * @example
 * const categorizer = createCategorizer(config, categories, patterns)
 * const result = await categorizer.categorize(transaction)
 * // => { categoryId: 'cat-1', categoryName: 'Groceries', confidence: 0.92, ... }
 */
export const createCategorizer = (
  config: CategorizerConfig,
  categories: Category[],
  historicalPatterns: PayeePattern[]
): Categorizer => {
  const openrouter = createOpenRouter({ apiKey: config.openRouterApiKey })
  const model = openrouter(config.model)
  const payeeRules = config.payeeRules ?? []

  const categoryList = categories
    .map((c) => `- ${c.id}: ${c.name}`)
    .join('\n')

  const patternsContext = formatPatternsForPrompt(historicalPatterns)

  // Build user context section for prompt
  const userContextStr = config.userContext
    ? `
## User Context
${config.userContext.location ? `- Location: ${config.userContext.location.city}, ${config.userContext.location.country}` : ''}
${config.userContext.language ? `- Languages: ${config.userContext.language}` : ''}
${config.userContext.partner ? `- Partner: ${config.userContext.partner.name} (${config.userContext.partner.context})` : ''}
${config.userContext.transactionSources ? `- Transaction sources: ${config.userContext.transactionSources}` : ''}
`.trim()
    : ''

  const systemPrompt = `You are a YNAB transaction categorizer. Assign the most appropriate category to transactions based on payee name, memo, and amount.

## Available Categories
${categoryList}

## Historical Patterns (payee → most common category)
${patternsContext || 'No historical data available yet.'}
${userContextStr}

## Category Rules
1. ONLY use category IDs from the list above - never make up IDs
2. Match payee patterns first - if we've seen this payee before, use the historical category
3. Consider the amount context (restaurants vs groceries, etc.)
4. Use memo hints if available
5. For uncertain matches, provide lower confidence and good alternatives
6. Confidence should reflect how certain you are:
   - 0.9+ = Very confident, clear pattern match
   - 0.7-0.9 = Reasonably confident
   - 0.5-0.7 = Educated guess
   - <0.5 = Uncertain, alternatives are equally valid

## Memo Generation
If the transaction has NO memo (indicated as "Memo: [empty]"), suggest two memo options:
- short: Brief context note, 2-5 words (e.g., "Weekly groceries", "Netflix subscription", "Gas fill-up")
- detailed: Why this category was chosen (e.g., "Whole Foods purchase categorized as Groceries")

If the transaction already HAS a memo, do NOT include suggestedMemo in your response.`

  // Find a matching payee rule for instant categorization
  const findPayeeRule = (payeeName: string): PayeeRule | undefined => {
    const normalized = normalizePayeeName(payeeName)
    return payeeRules.find((r) => r.normalizedName === normalized && r.defaultCategoryId)
  }

  const categorize = async (
    transaction: TransactionDetail
  ): Promise<CategorizationResult> => {
    // Check payee rules first for instant categorization (no AI needed)
    const payeeRule = findPayeeRule(transaction.payee_name ?? '')
    if (payeeRule && payeeRule.defaultCategoryId && payeeRule.defaultCategoryName) {
      return {
        categoryId: payeeRule.defaultCategoryId,
        categoryName: payeeRule.defaultCategoryName,
        confidence: 0.99,
        reasoning: `Matched payee rule: "${payeeRule.displayName}"`,
        alternatives: [],
      }
    }

    const amount = transaction.amount / 1000
    const amountStr = amount < 0 ? `expense of ${Math.abs(amount).toFixed(2)}` : `income of ${amount.toFixed(2)}`
    const hasMemo = Boolean(transaction.memo && transaction.memo.trim())

    // Check cache (only for transactions without memos - memos add unique context)
    const cacheKey = !hasMemo
      ? generateCacheKey('categorize', transaction.payee_name ?? '', amount < 0 ? 'expense' : 'income', config.model)
      : null

    if (cacheKey) {
      const cached = await getCachedResponse<CategorizationResult>(cacheKey)
      if (cached) return cached
    }

    const { object } = await generateObject({
      model,
      schema: categorizationResultSchema,
      schemaName: 'TransactionCategorization',
      schemaDescription: 'Categorization result for a YNAB transaction',
      system: systemPrompt,
      prompt: `Categorize this transaction:
Payee: ${transaction.payee_name || 'Unknown'}
Amount: ${amountStr}
Memo: ${hasMemo ? transaction.memo : '[empty]'}
Date: ${transaction.date}`,
      temperature: 0.3, // Lower for consistency
    })

    // Validate category ID exists
    const validCategoryIds = new Set(categories.map((c) => c.id))
    if (!validCategoryIds.has(object.categoryId)) {
      // Fallback: find category by name
      const matchByName = categories.find(
        (c) => c.name.toLowerCase() === object.categoryName.toLowerCase()
      )
      if (matchByName) {
        object.categoryId = matchByName.id
      }
    }

    // Cache the result (only for no-memo transactions)
    if (cacheKey) {
      await setCachedResponse(cacheKey, object)
    }

    return object
  }

  const categorizeBatch = async (
    transactions: TransactionDetail[]
  ): Promise<Map<string, CategorizationResult>> => {
    // Process in parallel with concurrency limit
    const results = new Map<string, CategorizationResult>()
    const concurrency = 3

    for (let i = 0; i < transactions.length; i += concurrency) {
      const batch = transactions.slice(i, i + concurrency)
      const batchResults = await Promise.all(
        batch.map(async (tx) => {
          try {
            const result = await categorize(tx)
            return [tx.id, result] as const
          } catch (error) {
            // Return a low-confidence fallback on error
            const fallback: CategorizationResult = {
              categoryId: '',
              categoryName: 'Error',
              confidence: 0,
              reasoning: `Failed to categorize: ${error instanceof Error ? error.message : 'Unknown error'}`,
              alternatives: [],
            }
            return [tx.id, fallback] as const
          }
        })
      )

      for (const [id, result] of batchResults) {
        results.set(id, result)
      }
    }

    return results
  }

  return { categorize, categorizeBatch }
}
