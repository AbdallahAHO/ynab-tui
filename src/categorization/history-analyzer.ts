import type { TransactionDetail, Category } from '../shared/ynab-client.js'
import type { PayeePattern } from './categorization-types.js'

/**
 * Normalizes a payee name for matching.
 * Removes special characters, converts to lowercase, truncates.
 */
const normalizePayeeName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 30)

/**
 * Builds payee-to-category patterns from historical transactions.
 * Analyzes past categorization decisions to learn user preferences.
 *
 * @example
 * const patterns = buildPayeePatterns(transactions, categories)
 * // => [{ payeeName: "Amazon", categoryName: "Groceries", confidence: 0.85 }, ...]
 */
export const buildPayeePatterns = (
  transactions: TransactionDetail[],
  categories: Category[]
): PayeePattern[] => {
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]))

  // Group transactions by normalized payee name
  const payeeGroups = new Map<
    string,
    {
      categories: Map<string, number>
      originalName: string
    }
  >()

  for (const tx of transactions) {
    // Only learn from categorized, non-deleted transactions
    if (!tx.category_id || !tx.payee_name || tx.deleted) continue

    const normalized = normalizePayeeName(tx.payee_name)
    if (!normalized) continue

    if (!payeeGroups.has(normalized)) {
      payeeGroups.set(normalized, {
        categories: new Map(),
        originalName: tx.payee_name,
      })
    }

    const group = payeeGroups.get(normalized)!
    const count = group.categories.get(tx.category_id) || 0
    group.categories.set(tx.category_id, count + 1)
  }

  // Convert to patterns with confidence scores
  const patterns: PayeePattern[] = []

  for (const [normalized, group] of payeeGroups.entries()) {
    if (group.categories.size === 0) continue

    // Find the most common category for this payee
    const entries = [...group.categories.entries()]
    const [topCategoryId, topCount] = entries.sort((a, b) => b[1] - a[1])[0]
    const totalOccurrences = entries.reduce((sum, [, count]) => sum + count, 0)

    const categoryName = categoryMap.get(topCategoryId)
    if (!categoryName) continue

    patterns.push({
      payeeName: group.originalName,
      normalizedName: normalized,
      categoryId: topCategoryId,
      categoryName,
      occurrences: topCount,
      confidence: topCount / totalOccurrences,
    })
  }

  // Sort by occurrences (most frequent first)
  return patterns.sort((a, b) => b.occurrences - a.occurrences)
}

/**
 * Finds matching patterns for a given payee name.
 */
export const findMatchingPatterns = (
  payeeName: string,
  patterns: PayeePattern[]
): PayeePattern[] => {
  const normalized = normalizePayeeName(payeeName)
  return patterns.filter(
    (p) =>
      p.normalizedName === normalized ||
      p.normalizedName.includes(normalized) ||
      normalized.includes(p.normalizedName)
  )
}

/**
 * Formats patterns for AI prompt context.
 */
export const formatPatternsForPrompt = (
  patterns: PayeePattern[],
  limit = 50
): string => {
  return patterns
    .slice(0, limit)
    .map(
      (p) =>
        `- "${p.payeeName}" → ${p.categoryName} (${Math.round(p.confidence * 100)}% of ${p.occurrences} txns)`
    )
    .join('\n')
}
