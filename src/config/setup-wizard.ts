import * as p from '@clack/prompts'
import * as ynab from 'ynab'
import { AI_MODELS, type AppConfig, type UserContext } from './config-types.js'
import { saveConfig } from './config-service.js'

const ACCOUNT_CONTEXTS = [
  { value: 'personal', label: 'Personal spending' },
  { value: 'joint', label: 'Joint with partner' },
  { value: 'business', label: 'Business expenses' },
  { value: 'savings', label: 'Savings only' },
  { value: 'bills', label: 'Bills & utilities only' },
  { value: 'other', label: 'Other (custom)' },
  { value: 'skip', label: 'Skip this account' },
] as const

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'de', label: 'German' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'other', label: 'Other' },
] as const

/**
 * Interactive setup wizard for first-time configuration.
 * Guides user through API key setup, budget selection, and AI model choice.
 */
export const runSetupWizard = async (): Promise<AppConfig> => {
  p.intro('Welcome to YNAB TUI')

  const ynabToken = await p.text({
    message: 'Enter your YNAB Personal Access Token',
    placeholder: 'Get one at https://app.ynab.com/settings/developer',
    validate: (value) => {
      if (!value) return 'Token is required'
      if (value.length < 20) return 'Token seems too short'
    },
  })

  if (p.isCancel(ynabToken)) {
    p.cancel('Setup cancelled')
    process.exit(0)
  }

  const spinner = p.spinner()
  spinner.start('Fetching your budgets...')

  let budgets: ynab.BudgetSummary[]
  try {
    const ynabApi = new ynab.API(ynabToken)
    const response = await ynabApi.budgets.getBudgets()
    budgets = response.data.budgets
    spinner.stop('Found ' + budgets.length + ' budget(s)')
  } catch (error) {
    spinner.stop('Failed to fetch budgets')
    p.log.error('Could not connect to YNAB. Please check your token.')
    process.exit(1)
  }

  if (budgets.length === 0) {
    p.log.error('No budgets found in your YNAB account')
    process.exit(1)
  }

  const budgetChoice = await p.select({
    message: 'Select your default budget',
    options: budgets.map((b) => ({
      value: b.id,
      label: b.name,
      hint: b.last_modified_on?.split('T')[0],
    })),
  })

  if (p.isCancel(budgetChoice)) {
    p.cancel('Setup cancelled')
    process.exit(0)
  }

  const selectedBudget = budgets.find((b) => b.id === budgetChoice)!

  const openRouterKey = await p.text({
    message: 'Enter your OpenRouter API Key',
    placeholder: 'Get one at https://openrouter.ai/keys',
    validate: (value) => {
      if (!value) return 'API key is required'
    },
  })

  if (p.isCancel(openRouterKey)) {
    p.cancel('Setup cancelled')
    process.exit(0)
  }

  const model = await p.select({
    message: 'Select default AI model for categorization',
    options: AI_MODELS.map((m) => ({
      value: m.value,
      label: `${m.label} (${m.pricing})`,
      hint: m.description,
    })),
  })

  if (p.isCancel(model)) {
    p.cancel('Setup cancelled')
    process.exit(0)
  }

  // Context interview
  p.log.info('Now let\'s gather some context to improve categorization accuracy.')

  // Fetch accounts for context questions
  spinner.start('Fetching your accounts...')
  let accounts: ynab.Account[] = []
  try {
    const ynabApi = new ynab.API(ynabToken)
    const response = await ynabApi.accounts.getAccounts(budgetChoice)
    accounts = response.data.accounts.filter((a) => !a.closed && !a.deleted)
    spinner.stop(`Found ${accounts.length} active account(s)`)
  } catch {
    spinner.stop('Could not fetch accounts')
  }

  // Account contexts
  const accountContexts: Record<string, string> = {}
  if (accounts.length > 0) {
    p.log.info('What is each account used for? (optional)')
    for (const account of accounts) {
      const context = await p.select({
        message: `"${account.name}" is used for:`,
        options: ACCOUNT_CONTEXTS.map((c) => ({
          value: c.value,
          label: c.label,
        })),
      })
      if (p.isCancel(context)) break
      if (context === 'skip') continue
      if (context === 'other') {
        const customContext = await p.text({
          message: `Describe "${account.name}":`,
          placeholder: 'e.g., Partner\'s savings, Investment account',
        })
        if (!p.isCancel(customContext) && customContext) {
          accountContexts[account.id] = customContext
        }
      } else {
        accountContexts[account.id] = context
      }
    }
  }

  // Location
  const askLocation = await p.confirm({
    message: 'Would you like to specify your location? (Helps identify local merchants)',
    initialValue: true,
  })

  let location: { country: string; city: string } | undefined
  if (!p.isCancel(askLocation) && askLocation) {
    const country = await p.text({
      message: 'Country',
      placeholder: 'e.g., Germany, USA, UK',
    })
    if (!p.isCancel(country)) {
      const city = await p.text({
        message: 'City',
        placeholder: 'e.g., Hamburg, New York, London',
      })
      if (!p.isCancel(city)) {
        location = { country, city }
      }
    }
  }

  // Partner
  const hasPartner = await p.confirm({
    message: 'Do you share finances with a partner?',
    initialValue: false,
  })

  let partner: { name: string; context: string } | undefined
  if (!p.isCancel(hasPartner) && hasPartner) {
    const partnerName = await p.text({
      message: 'Partner\'s name (for identifying their transactions)',
      placeholder: 'e.g., Sarah',
    })
    if (!p.isCancel(partnerName)) {
      const partnerContext = await p.text({
        message: 'How are expenses split?',
        placeholder: 'e.g., Split groceries 50/50, they pay utilities',
      })
      if (!p.isCancel(partnerContext)) {
        partner = { name: partnerName, context: partnerContext }
      }
    }
  }

  // Languages
  const languages = await p.multiselect({
    message: 'What languages appear in your transactions?',
    options: LANGUAGES.map((l) => ({ value: l.value, label: l.label })),
    initialValues: ['en'],
  })

  const languageStr = p.isCancel(languages)
    ? 'English'
    : languages.map((l) => LANGUAGES.find((lang) => lang.value === l)?.label ?? l).join(', ')

  // Transaction sources
  const transactionSources = await p.select({
    message: 'How do transactions enter YNAB?',
    options: [
      { value: 'import', label: 'Direct bank import' },
      { value: 'manual', label: 'Manual entry' },
      { value: 'mix', label: 'Mix of both' },
    ],
  })

  const userContext: UserContext = {
    location,
    language: languageStr,
    partner,
    accountContexts: Object.keys(accountContexts).length > 0 ? accountContexts : undefined,
    transactionSources: p.isCancel(transactionSources) ? 'mix' : transactionSources,
  }

  const config: AppConfig = {
    ynab: {
      accessToken: ynabToken,
      defaultBudgetId: budgetChoice,
      defaultBudgetName: selectedBudget.name,
    },
    ai: {
      openRouterApiKey: openRouterKey,
      model: model,
      confidenceThreshold: 0.8,
      yoloThreshold: 0.8,
      historicalTransactionCount: 200,
    },
    display: {
      pageSize: 20,
    },
    userContext,
  }

  await saveConfig(config)

  p.outro('Setup complete! Launching YNAB TUI...')

  return config
}
