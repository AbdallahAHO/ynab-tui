import { generateObject } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { z } from 'zod'
import type { Payee, Category } from '../shared/ynab-client.js'
import { loadPayeeRules, savePayeeRules, updatePayeeRulesAtomic } from '../config/config-service.js'
import { type PayeeRule, createEmptyPayeeRule, normalizePayeeName } from './payee-types.js'
import { generateCacheKey, getCachedResponse, setCachedResponse } from '../shared/ai-cache.js'
import type { UserContext } from '../config/config-types.js'

interface PayeeServiceConfig {
  openRouterApiKey: string
  model: string
  userContext?: UserContext
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
 * Updates a payee rule atomically (thread-safe)
 */
export const updatePayeeRule = async (
  payeeId: string,
  updates: Partial<PayeeRule>
): Promise<void> => {
  await updatePayeeRulesAtomic((rules) => {
    const index = rules.findIndex((r) => r.payeeId === payeeId)
    if (index === -1) return rules
    rules[index] = { ...rules[index], ...updates }
    return rules
  })
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
  context: z.string().optional().describe('Brief description of the payee (e.g., "German discount supermarket chain")'),
})

export interface PayeeImprovement {
  displayName: string
  tags: string[]
  suggestedCategoryName?: string
  suggestedCategoryId?: string
  context?: string
}

/**
 * Uses AI to suggest an improved name, tags, category, and context for a payee
 * Results are cached for 30 days to save API costs
 */
export const improvePayeeWithAI = async (
  config: PayeeServiceConfig,
  payeeName: string,
  categories: Category[]
): Promise<PayeeImprovement> => {
  // Check cache first
  const cacheKey = generateCacheKey('payee-improve-v2', payeeName, config.model)
  const cached = await getCachedResponse<PayeeImprovement>(cacheKey)

  if (cached) {
    return cached
  }

  const openrouter = createOpenRouter({ apiKey: config.openRouterApiKey })
  const model = openrouter(config.model)

  const categoryNames = categories.map((c) => c.name).join(', ')

  // Build user context section for prompt
  const userContextStr = config.userContext
    ? `
User Context:
${config.userContext.location ? `- Location: ${config.userContext.location.city}, ${config.userContext.location.country}` : ''}
${config.userContext.language ? `- Languages: ${config.userContext.language}` : ''}
`.trim()
    : ''

  const { object } = await generateObject({
    model,
    schema: payeeImprovementSchema,
    schemaName: 'PayeeImprovement',
    schemaDescription: 'Improved payee name, tags, category suggestion, and context',
    system: `You are a payee name improver. Given a raw payee name from a bank transaction, suggest:
1. A clean, human-readable display name (remove transaction codes, standardize capitalization)
2. 1-3 relevant tags for categorization
3. If obvious, the category this payee likely belongs to (must match exactly from the available categories)
4. A brief context description of what this payee is (e.g., "German discount supermarket chain", "Food delivery service")
${userContextStr ? `\n${userContextStr}` : ''}
Available categories: ${categoryNames}`,
    prompt: `Improve this payee name: "${payeeName}"`,
    temperature: 0.3,
  })

  // Match suggested category name to ID
  const result: PayeeImprovement = {
    displayName: object.displayName,
    tags: object.tags,
    suggestedCategoryName: object.suggestedCategoryName,
    context: object.context,
  }

  if (object.suggestedCategoryName) {
    const matchedCategory = categories.find(
      (c) => c.name.toLowerCase() === object.suggestedCategoryName?.toLowerCase()
    )
    if (matchedCategory) {
      result.suggestedCategoryId = matchedCategory.id
      result.suggestedCategoryName = matchedCategory.name // Use exact casing
    }
  }

  // Cache the result
  await setCachedResponse(cacheKey, result)

  return result
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
 * Now also saves context and suggested category
 */
export const bulkTagPayeesWithAI = async (
  config: PayeeServiceConfig,
  payees: PayeeRule[],
  categories: Category[],
  onProgress: (current: number) => void
): Promise<void> => {
  for (const payee of payees) {
    try {
      const improvement = await improvePayeeWithAI(config, payee.payeeName, categories)
      await updatePayeeRule(payee.payeeId, {
        displayName: improvement.displayName,
        aiTags: improvement.tags,
        aiContext: improvement.context,
        suggestedCategoryId: improvement.suggestedCategoryId,
        suggestedCategoryName: improvement.suggestedCategoryName,
      })
    } catch {
      // Skip on error
    }
    onProgress(payees.indexOf(payee) + 1)
  }
}

/**
 * Bulk AI categorization for payees without default categories
 * Returns payees that got suggestions for review
 */
export const bulkCategorizePayeesWithAI = async (
  config: PayeeServiceConfig,
  payees: PayeeRule[],
  categories: Category[],
  onProgress: (current: number) => void
): Promise<PayeeRule[]> => {
  const payeesWithSuggestions: PayeeRule[] = []

  for (const payee of payees) {
    try {
      const improvement = await improvePayeeWithAI(config, payee.payeeName, categories)

      const updates: Partial<PayeeRule> = {
        displayName: improvement.displayName,
        aiTags: improvement.tags,
        aiContext: improvement.context,
      }

      if (improvement.suggestedCategoryId) {
        updates.suggestedCategoryId = improvement.suggestedCategoryId
        updates.suggestedCategoryName = improvement.suggestedCategoryName
      }

      await updatePayeeRule(payee.payeeId, updates)

      if (improvement.suggestedCategoryId) {
        payeesWithSuggestions.push({
          ...payee,
          ...updates,
        } as PayeeRule)
      }
    } catch {
      // Skip on error
    }
    onProgress(payees.indexOf(payee) + 1)
  }

  return payeesWithSuggestions
}

/**
 * Bulk sync all payees to YNAB (rename displayNames)
 */
export const bulkSyncPayeesToYnab = async (
  payees: PayeeRule[],
  ynabClient: { updatePayee: (id: string, name: string) => Promise<void> },
  onProgress: (current: number) => void
): Promise<number> => {
  const toSync = payees.filter(
    (p) => p.displayName !== p.payeeName && !p.syncedToYnab && !p.duplicateOf
  )

  let syncedCount = 0

  for (const payee of toSync) {
    try {
      await ynabClient.updatePayee(payee.payeeId, payee.displayName)
      await updatePayeeRule(payee.payeeId, { syncedToYnab: true })
      syncedCount++
    } catch {
      // Skip on error
    }
    onProgress(toSync.indexOf(payee) + 1)
    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 100))
  }

  return syncedCount
}
