import type { TransactionDetail, Account } from '../shared/ynab-client.js'

export interface TransferPair {
  outflow: TransactionDetail
  inflow: TransactionDetail
  confidence: number
  fromAccount: Account
  toAccount: Account
}

interface TransferMatch {
  transaction: TransactionDetail
  account: Account
}

/**
 * Detects potential internal account transfers from uncategorized transactions.
 * Matches transactions with same absolute amount, opposite signs, within 3 days.
 *
 * @example
 * const pairs = detectTransfers(transactions, accounts)
 * // Returns pairs like: { outflow: tx1, inflow: tx2, confidence: 0.95, ... }
 */
export const detectTransfers = (
  transactions: TransactionDetail[],
  accounts: Account[]
): TransferPair[] => {
  const accountMap = new Map(accounts.map((a) => [a.id, a]))

  // Filter to uncategorized, non-deleted transactions
  const uncategorized = transactions.filter(
    (tx) => !tx.category_id && !tx.deleted
  )

  // Group by absolute amount (YNAB uses milliunits)
  const byAmount = new Map<number, TransferMatch[]>()

  for (const tx of uncategorized) {
    const absAmount = Math.abs(tx.amount)
    const account = accountMap.get(tx.account_id)
    if (!account) continue

    const matches = byAmount.get(absAmount) || []
    matches.push({ transaction: tx, account })
    byAmount.set(absAmount, matches)
  }

  const pairs: TransferPair[] = []
  const usedIds = new Set<string>()

  // Find matching pairs
  for (const matches of byAmount.values()) {
    if (matches.length < 2) continue

    // Separate outflows (negative) and inflows (positive)
    const outflows = matches.filter((m) => m.transaction.amount < 0)
    const inflows = matches.filter((m) => m.transaction.amount > 0)

    // Match each outflow with best inflow
    for (const outflow of outflows) {
      if (usedIds.has(outflow.transaction.id)) continue

      let bestMatch: { inflow: TransferMatch; confidence: number } | null = null

      for (const inflow of inflows) {
        if (usedIds.has(inflow.transaction.id)) continue

        // Skip same account (likely a refund, not a transfer)
        if (outflow.account.id === inflow.account.id) continue

        const confidence = calculateConfidence(
          outflow.transaction,
          inflow.transaction
        )

        if (confidence > 0 && (!bestMatch || confidence > bestMatch.confidence)) {
          bestMatch = { inflow, confidence }
        }
      }

      if (bestMatch) {
        pairs.push({
          outflow: outflow.transaction,
          inflow: bestMatch.inflow.transaction,
          confidence: bestMatch.confidence,
          fromAccount: outflow.account,
          toAccount: bestMatch.inflow.account,
        })
        usedIds.add(outflow.transaction.id)
        usedIds.add(bestMatch.inflow.transaction.id)
      }
    }
  }

  // Sort by confidence descending
  return pairs.sort((a, b) => b.confidence - a.confidence)
}

/**
 * Calculates confidence score based on date proximity.
 * Same day = 1.0, 1 day apart = 0.9, 2 days = 0.8, 3 days = 0.7
 * More than 3 days apart = 0 (no match)
 */
const calculateConfidence = (
  a: TransactionDetail,
  b: TransactionDetail
): number => {
  const dateA = new Date(a.date)
  const dateB = new Date(b.date)
  const diffDays = Math.abs(dateA.getTime() - dateB.getTime()) / (1000 * 60 * 60 * 24)

  if (diffDays > 3) return 0
  return 1 - diffDays * 0.1
}

/**
 * Finds the transfer pair containing a specific transaction.
 *
 * @example
 * const pair = findTransferPairForTransaction(pairs, 'tx-123')
 * if (pair) console.log(`Transfer to ${pair.toAccount.name}`)
 */
export const findTransferPairForTransaction = (
  pairs: TransferPair[],
  transactionId: string
): TransferPair | undefined => {
  return pairs.find(
    (p) => p.outflow.id === transactionId || p.inflow.id === transactionId
  )
}

/**
 * Gets the "other" transaction in a transfer pair.
 * If you have the outflow, returns the inflow, and vice versa.
 */
export const getOtherTransaction = (
  pair: TransferPair,
  transactionId: string
): TransactionDetail => {
  return pair.outflow.id === transactionId ? pair.inflow : pair.outflow
}

/**
 * Checks if a transaction is part of any detected transfer pair.
 */
export const isTransferTransaction = (
  pairs: TransferPair[],
  transactionId: string
): boolean => {
  return pairs.some(
    (p) => p.outflow.id === transactionId || p.inflow.id === transactionId
  )
}
