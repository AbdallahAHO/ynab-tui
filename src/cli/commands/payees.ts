import type { PayeesOptions } from '../args.js'
import type { AppConfig } from '../../config/config-types.js'
import { createYnabClient, flattenCategories } from '../../shared/ynab-client.js'
import {
  loadPayeeRules,
  savePayeeRules,
} from '../../config/config-service.js'
import { createFormatter, formatTable } from '../output.js'
import type { PayeeRule } from '../../payees/payee-types.js'

interface PayeeOutput {
  payeeId: string
  payeeName: string
  displayName: string
  defaultCategory: string | null
  tags: string[]
  transactionCount: number
}

interface PayeesListResult {
  success: boolean
  count: number
  payees: PayeeOutput[]
  formatted?: string
}

interface PayeesSetCategoryResult {
  success: boolean
  payee: string
  category: string
  formatted?: string
}

export const payeesCommand = async (
  options: PayeesOptions,
  config: AppConfig
): Promise<void> => {
  const formatter = createFormatter(options.format, options.quiet)

  // Handle --set-category
  if (options.setCategory) {
    await setPayeeCategory(options, config, formatter)
    return
  }

  // Default to listing payees
  if (options.list || !options.setCategory) {
    await listPayees(options, config, formatter)
    return
  }
}

const listPayees = async (
  options: PayeesOptions,
  config: AppConfig,
  formatter: ReturnType<typeof createFormatter>
): Promise<void> => {
  formatter.progress('Loading payee rules...')

  const payeeRules = await loadPayeeRules()

  // Filter by no-category if specified
  let filtered = payeeRules
  if (options.noCategory) {
    filtered = payeeRules.filter((r) => !r.defaultCategoryId)
  }

  // Sort by transaction count (most active first)
  filtered.sort((a, b) => b.transactionCount - a.transactionCount)

  const payees: PayeeOutput[] = filtered.map((r) => ({
    payeeId: r.payeeId,
    payeeName: r.payeeName,
    displayName: r.displayName,
    defaultCategory: r.defaultCategoryName,
    tags: r.aiTags,
    transactionCount: r.transactionCount,
  }))

  const result: PayeesListResult = {
    success: true,
    count: payees.length,
    payees,
  }

  if (options.format === 'text') {
    if (payees.length === 0) {
      result.formatted = options.noCategory
        ? 'No payees without a default category.'
        : 'No payee rules found. Use the TUI to sync payees from YNAB.'
    } else {
      const headers = ['Payee', 'Category', 'Tags', 'Count']
      const rows = payees.slice(0, 50).map((p) => [
        p.displayName.slice(0, 30),
        p.defaultCategory || '(none)',
        p.tags.slice(0, 3).join(', ').slice(0, 20) || '-',
        String(p.transactionCount),
      ])
      result.formatted = `Found ${payees.length} payees:\n\n${formatTable(headers, rows)}`

      if (payees.length > 50) {
        result.formatted += `\n\n... and ${payees.length - 50} more (use --format=json for full list)`
      }
    }
  }

  formatter.success(result)
}

const setPayeeCategory = async (
  options: PayeesOptions,
  config: AppConfig,
  formatter: ReturnType<typeof createFormatter>
): Promise<void> => {
  const mapping = options.setCategory!

  // Parse "Payee Name:Category Name" format
  const colonIndex = mapping.lastIndexOf(':')
  if (colonIndex === -1) {
    formatter.error(
      'Invalid format for --set-category',
      'Expected format: "Payee Name:Category Name"'
    )
  }

  const payeeName = mapping.slice(0, colonIndex).trim()
  const categoryName = mapping.slice(colonIndex + 1).trim()

  if (!payeeName || !categoryName) {
    formatter.error(
      'Invalid format for --set-category',
      'Both payee name and category name are required'
    )
  }

  formatter.progress('Loading categories from YNAB...')

  const client = createYnabClient(
    config.ynab.accessToken,
    config.ynab.defaultBudgetId,
    config.ynab.defaultBudgetName
  )

  const categoryGroups = await client.getCategories()
  const categories = flattenCategories(categoryGroups)

  // Find matching category
  const categoryNameLower = categoryName.toLowerCase()
  const category = categories.find(
    (c) => c.name.toLowerCase() === categoryNameLower
  )

  if (!category) {
    // Try partial match
    const partialMatch = categories.find((c) =>
      c.name.toLowerCase().includes(categoryNameLower)
    )
    if (partialMatch) {
      formatter.warn(`Category "${categoryName}" not found. Did you mean "${partialMatch.name}"?`)
    }
    formatter.error(`Category "${categoryName}" not found`)
  }

  // Load and update payee rules
  formatter.progress('Updating payee rule...')
  const payeeRules = await loadPayeeRules()

  // Find matching payee rule
  const payeeNameLower = payeeName.toLowerCase()
  const ruleIndex = payeeRules.findIndex(
    (r) =>
      r.payeeName.toLowerCase() === payeeNameLower ||
      r.displayName.toLowerCase() === payeeNameLower
  )

  if (ruleIndex === -1) {
    // Create new rule if payee doesn't exist
    const normalizedName = payeeName.toLowerCase().replace(/[^a-z0-9]/g, '')
    const newRule: PayeeRule = {
      payeeId: `manual-${normalizedName}`,
      payeeName: payeeName,
      displayName: payeeName,
      normalizedName,
      defaultCategoryId: category.id,
      defaultCategoryName: category.name,
      context: '',
      aiTags: [],
      isNew: false,
      lastSeen: new Date().toISOString(),
      transactionCount: 0,
      syncedToYnab: false,
    }
    payeeRules.push(newRule)
    formatter.progress(`Created new payee rule for "${payeeName}"`)
  } else {
    // Update existing rule
    payeeRules[ruleIndex] = {
      ...payeeRules[ruleIndex],
      defaultCategoryId: category.id,
      defaultCategoryName: category.name,
    }
    formatter.progress(`Updated payee rule for "${payeeRules[ruleIndex].displayName}"`)
  }

  await savePayeeRules(payeeRules)

  const result: PayeesSetCategoryResult = {
    success: true,
    payee: payeeName,
    category: category.name,
  }

  if (options.format === 'text') {
    result.formatted = `Set default category for "${payeeName}" to "${category.name}"`
  }

  formatter.success(result)
}
