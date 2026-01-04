import React, { useEffect, useCallback } from 'react'
import { Box, Text } from 'ink'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { Provider } from 'jotai/react'

import { currentScreenAtom, screenParamsAtom, goBackAtom } from './navigation/navigation-atoms.js'
import {
  transactionsAtom,
  accountsAtom,
  categoryGroupsAtom,
  isLoadingAtom,
  errorAtom,
  checkedIdsAtom,
} from './transactions/transaction-atoms.js'
import { TransactionList } from './transactions/TransactionList.js'
import { TransactionEdit } from './transactions/TransactionEdit.js'
import { CategorizationReview } from './categorization/CategorizationReview.js'
import { YoloProgress } from './categorization/YoloProgress.js'
import { MemoYoloProgress } from './categorization/MemoYoloProgress.js'
import { HelpScreen } from './shared/components/HelpScreen.js'
import { SettingsScreen } from './settings/SettingsScreen.js'
import { PayeeManager } from './payees/PayeeManager.js'
import { createYnabClient, type YnabClient } from './shared/ynab-client.js'
import type { AppConfig } from './config/config-types.js'

interface AppContentProps {
  config: AppConfig
  ynabClient: YnabClient
  onReconfigure: () => void
}

const AppContent = ({ config, ynabClient, onReconfigure }: AppContentProps) => {
  const [screen, setScreen] = useAtom(currentScreenAtom)
  const screenParams = useAtomValue(screenParamsAtom)
  const goBack = useSetAtom(goBackAtom)

  const setTransactions = useSetAtom(transactionsAtom)
  const setAccounts = useSetAtom(accountsAtom)
  const setCategoryGroups = useSetAtom(categoryGroupsAtom)
  const setIsLoading = useSetAtom(isLoadingAtom)
  const setError = useSetAtom(errorAtom)
  const setCheckedIds = useSetAtom(checkedIdsAtom)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    // Clear cache to force full refresh (not delta)
    ynabClient.clearCache()

    try {
      const [transactions, accounts, categories] = await Promise.all([
        ynabClient.getTransactions(),
        ynabClient.getAccounts(),
        ynabClient.getCategories(),
      ])

      setTransactions(transactions)
      setAccounts(accounts)
      setCategoryGroups(categories)

      // Clear checked IDs that no longer exist
      setCheckedIds((ids: Set<string>) => {
        const txIds = new Set(transactions.map((t) => t.id))
        const next = new Set([...ids].filter((id) => txIds.has(id)))
        return next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setIsLoading(false)
    }
  }, [ynabClient])

  // Initial load
  useEffect(() => {
    loadData()
  }, [loadData])

  // Render current screen
  switch (screen) {
    case 'transactions':
      return (
        <TransactionList
          budgetName={ynabClient.getBudgetName()}
          onRefresh={loadData}
        />
      )

    case 'edit':
      if (!screenParams.transactionId) {
        return <Text color="red">No transaction selected</Text>
      }
      return (
        <TransactionEdit
          transactionId={screenParams.transactionId}
          ynabClient={ynabClient}
          config={config}
        />
      )

    case 'review':
      if (!screenParams.transactionIds?.length) {
        return <Text color="red">No transactions to categorize</Text>
      }
      return (
        <CategorizationReview
          transactionIds={screenParams.transactionIds}
          config={config}
          ynabClient={ynabClient}
        />
      )

    case 'yolo':
      if (!screenParams.transactionIds?.length) {
        return <Text color="red">No transactions to categorize</Text>
      }
      return (
        <YoloProgress
          transactionIds={screenParams.transactionIds}
          config={config}
          ynabClient={ynabClient}
        />
      )

    case 'memo-yolo':
      if (!screenParams.transactionIds?.length) {
        return <Text color="red">No transactions selected for memo generation</Text>
      }
      return (
        <MemoYoloProgress
          transactionIds={screenParams.transactionIds}
          config={config}
          ynabClient={ynabClient}
          includeExisting={screenParams.includeExisting ?? false}
        />
      )

    case 'help':
      return <HelpScreen onClose={() => goBack()} />

    case 'settings':
      return (
        <SettingsScreen
          config={config}
          onReconfigure={onReconfigure}
        />
      )

    case 'payees':
      return (
        <PayeeManager
          ynabClient={ynabClient}
          config={config}
        />
      )

    default:
      return <Text>Unknown screen: {screen}</Text>
  }
}

interface AppProps {
  config: AppConfig
  onReconfigure: () => void
}

export const App = ({ config, onReconfigure }: AppProps) => {
  const ynabClient = createYnabClient(
    config.ynab.accessToken,
    config.ynab.defaultBudgetId,
    config.ynab.defaultBudgetName
  )

  return (
    <Provider>
      <Box flexDirection="column">
        <AppContent config={config} ynabClient={ynabClient} onReconfigure={onReconfigure} />
      </Box>
    </Provider>
  )
}
