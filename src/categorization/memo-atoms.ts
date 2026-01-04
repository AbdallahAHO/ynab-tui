import { atom } from 'jotai'
import type { MemoGenerationResult } from './categorization-types.js'

export interface MemoProgressItem {
  transactionId: string
  payeeName: string
  amount: number
  existingMemo: string | null
  result: MemoGenerationResult | null
  status: 'pending' | 'processing' | 'generated' | 'skipped' | 'error'
}

// Live progress items for bulk generation
export const memoProgressItemsAtom = atom<MemoProgressItem[]>([])

// Is memo generation currently running
export const memoIsRunningAtom = atom(false)

// Include transactions with existing memos (forceReplace)
export const memoIncludeExistingAtom = atom(false)

// Summary counts (derived)
export const memoSummaryAtom = atom((get) => {
  const items = get(memoProgressItemsAtom)
  return {
    total: items.length,
    processed: items.filter((i) => i.status !== 'pending' && i.status !== 'processing').length,
    generated: items.filter((i) => i.status === 'generated').length,
    skipped: items.filter((i) => i.status === 'skipped').length,
    errors: items.filter((i) => i.status === 'error').length,
  }
})

// Reset all memo generation state
export const resetMemoAtom = atom(null, (get, set) => {
  set(memoProgressItemsAtom, [])
  set(memoIsRunningAtom, false)
  set(memoIncludeExistingAtom, false)
})
