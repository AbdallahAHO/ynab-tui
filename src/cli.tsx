#!/usr/bin/env node
import React from 'react'
import { render } from 'ink'
import { App } from './app.js'
import { loadConfig, isConfigured } from './config/config-service.js'
import { runSetupWizard } from './config/setup-wizard.js'
import type { AppConfig } from './config/config-types.js'

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

const main = async () => {
  // Check for --setup flag
  const forceSetup = process.argv.includes('--setup')

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

main().catch((error) => {
  console.error('Error:', error.message)
  process.exit(1)
})
