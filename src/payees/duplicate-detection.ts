import type { PayeeRule } from './payee-types.js'

export interface DuplicateGroup {
  primary: PayeeRule
  duplicates: PayeeRule[]
  similarity: number
}

/**
 * Levenshtein distance between two strings
 */
const levenshteinDistance = (a: string, b: string): number => {
  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

/**
 * Calculate similarity ratio between two strings (0-1)
 */
const similarityRatio = (a: string, b: string): number => {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  const distance = levenshteinDistance(a, b)
  return 1 - distance / maxLen
}

/**
 * Normalize payee name for comparison (more aggressive than standard)
 */
const normalizeForComparison = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars but keep spaces
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Check if two payees are likely duplicates
 */
const areLikelyDuplicates = (a: PayeeRule, b: PayeeRule): number => {
  // Skip if already marked as duplicate
  if (a.duplicateOf || b.duplicateOf) return 0

  const normA = normalizeForComparison(a.displayName)
  const normB = normalizeForComparison(b.displayName)

  // Exact normalized match
  if (normA === normB && normA.length > 0) return 1.0

  // One is prefix of the other (e.g., "Penny" vs "Penny-Markt")
  if (normA.startsWith(normB) || normB.startsWith(normA)) {
    const shorter = Math.min(normA.length, normB.length)
    const longer = Math.max(normA.length, normB.length)
    if (shorter > 3 && shorter / longer > 0.5) {
      return 0.9
    }
  }

  // Levenshtein similarity
  const similarity = similarityRatio(normA, normB)

  // Only consider duplicates if very similar (>85%)
  return similarity > 0.85 ? similarity : 0
}

/**
 * Find groups of duplicate payees
 */
export const findDuplicateGroups = (payees: PayeeRule[]): DuplicateGroup[] => {
  const groups: DuplicateGroup[] = []
  const processed = new Set<string>()

  // Sort by transaction count (most used first) to pick better primaries
  const sorted = [...payees].sort((a, b) => b.transactionCount - a.transactionCount)

  for (const payee of sorted) {
    if (processed.has(payee.payeeId)) continue

    const duplicates: { payee: PayeeRule; similarity: number }[] = []

    for (const other of sorted) {
      if (other.payeeId === payee.payeeId) continue
      if (processed.has(other.payeeId)) continue

      const similarity = areLikelyDuplicates(payee, other)
      if (similarity > 0) {
        duplicates.push({ payee: other, similarity })
      }
    }

    if (duplicates.length > 0) {
      // Mark all as processed
      processed.add(payee.payeeId)
      for (const dup of duplicates) {
        processed.add(dup.payee.payeeId)
      }

      // Calculate average similarity
      const avgSimilarity =
        duplicates.reduce((sum, d) => sum + d.similarity, 0) / duplicates.length

      groups.push({
        primary: payee,
        duplicates: duplicates.map((d) => d.payee),
        similarity: avgSimilarity,
      })
    }
  }

  // Sort by number of duplicates (most duplicates first)
  return groups.sort((a, b) => b.duplicates.length - a.duplicates.length)
}

/**
 * Get count of potential duplicate groups
 */
export const getDuplicateCount = (payees: PayeeRule[]): number => {
  return findDuplicateGroups(payees).length
}
