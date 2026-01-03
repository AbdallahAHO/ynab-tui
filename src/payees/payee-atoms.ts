import { atom } from 'jotai'
import type { PayeeRule } from './payee-types.js'

// All payee rules
export const payeeRulesAtom = atom<PayeeRule[]>([])

// Selected payee in manager
export const selectedPayeeIndexAtom = atom(0)

// Search filter
export const payeeSearchAtom = atom('')

// Filtered payees based on search
export const filteredPayeesAtom = atom((get) => {
  const rules = get(payeeRulesAtom)
  const search = get(payeeSearchAtom).toLowerCase()

  if (!search) return rules

  return rules.filter(
    (r) =>
      r.payeeName.toLowerCase().includes(search) ||
      r.displayName.toLowerCase().includes(search) ||
      r.aiTags.some((t) => t.toLowerCase().includes(search)) ||
      r.defaultCategoryName?.toLowerCase().includes(search)
  )
})

// Currently selected payee
export const selectedPayeeAtom = atom((get) => {
  const filtered = get(filteredPayeesAtom)
  const index = get(selectedPayeeIndexAtom)
  return filtered[index] ?? null
})

// Count of new payees needing configuration
export const newPayeeCountAtom = atom((get) => {
  const rules = get(payeeRulesAtom)
  return rules.filter((r) => r.isNew).length
})

// Payees that need configuration
export const newPayeesAtom = atom((get) => {
  const rules = get(payeeRulesAtom)
  return rules.filter((r) => r.isNew)
})

// Sync status
export const payeeSyncStatusAtom = atom<'idle' | 'syncing' | 'done'>('idle')

// Edit mode for payee editor
export const payeeEditorModeAtom = atom<'view' | 'editName' | 'editContext' | 'pickCategory'>('view')

// Multi-select for bulk operations
export const checkedPayeeIdsAtom = atom<Set<string>>(new Set<string>())

// Payees without AI tags (for bulk tagging)
export const untaggedPayeesAtom = atom((get) => {
  const rules = get(payeeRulesAtom)
  return rules.filter((r) => r.aiTags.length === 0)
})

// Count of checked payees
export const checkedPayeeCountAtom = atom((get) => {
  return get(checkedPayeeIdsAtom).size
})
