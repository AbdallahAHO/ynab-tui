import { generateObject } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { TransactionDetail } from '../shared/ynab-client.js'
import {
  categorizationResultSchema,
  memoGenerationResultSchema,
  type CategorizationResult,
  type MemoGenerationResult,
} from './categorization-types.js'
import { normalizePayeeName } from '../payees/payee-types.js'
import { generateCacheKey, getCachedResponse, setCachedResponse } from '../shared/ai-cache.js'
import { type AIContext, formatContextForPrompt, getAccountInfo } from '../shared/ai-context.js'

interface CategorizerConfig {
  openRouterApiKey: string
  model: string
}

interface Categorizer {
  categorize: (transaction: TransactionDetail) => Promise<CategorizationResult>
  categorizeBatch: (transactions: TransactionDetail[]) => Promise<Map<string, CategorizationResult>>
  generateMemo: (transaction: TransactionDetail, forceReplace?: boolean) => Promise<MemoGenerationResult | null>
  generateMemoBatch: (transactions: TransactionDetail[], forceReplace?: boolean) => Promise<Map<string, MemoGenerationResult>>
}

/**
 * Creates an AI categorizer with rich context from user settings, accounts, and history.
 *
 * @example
 * const ctx = buildAIContext({ userContext, accounts, payeeRules, categories, historicalPatterns })
 * const categorizer = createCategorizer(config, ctx)
 * const result = await categorizer.categorize(transaction)
 */
export const createCategorizer = (
  config: CategorizerConfig,
  aiContext: AIContext
): Categorizer => {
  const openrouter = createOpenRouter({ apiKey: config.openRouterApiKey })
  const model = openrouter(config.model)

  // Build system prompt with all context
  const contextStr = formatContextForPrompt(aiContext, {
    includeUser: true,
    includeAccounts: true,
    includePayees: true,
    includeCategories: true,
    includePatterns: true,
    patternLimit: 50,
  })

  const systemPrompt = `You are a YNAB transaction categorizer. Assign the most appropriate category to transactions based on payee name, memo, amount, and account context.

${contextStr}

## Category Rules
1. ONLY use category IDs from the list above - never make up IDs
2. Match payee patterns first - if we've seen this payee before, use the historical category
3. Consider the account context - personal spending vs joint vs business accounts
4. Consider the amount context (restaurants vs groceries, etc.)
5. Use memo hints if available
6. For uncertain matches, provide lower confidence and good alternatives
7. Confidence should reflect how certain you are:
   - 0.9+ = Very confident, clear pattern match
   - 0.7-0.9 = Reasonably confident
   - 0.5-0.7 = Educated guess
   - <0.5 = Uncertain, alternatives are equally valid

## Memo Generation
If the transaction has NO memo (indicated as "Memo: [empty]"), suggest two memo options:
- short: Brief context note, 2-5 words (e.g., "Weekly groceries", "Netflix subscription", "Gas fill-up")
- detailed: Why this category was chosen (e.g., "Whole Foods purchase categorized as Groceries")

If the transaction already HAS a memo, do NOT include suggestedMemo in your response.`

  // Find a matching payee rule for instant categorization (no AI needed)
  const findPayeeRule = (payeeName: string) => {
    const normalized = normalizePayeeName(payeeName)
    return aiContext.payees.rules.find(
      (r) => r.normalizedName === normalized && r.defaultCategoryId
    )
  }

  const categorize = async (
    transaction: TransactionDetail
  ): Promise<CategorizationResult> => {
    // Check payee rules first for instant categorization
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

    // Check cache (only for transactions without memos)
    const cacheKey = !hasMemo
      ? generateCacheKey('categorize', transaction.payee_name ?? '', amount < 0 ? 'expense' : 'income', config.model)
      : null

    if (cacheKey) {
      const cached = await getCachedResponse<CategorizationResult>(cacheKey)
      if (cached) return cached
    }

    // Build transaction prompt with account context
    const accountInfo = getAccountInfo(transaction.account_id, aiContext)
    const accountLine = accountInfo
      ? `Account: ${accountInfo.name}${accountInfo.userContext ? ` (${accountInfo.userContext})` : ''}`
      : ''

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
Date: ${transaction.date}
${accountLine}`.trim(),
      temperature: 0.3,
    })

    // Validate category ID exists
    const validCategoryIds = new Set(aiContext.categories.list.map((c) => c.id))
    if (!validCategoryIds.has(object.categoryId)) {
      const matchByName = aiContext.categories.list.find(
        (c) => c.name.toLowerCase() === object.categoryName.toLowerCase()
      )
      if (matchByName) {
        object.categoryId = matchByName.id
      }
    }

    // Cache the result
    if (cacheKey) {
      await setCachedResponse(cacheKey, object)
    }

    return object
  }

  const categorizeBatch = async (
    transactions: TransactionDetail[]
  ): Promise<Map<string, CategorizationResult>> => {
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

  const memoSystemPrompt = `You are a YNAB memo generator. Generate concise, helpful memos for transactions that describe what the purchase was for.

${contextStr}

## Memo Guidelines
1. short: Brief context (2-5 words) - e.g., "Weekly groceries", "Netflix subscription", "Work lunch"
2. detailed: More descriptive with context - e.g., "Grocery shopping at Whole Foods for the week"

Be specific but concise. Focus on what the transaction was FOR, not just what it was.`

  const generateMemo = async (
    transaction: TransactionDetail,
    forceReplace = false
  ): Promise<MemoGenerationResult | null> => {
    const hasMemo = Boolean(transaction.memo && transaction.memo.trim())

    // Skip if has memo and not forcing replacement
    if (hasMemo && !forceReplace) return null

    const amount = transaction.amount / 1000
    const normalizedPayee = normalizePayeeName(transaction.payee_name ?? '')
    const categoryId = transaction.category_id ?? 'uncategorized'

    // Check cache
    const cacheKey = generateCacheKey('memo', normalizedPayee, categoryId, config.model)
    const cached = await getCachedResponse<MemoGenerationResult>(cacheKey)
    if (cached) return cached

    // Build prompt with account context
    const accountInfo = getAccountInfo(transaction.account_id, aiContext)
    const accountLine = accountInfo
      ? `Account: ${accountInfo.name}${accountInfo.userContext ? ` (${accountInfo.userContext})` : ''}`
      : ''

    const categoryName = aiContext.categories.list.find((c) => c.id === transaction.category_id)?.name ?? 'Uncategorized'

    const { object } = await generateObject({
      model,
      schema: memoGenerationResultSchema,
      schemaName: 'MemoGeneration',
      schemaDescription: 'Generated memo for a YNAB transaction',
      system: memoSystemPrompt,
      prompt: `Generate a memo for this transaction:
Payee: ${transaction.payee_name || 'Unknown'}
Amount: ${amount < 0 ? `expense of $${Math.abs(amount).toFixed(2)}` : `income of $${amount.toFixed(2)}`}
Category: ${categoryName}
Date: ${transaction.date}
${hasMemo ? `Current memo: ${transaction.memo}` : ''}
${accountLine}`.trim(),
      temperature: 0.4,
    })

    // Cache the result
    await setCachedResponse(cacheKey, object)

    return object
  }

  const generateMemoBatch = async (
    transactions: TransactionDetail[],
    forceReplace = false
  ): Promise<Map<string, MemoGenerationResult>> => {
    const results = new Map<string, MemoGenerationResult>()
    const concurrency = 3

    for (let i = 0; i < transactions.length; i += concurrency) {
      const batch = transactions.slice(i, i + concurrency)
      const batchResults = await Promise.all(
        batch.map(async (tx) => {
          try {
            const result = await generateMemo(tx, forceReplace)
            return result ? ([tx.id, result] as const) : null
          } catch {
            return null
          }
        })
      )

      for (const item of batchResults) {
        if (item) results.set(item[0], item[1])
      }
    }

    return results
  }

  return { categorize, categorizeBatch, generateMemo, generateMemoBatch }
}
