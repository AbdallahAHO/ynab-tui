import { loadConfig as loadConfigFile } from './config-service.js'
import { appConfigSchema, type AppConfig } from './config-types.js'

/**
 * Environment variable names for CLI automation
 */
export const ENV_VARS = {
  YNAB_TOKEN: 'YNAB_TOKEN',
  YNAB_BUDGET_ID: 'YNAB_BUDGET_ID',
  OPENROUTER_KEY: 'OPENROUTER_KEY',
  YNAB_MODEL: 'YNAB_MODEL',
} as const

interface LoadConfigResult {
  config: AppConfig | null
  source: 'env' | 'file' | 'mixed' | null
  missing: string[]
}

/**
 * Load config from environment variables, with fallback to config file.
 * Env vars take priority over config file values.
 */
export const loadConfigWithEnv = async (): Promise<LoadConfigResult> => {
  const fileConfig = await loadConfigFile()
  const missing: string[] = []

  // Check what's available from env vars
  const envToken = process.env[ENV_VARS.YNAB_TOKEN]
  const envBudgetId = process.env[ENV_VARS.YNAB_BUDGET_ID]
  const envOpenRouterKey = process.env[ENV_VARS.OPENROUTER_KEY]
  const envModel = process.env[ENV_VARS.YNAB_MODEL]

  // Determine final values (env takes priority)
  const accessToken = envToken || fileConfig?.ynab.accessToken
  const budgetId = envBudgetId || fileConfig?.ynab.defaultBudgetId
  const openRouterApiKey = envOpenRouterKey || fileConfig?.ai.openRouterApiKey
  const model = envModel || fileConfig?.ai.model || 'openai/gpt-4.1-nano'

  // Check for missing required fields
  if (!accessToken) missing.push(ENV_VARS.YNAB_TOKEN)
  if (!budgetId) missing.push(ENV_VARS.YNAB_BUDGET_ID)
  if (!openRouterApiKey) missing.push(ENV_VARS.OPENROUTER_KEY)

  if (missing.length > 0) {
    return { config: null, source: null, missing }
  }

  // Determine source
  let source: 'env' | 'file' | 'mixed'
  if (envToken && envBudgetId && envOpenRouterKey) {
    source = fileConfig ? 'mixed' : 'env'
  } else if (fileConfig) {
    source = envToken || envBudgetId || envOpenRouterKey ? 'mixed' : 'file'
  } else {
    source = 'env'
  }

  // Build merged config
  const mergedConfig = {
    ynab: {
      accessToken: accessToken!,
      defaultBudgetId: budgetId!,
      defaultBudgetName: fileConfig?.ynab.defaultBudgetName,
    },
    ai: {
      openRouterApiKey: openRouterApiKey!,
      model,
      confidenceThreshold: fileConfig?.ai.confidenceThreshold ?? 0.8,
      yoloThreshold: fileConfig?.ai.yoloThreshold ?? 0.8,
      historicalTransactionCount: fileConfig?.ai.historicalTransactionCount ?? 200,
    },
    display: {
      pageSize: fileConfig?.display.pageSize ?? 30,
    },
    userContext: fileConfig?.userContext,
  }

  // Validate with zod schema
  const validated = appConfigSchema.parse(mergedConfig)

  return { config: validated, source, missing: [] }
}

/**
 * Validate that config has all required fields for a command.
 * Some commands may need less than others (e.g., list doesn't need AI key).
 */
export const validateConfigForCommand = (
  config: AppConfig | null,
  command: 'list' | 'categorize' | 'memo' | 'payees'
): { valid: boolean; missing: string[] } => {
  if (!config) {
    return {
      valid: false,
      missing: [ENV_VARS.YNAB_TOKEN, ENV_VARS.YNAB_BUDGET_ID, ENV_VARS.OPENROUTER_KEY],
    }
  }

  const missing: string[] = []

  // All commands need YNAB access
  if (!config.ynab.accessToken) missing.push(ENV_VARS.YNAB_TOKEN)
  if (!config.ynab.defaultBudgetId) missing.push(ENV_VARS.YNAB_BUDGET_ID)

  // AI-related commands need OpenRouter key
  if (command !== 'list' && command !== 'payees') {
    if (!config.ai.openRouterApiKey) missing.push(ENV_VARS.OPENROUTER_KEY)
  }

  // Payees with --set-category doesn't need AI, but AI tagging would
  // For now, payees list/set-category doesn't require AI key

  return { valid: missing.length === 0, missing }
}
