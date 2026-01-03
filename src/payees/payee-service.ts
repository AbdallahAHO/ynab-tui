import { generateObject } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { z } from 'zod'
import type { Payee, Category } from '../shared/ynab-client.js'
import { loadPayeeRules, savePayeeRules } from '../config/config-service.js'
import { type PayeeRule, createEmptyPayeeRule, normalizePayeeName } from './payee-types.js'
import { generateCacheKey, getCachedResponse, setCachedResponse } from '../shared/ai-cache.js'

interface PayeeServiceConfig {
  openRouterApiKey: string
  model: string
}

export interface SyncResult {
  newPayees: PayeeRule[]
  updatedCount: number
  totalCount: number
}

/**
 * Syncs payees from YNAB API with local rules.
 * Detects NEW payees and marks them with isNew: true
 */
export const syncPayeesWithYnab = async (
  ynabPayees: Payee[]
): Promise<SyncResult> => {
  const existingRules = await loadPayeeRules()
  const existingById = new Map(existingRules.map((r) => [r.payeeId, r]))

  const newPayees: PayeeRule[] = []
  const mergedRules: PayeeRule[] = []

  for (const payee of ynabPayees) {
    const existing = existingById.get(payee.id)

    if (existing) {
      // Update lastSeen, keep existing configuration
      mergedRules.push({
        ...existing,
        payeeName: payee.name ?? existing.payeeName,
        lastSeen: new Date().toISOString().split('T')[0],
      })
    } else {
      // New payee - create with isNew flag
      const newRule = createEmptyPayeeRule(payee.id, payee.name ?? 'Unknown')
      newPayees.push(newRule)
      mergedRules.push(newRule)
    }
  }

  await savePayeeRules(mergedRules)

  return {
    newPayees,
    updatedCount: mergedRules.length - newPayees.length,
    totalCount: mergedRules.length,
  }
}

/**
 * Returns payees that need configuration (isNew: true)
 */
export const getNewPayees = async (): Promise<PayeeRule[]> => {
  const rules = await loadPayeeRules()
  return rules.filter((r) => r.isNew)
}

/**
 * Finds a payee rule by normalized payee name
 */
export const findPayeeRule = async (
  payeeName: string
): Promise<PayeeRule | undefined> => {
  const rules = await loadPayeeRules()
  const normalized = normalizePayeeName(payeeName)
  return rules.find((r) => r.normalizedName === normalized)
}

/**
 * Updates a payee rule and saves
 */
export const updatePayeeRule = async (
  payeeId: string,
  updates: Partial<PayeeRule>
): Promise<void> => {
  const rules = await loadPayeeRules()
  const index = rules.findIndex((r) => r.payeeId === payeeId)

  if (index === -1) return

  rules[index] = { ...rules[index], ...updates }
  await savePayeeRules(rules)
}

/**
 * Marks a payee as configured (no longer new)
 */
export const markPayeeConfigured = async (payeeId: string): Promise<void> => {
  await updatePayeeRule(payeeId, { isNew: false })
}

// AI response schema for payee improvement
const payeeImprovementSchema = z.object({
  displayName: z.string().describe('Clean, human-readable payee name'),
  tags: z.array(z.string()).describe('Categorization tags like grocery, subscription, utility'),
  suggestedCategoryName: z.string().optional().describe('Suggested category name if obvious'),
})

/**
 * Uses AI to suggest an improved name and tags for a payee
 * Results are cached for 30 days to save API costs
 */
export const improvePayeeWithAI = async (
  config: PayeeServiceConfig,
  payeeName: string,
  categories: Category[]
): Promise<{
  displayName: string
  tags: string[]
  suggestedCategoryName?: string
}> => {
  // Check cache first
  const cacheKey = generateCacheKey('payee-improve', payeeName, config.model)
  const cached = await getCachedResponse<{
    displayName: string
    tags: string[]
    suggestedCategoryName?: string
  }>(cacheKey)

  if (cached) {
    return cached
  }

  const openrouter = createOpenRouter({ apiKey: config.openRouterApiKey })
  const model = openrouter(config.model)

  const categoryNames = categories.map((c) => c.name).join(', ')

  const { object } = await generateObject({
    model,
    schema: payeeImprovementSchema,
    schemaName: 'PayeeImprovement',
    schemaDescription: 'Improved payee name and tags',
    system: `You are a payee name improver. Given a raw payee name from a bank transaction, suggest:
1. A clean, human-readable display name (remove transaction codes, standardize capitalization)
2. 1-3 relevant tags for categorization
3. If obvious, the category this payee likely belongs to

Available categories: ${categoryNames}`,
    prompt: `Improve this payee name: "${payeeName}"`,
    temperature: 0.3,
  })

  // Cache the result
  await setCachedResponse(cacheKey, object)

  return object
}

/**
 * Batch tags payees that don't have tags yet
 */
export const tagPayeesWithAI = async (
  config: PayeeServiceConfig,
  categories: Category[]
): Promise<number> => {
  const rules = await loadPayeeRules()
  const untagged = rules.filter((r) => r.aiTags.length === 0)

  if (untagged.length === 0) return 0

  let taggedCount = 0

  // Process in small batches
  for (const rule of untagged.slice(0, 10)) {
    try {
      const improvement = await improvePayeeWithAI(config, rule.payeeName, categories)
      await updatePayeeRule(rule.payeeId, {
        aiTags: improvement.tags,
        displayName: improvement.displayName,
      })
      taggedCount++
    } catch {
      // Skip on error
    }
  }

  return taggedCount
}

/**
 * Gets all payee rules sorted by lastSeen
 */
export const getAllPayeeRules = async (): Promise<PayeeRule[]> => {
  const rules = await loadPayeeRules()
  return rules.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
}

/**
 * Sets the default category for a payee
 */
export const setPayeeCategory = async (
  payeeId: string,
  categoryId: string,
  categoryName: string
): Promise<void> => {
  await updatePayeeRule(payeeId, {
    defaultCategoryId: categoryId,
    defaultCategoryName: categoryName,
    isNew: false,
  })
}

/**
 * Bulk AI tagging for selected payees with progress callback
 */
export const bulkTagPayeesWithAI = async (
  config: PayeeServiceConfig,
  payees: PayeeRule[],
  categories: Category[],
  onProgress: (current: number) => void
): Promise<void> => {
  const concurrency = 3

  for (let i = 0; i < payees.length; i += concurrency) {
    const batch = payees.slice(i, i + concurrency)

    await Promise.all(
      batch.map(async (payee) => {
        try {
          const improvement = await improvePayeeWithAI(config, payee.payeeName, categories)
          await updatePayeeRule(payee.payeeId, {
            displayName: improvement.displayName,
            aiTags: improvement.tags,
          })
        } catch {
          // Skip on error
        }
      })
    )

    onProgress(Math.min(i + concurrency, payees.length))
  }
}
