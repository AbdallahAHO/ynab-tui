export interface PayeeRule {
  payeeId: string
  payeeName: string // Original YNAB name
  displayName: string // Our improved name (synced to YNAB)
  normalizedName: string
  defaultCategoryId: string | null
  defaultCategoryName: string | null
  context: string // User notes like "Partner's gym"
  aiTags: string[] // AI-generated: ["subscription", "grocery"]
  lastSeen: string // ISO date
  transactionCount: number
  isNew: boolean // Flag for unconfigured payees
  syncedToYnab: boolean // If displayName was synced back
}

export const createEmptyPayeeRule = (
  payeeId: string,
  payeeName: string
): PayeeRule => ({
  payeeId,
  payeeName,
  displayName: payeeName,
  normalizedName: normalizePayeeName(payeeName),
  defaultCategoryId: null,
  defaultCategoryName: null,
  context: '',
  aiTags: [],
  lastSeen: new Date().toISOString().split('T')[0],
  transactionCount: 0,
  isNew: true,
  syncedToYnab: false,
})

export const normalizePayeeName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()
