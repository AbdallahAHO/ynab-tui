import { atom } from 'jotai'
import type { CategorizationResult, PayeePattern } from './categorization-types.js'

// Queue of transaction IDs to categorize
export const categorizationQueueAtom = atom<string[]>([])

// Current index in the queue
export const currentReviewIndexAtom = atom(0)

// AI results for each transaction
export const categorizationResultsAtom = atom<Map<string, CategorizationResult>>(new Map())

// User decisions
export const acceptedCategorizationsAtom = atom<Map<string, string>>(new Map()) // txId -> categoryId
export const acceptedMemosAtom = atom<Map<string, string>>(new Map()) // txId -> memo
export const rejectedCategorizationsAtom = atom<Set<string>>(new Set<string>())
export const skippedCategorizationsAtom = atom<Set<string>>(new Set<string>())

// Loading state
export const isCategorizingAtom = atom(false)

// Historical patterns cache
export const payeePatternsAtom = atom<PayeePattern[]>([])

// Derived: current transaction in review
export const currentQueueItemAtom = atom((get) => {
  const queue = get(categorizationQueueAtom)
  const index = get(currentReviewIndexAtom)
  return queue[index] ?? null
})

// Derived: progress stats
export const reviewProgressAtom = atom((get) => {
  const queue = get(categorizationQueueAtom)
  const accepted = get(acceptedCategorizationsAtom)
  const rejected = get(rejectedCategorizationsAtom)
  const skipped = get(skippedCategorizationsAtom)

  return {
    total: queue.length,
    reviewed: accepted.size + rejected.size + skipped.size,
    accepted: accepted.size,
    rejected: rejected.size,
    skipped: skipped.size,
    remaining: queue.length - (accepted.size + rejected.size + skipped.size),
  }
})

// Reset all categorization state
export const resetCategorizationAtom = atom(null, (get, set) => {
  set(categorizationQueueAtom, [])
  set(currentReviewIndexAtom, 0)
  set(categorizationResultsAtom, new Map())
  set(acceptedCategorizationsAtom, new Map())
  set(acceptedMemosAtom, new Map())
  set(rejectedCategorizationsAtom, new Set())
  set(skippedCategorizationsAtom, new Set())
  set(isCategorizingAtom, false)
})
