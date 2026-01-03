import { atom } from 'jotai'
import type { CategorizationResult } from './categorization-types.js'

export interface YoloProgressItem {
  transactionId: string
  payeeName: string
  amount: number
  result: CategorizationResult | null
  status: 'pending' | 'processing' | 'auto-accepted' | 'needs-review' | 'error'
}

// Live progress items (streamed as each transaction completes)
export const yoloProgressItemsAtom = atom<YoloProgressItem[]>([])

// Is YOLO currently running
export const yoloIsRunningAtom = atom(false)

// Summary counts (derived)
export const yoloSummaryAtom = atom((get) => {
  const items = get(yoloProgressItemsAtom)
  return {
    total: items.length,
    processed: items.filter((i) => i.status !== 'pending' && i.status !== 'processing').length,
    autoAccepted: items.filter((i) => i.status === 'auto-accepted').length,
    needsReview: items.filter((i) => i.status === 'needs-review').length,
    errors: items.filter((i) => i.status === 'error').length,
  }
})

// Transaction IDs that need manual review (below threshold)
export const yoloNeedsReviewIdsAtom = atom((get) => {
  const items = get(yoloProgressItemsAtom)
  return items.filter((i) => i.status === 'needs-review').map((i) => i.transactionId)
})

// Reset YOLO state
export const resetYoloAtom = atom(null, (get, set) => {
  set(yoloProgressItemsAtom, [])
  set(yoloIsRunningAtom, false)
})
