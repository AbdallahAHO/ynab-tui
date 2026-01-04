import { atom } from 'jotai'
import type { TransactionDetail, Account, CategoryGroupWithCategories } from '../shared/ynab-client.js'

// Core data atoms
export const transactionsAtom = atom<TransactionDetail[]>([])
export const accountsAtom = atom<Account[]>([])
export const categoryGroupsAtom = atom<CategoryGroupWithCategories[]>([])

// Loading states
export const isLoadingAtom = atom(false)
export const errorAtom = atom<string | null>(null)

// Selection state
export const selectedIndexAtom = atom(0)
export const checkedIdsAtom = atom<Set<string>>(new Set<string>())

// Filter state
export const showUncategorizedOnlyAtom = atom(true)
export const filterAccountIdAtom = atom<string | null>(null)

// Derived: filtered transactions
export const filteredTransactionsAtom = atom((get) => {
  const transactions = get(transactionsAtom)
  const uncategorizedOnly = get(showUncategorizedOnlyAtom)
  const accountId = get(filterAccountIdAtom)

  return transactions
    .filter((tx) => !tx.deleted)
    .filter((tx) => (uncategorizedOnly ? !tx.category_id : true))
    .filter((tx) => (accountId ? tx.account_id === accountId : true))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
})

// Derived: currently selected transaction
export const selectedTransactionAtom = atom((get) => {
  const filtered = get(filteredTransactionsAtom)
  const index = get(selectedIndexAtom)
  return filtered[index] ?? null
})

// Derived: checked transactions
export const checkedTransactionsAtom = atom((get) => {
  const transactions = get(transactionsAtom)
  const checkedIds = get(checkedIdsAtom)
  return transactions.filter((tx) => checkedIds.has(tx.id))
})

// Derived: category lookup map
export const categoryMapAtom = atom((get) => {
  const groups = get(categoryGroupsAtom)
  const map = new Map<string, { name: string; groupName: string }>()

  for (const group of groups) {
    for (const cat of group.categories) {
      map.set(cat.id, { name: cat.name, groupName: group.name })
    }
  }

  return map
})

// Derived: account lookup map
export const accountMapAtom = atom((get) => {
  const accounts = get(accountsAtom)
  return new Map(accounts.map((a) => [a.id, a.name]))
})

// Viewport for virtual scrolling
export const viewportStartAtom = atom(0)
export const viewportSizeAtom = atom(30)

// Factory: get transactions by payee ID
export const createPayeeTransactionsAtom = (payeeId: string) =>
  atom((get) => {
    const transactions = get(transactionsAtom)
    return transactions
      .filter((tx) => tx.payee_id === payeeId && !tx.deleted)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10) // Last 10 transactions
  })

// Toggle for showing spending summary
export const showSpendingSummaryAtom = atom(true)

// Derived: monthly spending summary for current month
export const monthlySpendingSummaryAtom = atom((get) => {
  const transactions = get(transactionsAtom)
  const categoryMap = get(categoryMapAtom)

  // Get current month in YYYY-MM format
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // Filter to current month, non-deleted, non-transfer transactions
  const monthTxs = transactions.filter((tx) => {
    if (tx.deleted) return false
    if (tx.transfer_account_id) return false
    if (tx.payee_name?.startsWith('Transfer :')) return false
    return tx.date.startsWith(currentMonth)
  })

  // Calculate totals
  let totalSpent = 0
  let totalIncome = 0
  const categorySpending: Record<string, { name: string; spent: number }> = {}

  for (const tx of monthTxs) {
    if (tx.amount < 0) {
      totalSpent += tx.amount

      // Track by category
      if (tx.category_id) {
        const cat = categoryMap.get(tx.category_id)
        if (cat && !cat.name.startsWith('Inflow:')) {
          if (!categorySpending[tx.category_id]) {
            categorySpending[tx.category_id] = { name: cat.name, spent: 0 }
          }
          categorySpending[tx.category_id].spent += tx.amount
        }
      }
    } else {
      totalIncome += tx.amount
    }
  }

  // Find top spending category (most negative)
  const topCategory = Object.values(categorySpending)
    .sort((a, b) => a.spent - b.spent)[0] ?? null

  return {
    totalSpent,
    totalIncome,
    topCategory,
    month: currentMonth,
  }
})
