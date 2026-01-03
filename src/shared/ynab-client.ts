import * as ynab from 'ynab'
import type { TransactionDetail, Category, CategoryGroupWithCategories, Account, SaveTransactionWithIdOrImportId, Payee } from 'ynab'

export type { TransactionDetail, Category, CategoryGroupWithCategories, Account, Payee }

export type TransactionUpdate = SaveTransactionWithIdOrImportId & { id: string }

export interface YnabClient {
  getTransactions: (sinceDate?: string) => Promise<TransactionDetail[]>
  getUncategorizedTransactions: (sinceDate?: string) => Promise<TransactionDetail[]>
  updateTransactions: (updates: TransactionUpdate[]) => Promise<void>
  getCategories: () => Promise<CategoryGroupWithCategories[]>
  getAccounts: () => Promise<Account[]>
  getPayees: () => Promise<Payee[]>
  updatePayee: (payeeId: string, name: string) => Promise<void>
  getBudgetName: () => string
}

/**
 * Creates a YNAB API client with delta request support and caching.
 *
 * @example
 * const client = createYnabClient(token, budgetId)
 * const transactions = await client.getTransactions()
 * await client.updateTransactions([{ id: 'tx-1', category_id: 'cat-1' }])
 */
export const createYnabClient = (
  accessToken: string,
  budgetId: string,
  budgetName = 'Budget'
): YnabClient => {
  const api = new ynab.API(accessToken)

  // Server knowledge for delta requests
  let lastKnowledge: number | undefined

  // Cache for categories, accounts, and payees (rarely change)
  let categoriesCache: CategoryGroupWithCategories[] | null = null
  let accountsCache: Account[] | null = null
  let payeesCache: Payee[] | null = null

  const getTransactions = async (sinceDate?: string): Promise<TransactionDetail[]> => {
    const response = await api.transactions.getTransactions(
      budgetId,
      sinceDate,
      undefined,
      lastKnowledge
    )
    lastKnowledge = response.data.server_knowledge
    return response.data.transactions
  }

  const getUncategorizedTransactions = async (
    sinceDate?: string
  ): Promise<TransactionDetail[]> => {
    const all = await getTransactions(sinceDate)
    return all.filter((tx) => !tx.category_id && !tx.deleted)
  }

  const updateTransactions = async (updates: TransactionUpdate[]): Promise<void> => {
    if (updates.length === 0) return

    // Batch update - single API call
    await api.transactions.updateTransactions(budgetId, {
      transactions: updates,
    })
  }

  const getCategories = async (): Promise<CategoryGroupWithCategories[]> => {
    if (categoriesCache) return categoriesCache

    const response = await api.categories.getCategories(budgetId)
    categoriesCache = response.data.category_groups
    return categoriesCache
  }

  const getAccounts = async (): Promise<Account[]> => {
    if (accountsCache) return accountsCache

    const response = await api.accounts.getAccounts(budgetId)
    accountsCache = response.data.accounts.filter((a) => !a.closed && !a.deleted)
    return accountsCache
  }

  const getPayees = async (): Promise<Payee[]> => {
    if (payeesCache) return payeesCache

    const response = await api.payees.getPayees(budgetId)
    payeesCache = response.data.payees.filter((p) => !p.deleted)
    return payeesCache
  }

  const updatePayee = async (payeeId: string, name: string): Promise<void> => {
    await api.payees.updatePayee(budgetId, payeeId, { payee: { name } })
    // Invalidate cache so next fetch gets updated name
    payeesCache = null
  }

  const getBudgetName = () => budgetName

  return {
    getTransactions,
    getUncategorizedTransactions,
    updateTransactions,
    getCategories,
    getAccounts,
    getPayees,
    updatePayee,
    getBudgetName,
  }
}

/**
 * Flattens category groups into a simple category list.
 */
export const flattenCategories = (groups: CategoryGroupWithCategories[]): Category[] =>
  groups.flatMap((g) => g.categories.filter((c) => !c.hidden && !c.deleted))

/**
 * Converts YNAB milliunits to display currency.
 */
export const formatAmount = (milliunits: number): string => {
  const amount = milliunits / 1000
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amount)
}

/**
 * Gets a readable flag color name.
 */
export const getFlagEmoji = (flag: TransactionDetail['flag_color']): string => {
  const flags: Record<string, string> = {
    red: '🔴',
    orange: '🟠',
    yellow: '🟡',
    green: '🟢',
    blue: '🔵',
    purple: '🟣',
  }
  return flag ? flags[flag] || '' : ''
}
