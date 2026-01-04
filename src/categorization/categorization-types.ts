import { z } from 'zod'

export const suggestedMemoSchema = z.object({
  short: z.string().describe('Brief context note, 2-5 words (e.g., "Weekly groceries", "Netflix subscription")'),
  detailed: z.string().describe('Reasoning for category choice (e.g., "Whole Foods purchase categorized as Groceries")'),
})

export const categorizationResultSchema = z.object({
  categoryId: z.string().describe('The YNAB category ID to assign'),
  categoryName: z.string().describe('Human-readable category name'),
  confidence: z.number().min(0).max(1).describe('Confidence score 0-1'),
  reasoning: z.string().describe('Brief explanation of why this category was chosen'),
  alternatives: z
    .array(
      z.object({
        categoryId: z.string(),
        categoryName: z.string(),
        confidence: z.number(),
      })
    )
    .max(3)
    .describe('Up to 3 alternative category suggestions'),
  suggestedMemo: suggestedMemoSchema
    .optional()
    .describe('Suggested memo if transaction has no memo. Only provide if transaction memo is empty.'),
})

export type CategorizationResult = z.infer<typeof categorizationResultSchema>

export const memoGenerationResultSchema = z.object({
  short: z.string().describe('Brief context note, 2-5 words'),
  detailed: z.string().describe('More descriptive memo with context'),
})

export type MemoGenerationResult = z.infer<typeof memoGenerationResultSchema>

export interface PayeePattern {
  payeeName: string
  normalizedName: string
  categoryId: string
  categoryName: string
  occurrences: number
  confidence: number
}

export interface CategorizationState {
  queue: string[] // Transaction IDs to categorize
  currentIndex: number
  results: Map<string, CategorizationResult>
  accepted: Map<string, string> // transactionId -> categoryId
  rejected: Set<string>
  skipped: Set<string>
}
