import type { Account, Category } from './ynab-client.js'
import type { PayeeRule } from '../payees/payee-types.js'
import type { UserContext } from '../config/config-types.js'
import type { PayeePattern } from '../categorization/categorization-types.js'

/**
 * Complete context available for AI calls.
 * Combines user preferences, YNAB data, and learned patterns.
 */
export interface AIContext {
  user: UserContextSection
  accounts: AccountContextSection
  payees: PayeeContextSection
  categories: CategoryContextSection
  patterns: PatternContextSection
}

interface UserContextSection {
  location?: { country: string; city: string }
  language?: string
  partner?: { name: string; context: string }
  transactionSources?: string
  customNotes?: string
}

interface AccountContextSection {
  list: Array<{ id: string; name: string; type: string }>
  contexts: Record<string, string> // accountId -> user description
}

interface PayeeContextSection {
  rules: PayeeRule[]
  tagIndex: Map<string, string[]> // normalizedName -> tags
}

interface CategoryContextSection {
  list: Category[]
  formatted: string // pre-formatted for prompts
}

interface PatternContextSection {
  historical: PayeePattern[]
}

/**
 * Options to select which context sections to include in prompts.
 */
export interface ContextOptions {
  includeUser?: boolean
  includeAccounts?: boolean
  includePayees?: boolean
  includeCategories?: boolean
  includePatterns?: boolean
  patternLimit?: number
}

/**
 * Builds complete AI context from all available data sources.
 *
 * @example
 * const ctx = buildAIContext({
 *   userContext: config.userContext,
 *   accounts,
 *   payeeRules,
 *   categories,
 *   historicalPatterns,
 * })
 */
export const buildAIContext = (data: {
  userContext?: UserContext
  accounts?: Account[]
  payeeRules?: PayeeRule[]
  categories?: Category[]
  historicalPatterns?: PayeePattern[]
}): AIContext => ({
  user: buildUserSection(data.userContext),
  accounts: buildAccountSection(data.accounts, data.userContext?.accountContexts),
  payees: buildPayeeSection(data.payeeRules),
  categories: buildCategorySection(data.categories),
  patterns: { historical: data.historicalPatterns ?? [] },
})

const buildUserSection = (ctx?: UserContext): UserContextSection => ({
  location: ctx?.location,
  language: ctx?.language,
  partner: ctx?.partner,
  transactionSources: ctx?.transactionSources,
  customNotes: ctx?.customNotes,
})

const buildAccountSection = (
  accounts?: Account[],
  accountContexts?: Record<string, string>
): AccountContextSection => ({
  list: (accounts ?? []).map((a) => ({ id: a.id, name: a.name, type: a.type })),
  contexts: accountContexts ?? {},
})

const buildPayeeSection = (rules?: PayeeRule[]): PayeeContextSection => {
  const payeeRules = rules ?? []
  const tagIndex = new Map<string, string[]>()

  for (const rule of payeeRules) {
    if (rule.aiTags.length > 0) {
      tagIndex.set(rule.normalizedName, rule.aiTags)
    }
  }

  return { rules: payeeRules, tagIndex }
}

const buildCategorySection = (categories?: Category[]): CategoryContextSection => {
  const list = categories ?? []
  const formatted = list.map((c) => `- ${c.id}: ${c.name}`).join('\n')
  return { list, formatted }
}

/**
 * Formats AI context into a prompt-ready string.
 * Only includes sections specified in options.
 *
 * @example
 * const promptStr = formatContextForPrompt(ctx, {
 *   includeUser: true,
 *   includeAccounts: true,
 *   includeCategories: true,
 *   includePatterns: true,
 *   patternLimit: 50,
 * })
 */
export const formatContextForPrompt = (
  context: AIContext,
  options: ContextOptions = {}
): string => {
  const sections: string[] = []

  if (options.includeUser !== false && hasUserContext(context.user)) {
    sections.push(formatUserSection(context.user))
  }

  if (options.includeAccounts && context.accounts.list.length > 0) {
    sections.push(formatAccountSection(context.accounts))
  }

  if (options.includePayees && context.payees.rules.length > 0) {
    sections.push(formatPayeeSection(context.payees))
  }

  if (options.includeCategories !== false && context.categories.formatted) {
    sections.push(`## Available Categories\n${context.categories.formatted}`)
  }

  if (options.includePatterns !== false) {
    const limit = options.patternLimit ?? 50
    sections.push(formatPatternsSection(context.patterns.historical, limit))
  }

  return sections.join('\n\n')
}

const hasUserContext = (user: UserContextSection): boolean =>
  !!(user.location || user.language || user.partner || user.transactionSources || user.customNotes)

const formatUserSection = (user: UserContextSection): string => {
  const lines: string[] = ['## User Context']

  if (user.location) {
    lines.push(`- Location: ${user.location.city}, ${user.location.country}`)
  }
  if (user.language) {
    lines.push(`- Language: ${user.language}`)
  }
  if (user.partner) {
    lines.push(`- Partner: ${user.partner.name} (${user.partner.context})`)
  }
  if (user.transactionSources) {
    lines.push(`- Transaction sources: ${user.transactionSources}`)
  }
  if (user.customNotes) {
    lines.push(`- Notes: ${user.customNotes}`)
  }

  return lines.join('\n')
}

const formatAccountSection = (accounts: AccountContextSection): string => {
  const lines: string[] = ['## Account Context']

  for (const account of accounts.list) {
    const userContext = accounts.contexts[account.id]
    if (userContext) {
      lines.push(`- ${account.name} (${account.type}): ${userContext}`)
    }
  }

  // Only return if we have account contexts
  return lines.length > 1 ? lines.join('\n') : ''
}

const formatPayeeSection = (payees: PayeeContextSection): string => {
  const lines: string[] = ['## Known Payees with Tags']

  const taggedPayees = payees.rules
    .filter((r) => r.aiTags.length > 0 || r.context || r.aiContext)
    .slice(0, 30) // Limit to avoid prompt bloat

  for (const payee of taggedPayees) {
    const tags = payee.aiTags.length > 0 ? `[${payee.aiTags.join(', ')}]` : ''
    const contextParts = [payee.aiContext, payee.context].filter(Boolean)
    const context = contextParts.length > 0 ? ` - ${contextParts.join('; ')}` : ''
    lines.push(`- "${payee.displayName}" ${tags}${context}`)
  }

  return lines.length > 1 ? lines.join('\n') : ''
}

const formatPatternsSection = (patterns: PayeePattern[], limit: number): string => {
  if (patterns.length === 0) {
    return '## Historical Patterns\nNo historical data available yet.'
  }

  const formatted = patterns
    .slice(0, limit)
    .map(
      (p) =>
        `- "${p.payeeName}" → ${p.categoryName} (${Math.round(p.confidence * 100)}% of ${p.occurrences} txns)`
    )
    .join('\n')

  return `## Historical Patterns (payee → most common category)\n${formatted}`
}

/**
 * Gets enriched payee info for categorization.
 * Looks up tags and user context for a specific payee.
 */
export const getPayeeEnrichment = (
  payeeName: string,
  context: AIContext
): { tags: string[]; userContext: string; aiContext?: string } | null => {
  const normalized = payeeName.toLowerCase().replace(/[^a-z0-9]/g, '')
  const rule = context.payees.rules.find((r) => r.normalizedName === normalized)

  if (!rule) return null

  return {
    tags: rule.aiTags,
    userContext: rule.context,
    aiContext: rule.aiContext,
  }
}

/**
 * Gets account name and user context for a transaction.
 */
export const getAccountInfo = (
  accountId: string,
  context: AIContext
): { name: string; type: string; userContext?: string } | null => {
  const account = context.accounts.list.find((a) => a.id === accountId)
  if (!account) return null

  return {
    name: account.name,
    type: account.type,
    userContext: context.accounts.contexts[accountId],
  }
}
