#!/usr/bin/env node
import React from 'react'
import { render } from 'ink'
import { App } from './app.js'
import { loadConfig, isConfigured } from './config/config-service.js'
import { runSetupWizard } from './config/setup-wizard.js'
import type { AppConfig } from './config/config-types.js'
import { parseArgs, type CommandAction } from './cli/args.js'
import { loadConfigWithEnv, validateConfigForCommand, ENV_VARS } from './config/config-loader.js'
import { listCommand, categorizeCommand, memoCommand, payeesCommand } from './cli/commands/index.js'
import { createFormatter } from './cli/output.js'

let currentInstance: ReturnType<typeof render> | null = null

const startApp = (config: AppConfig) => {
  const handleReconfigure = async () => {
    // Unmount current app
    if (currentInstance) {
      currentInstance.unmount()
    }

    // Run setup wizard
    const newConfig = await runSetupWizard()

    // Re-render app with new config
    startApp(newConfig)
  }

  currentInstance = render(
    <App config={config} onReconfigure={handleReconfigure} />
  )
}

const runTuiMode = async (forceSetup: boolean) => {
  // Check if configured
  const configured = await isConfigured()

  let config = await loadConfig()

  // Run setup wizard if not configured or forced
  if (forceSetup || !configured || !config) {
    config = await runSetupWizard()
  }

  // Render the app
  startApp(config)
}

const runCliCommand = async (action: CommandAction) => {
  if (action.command === 'tui') {
    await runTuiMode(action.forceSetup)
    return
  }

  // Load config with env var support
  const { config, missing } = await loadConfigWithEnv()

  // Create a formatter for error messages
  const format = action.options.format
  const quiet = action.options.quiet
  const formatter = createFormatter(format, quiet)

  // Validate config for the command
  const validation = validateConfigForCommand(config, action.command)
  if (!validation.valid) {
    const missingVars = validation.missing.join(', ')
    formatter.error(
      `Missing required configuration: ${missingVars}`,
      `Set environment variables (${missingVars}) or run 'ynab-tui' without arguments to configure via setup wizard.`
    )
  }

  // Execute the command
  switch (action.command) {
    case 'list':
      await listCommand(action.options, config!)
      break
    case 'categorize':
      await categorizeCommand(action.options, config!)
      break
    case 'memo':
      await memoCommand(action.options, config!)
      break
    case 'payees':
      await payeesCommand(action.options, config!)
      break
  }
}

const main = async () => {
  try {
    // Parse command line arguments
    const action = parseArgs(process.argv)

    // If null, --help or --version was displayed
    if (!action) {
      process.exit(0)
    }

    await runCliCommand(action)
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

main()
