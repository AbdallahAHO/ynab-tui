import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { appConfigSchema, type AppConfig } from './config-types.js'
import type { PayeeRule } from '../payees/payee-types.js'

const CONFIG_DIR = join(homedir(), '.config', 'ynab-tui')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')
const PAYEES_FILE = join(CONFIG_DIR, 'payees.json')

export const getConfigPath = () => CONFIG_FILE

export const loadConfig = async (): Promise<AppConfig | null> => {
  try {
    if (!existsSync(CONFIG_FILE)) return null
    const content = await readFile(CONFIG_FILE, 'utf-8')
    const parsed = JSON.parse(content)
    return appConfigSchema.parse(parsed)
  } catch {
    return null
  }
}

export const saveConfig = async (config: AppConfig): Promise<void> => {
  await mkdir(CONFIG_DIR, { recursive: true })
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2))
}

export const isConfigured = async (): Promise<boolean> => {
  const config = await loadConfig()
  return !!(config?.ynab.accessToken && config?.ai.openRouterApiKey)
}

export const updateConfig = async (
  updates: Partial<AppConfig>
): Promise<AppConfig> => {
  const current = await loadConfig()
  if (!current) throw new Error('No config found')

  const updated: AppConfig = {
    ...current,
    ynab: { ...current.ynab, ...updates.ynab },
    ai: { ...current.ai, ...updates.ai },
    display: { ...current.display, ...updates.display },
    userContext: updates.userContext ?? current.userContext,
  }

  await saveConfig(updated)
  return updated
}

export const loadPayeeRules = async (): Promise<PayeeRule[]> => {
  try {
    if (!existsSync(PAYEES_FILE)) return []
    const content = await readFile(PAYEES_FILE, 'utf-8')
    return JSON.parse(content) as PayeeRule[]
  } catch {
    return []
  }
}

export const savePayeeRules = async (rules: PayeeRule[]): Promise<void> => {
  await mkdir(CONFIG_DIR, { recursive: true })
  await writeFile(PAYEES_FILE, JSON.stringify(rules, null, 2))
}
