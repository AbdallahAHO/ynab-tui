import { atom } from 'jotai'
import { transactionsAtom, accountsAtom } from '../transactions/transaction-atoms.js'
import {
  detectTransfers,
  findTransferPairForTransaction,
  type TransferPair,
} from './transfer-detector.js'

/**
 * Derived atom: detected transfer pairs from current transactions.
 * Automatically updates when transactions or accounts change.
 */
export const detectedTransfersAtom = atom((get) => {
  const transactions = get(transactionsAtom)
  const accounts = get(accountsAtom)
  return detectTransfers(transactions, accounts)
})

/**
 * Map of transaction ID to its transfer pair for O(1) lookups.
 */
export const transferPairMapAtom = atom((get) => {
  const pairs = get(detectedTransfersAtom)
  const map = new Map<string, TransferPair>()

  for (const pair of pairs) {
    map.set(pair.outflow.id, pair)
    map.set(pair.inflow.id, pair)
  }

  return map
})

/**
 * Set of transaction IDs that are part of detected transfers.
 */
export const transferTransactionIdsAtom = atom((get) => {
  const pairs = get(detectedTransfersAtom)
  const ids = new Set<string>()

  for (const pair of pairs) {
    ids.add(pair.outflow.id)
    ids.add(pair.inflow.id)
  }

  return ids
})

/**
 * Tracks confirmed transfer pairs during categorization review.
 * Maps outflow transaction ID to the confirmed pair.
 */
export const confirmedTransfersAtom = atom<Map<string, TransferPair>>(new Map())

/**
 * Action atom: confirm a transfer pair.
 */
export const confirmTransferAtom = atom(
  null,
  (get, set, pair: TransferPair) => {
    const confirmed = new Map(get(confirmedTransfersAtom))
    confirmed.set(pair.outflow.id, pair)
    set(confirmedTransfersAtom, confirmed)
  }
)

/**
 * Action atom: reject a transfer (remove from confirmed).
 */
export const rejectTransferAtom = atom(
  null,
  (get, set, transactionId: string) => {
    const pairs = get(detectedTransfersAtom)
    const pair = findTransferPairForTransaction(pairs, transactionId)
    if (!pair) return

    const confirmed = new Map(get(confirmedTransfersAtom))
    confirmed.delete(pair.outflow.id)
    set(confirmedTransfersAtom, confirmed)
  }
)

/**
 * Action atom: reset all confirmed transfers.
 */
export const resetConfirmedTransfersAtom = atom(null, (_get, set) => {
  set(confirmedTransfersAtom, new Map())
})
