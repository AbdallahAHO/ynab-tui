import React, { useState, useMemo } from 'react'
import { Box, Text, useInput } from 'ink'
import { useAtomValue } from 'jotai'
import TextInput from 'ink-text-input'
import type { PayeeRule } from './payee-types.js'
import { updatePayeeRule, improvePayeeWithAI } from './payee-service.js'
import { CategoryPicker } from '../categories/CategoryPicker.js'
import { transactionsAtom, accountMapAtom } from '../transactions/transaction-atoms.js'
import type { YnabClient, Category, CategoryGroupWithCategories } from '../shared/ynab-client.js'
import type { AppConfig } from '../config/config-types.js'

interface PayeeEditorProps {
  payee: PayeeRule
  categories: Category[]
  categoryGroups: CategoryGroupWithCategories[]
  ynabClient: YnabClient
  config: AppConfig
  onClose: () => void
}

type EditMode = 'view' | 'name' | 'context' | 'category' | 'syncing'

export const PayeeEditor = ({
  payee,
  categories,
  categoryGroups,
  ynabClient,
  config,
  onClose,
}: PayeeEditorProps) => {
  const [mode, setMode] = useState<EditMode>('view')
  const [displayName, setDisplayName] = useState(payee.displayName)
  const [context, setContext] = useState(payee.context)
  const [selectedField, setSelectedField] = useState(0)
  const [isImproving, setIsImproving] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // Get recent transactions for this payee
  const allTransactions = useAtomValue(transactionsAtom)
  const accountMap = useAtomValue(accountMapAtom)

  const recentTransactions = useMemo(() => {
    return allTransactions
      .filter((tx) => tx.payee_id === payee.payeeId && !tx.deleted)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5)
  }, [allTransactions, payee.payeeId])

  const [aiContext, setAiContext] = useState(payee.aiContext || '')

  const fields = [
    { key: 'name', label: 'Display Name', value: displayName },
    { key: 'category', label: 'Default Category', value: payee.defaultCategoryName ?? 'None' },
    { key: 'context', label: 'Context Notes', value: context || 'None' },
    { key: 'aiContext', label: 'AI Context', value: aiContext || 'None' },
    { key: 'tags', label: 'AI Tags', value: payee.aiTags.join(', ') || 'None' },
  ]

  const handleSave = async () => {
    await updatePayeeRule(payee.payeeId, {
      displayName,
      context,
      isNew: false,
    })
    onClose()
  }

  const handleSyncToYnab = async () => {
    setSyncing(true)
    try {
      await ynabClient.updatePayee(payee.payeeId, displayName)
      await updatePayeeRule(payee.payeeId, { syncedToYnab: true })
    } catch (e) {
      // Failed to sync
    }
    setSyncing(false)
  }

  const handleAIImprove = async () => {
    setIsImproving(true)
    try {
      const improvement = await improvePayeeWithAI(
        { openRouterApiKey: config.ai.openRouterApiKey, model: config.ai.model },
        payee.payeeName,
        categories
      )
      setDisplayName(improvement.displayName)
      if (improvement.context) {
        setAiContext(improvement.context)
      }
      await updatePayeeRule(payee.payeeId, {
        displayName: improvement.displayName,
        aiTags: improvement.tags,
        aiContext: improvement.context,
      })
    } catch (e) {
      // Failed
    }
    setIsImproving(false)
  }

  const handleCategorySelect = async (categoryId: string, categoryName: string) => {
    await updatePayeeRule(payee.payeeId, {
      defaultCategoryId: categoryId,
      defaultCategoryName: categoryName,
      isNew: false,
    })
    setMode('view')
  }

  useInput((input, key) => {
    if (mode === 'category') return

    if (key.escape) {
      if (mode !== 'view') {
        setMode('view')
      } else {
        onClose()
      }
      return
    }

    if (mode === 'name' || mode === 'context') return

    if (input === 'j' || key.downArrow) {
      setSelectedField((i) => Math.min(i + 1, fields.length - 1))
    } else if (input === 'k' || key.upArrow) {
      setSelectedField((i) => Math.max(i - 1, 0))
    } else if (key.return) {
      const field = fields[selectedField]
      if (field.key === 'name') {
        setMode('name')
      } else if (field.key === 'context') {
        setMode('context')
      } else if (field.key === 'category') {
        setMode('category')
      }
    } else if (input === 'r') {
      handleAIImprove()
    } else if (input === 'y') {
      handleSyncToYnab()
    } else if (input === 's') {
      handleSave()
    }
  })

  if (mode === 'category') {
    return (
      <CategoryPicker
        currentCategoryId={payee.defaultCategoryId}
        onSelect={handleCategorySelect}
        onCancel={() => setMode('view')}
        categoryGroups={categoryGroups}
      />
    )
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">Edit Payee</Text>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Original: {payee.payeeName}</Text>
        {payee.syncedToYnab && <Text color="green" dimColor>✓ Synced to YNAB</Text>}
      </Box>

      <Box marginTop={1} flexDirection="column">
        {fields.map((field, i) => {
          const isSelected = i === selectedField && mode === 'view'
          const isEditing =
            (mode === 'name' && field.key === 'name') ||
            (mode === 'context' && field.key === 'context')

          return (
            <Box key={field.key} gap={1}>
              <Text color={isSelected ? 'cyan' : undefined}>
                {isSelected ? '▶' : ' '}
              </Text>
              <Box width={16}>
                <Text dimColor>{field.label}:</Text>
              </Box>
              {isEditing ? (
                <TextInput
                  value={field.key === 'name' ? displayName : context}
                  onChange={(v) =>
                    field.key === 'name' ? setDisplayName(v) : setContext(v)
                  }
                  onSubmit={() => setMode('view')}
                />
              ) : (
                <Text bold={isSelected}>{field.value}</Text>
              )}
            </Box>
          )
        })}
      </Box>

      <Box marginTop={1} flexDirection="column">
        {isImproving && <Text color="cyan">AI improving name...</Text>}
        {syncing && <Text color="cyan">Syncing to YNAB...</Text>}
      </Box>

      {/* Recent Transactions */}
      <Box marginTop={1} flexDirection="column">
        <Text bold dimColor>Recent Transactions ({recentTransactions.length})</Text>
        {recentTransactions.length === 0 ? (
          <Text dimColor italic>  No transactions found</Text>
        ) : (
          recentTransactions.map((tx) => {
            const amount = tx.amount / 1000
            const isNegative = amount < 0
            return (
              <Box key={tx.id} gap={1}>
                <Text dimColor>  {tx.date.slice(5)}</Text>
                <Text color={isNegative ? 'red' : 'green'}>
                  {isNegative ? '-' : '+'}${Math.abs(amount).toFixed(2).padStart(8)}
                </Text>
                <Text dimColor>{accountMap.get(tx.account_id)?.slice(0, 12) ?? 'Unknown'}</Text>
                <Text dimColor>{tx.memo?.slice(0, 20) || ''}</Text>
              </Box>
            )
          })
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          [j/k] nav  [Enter] edit  [r] AI improve  [y] sync to YNAB  [s] save  [Esc] back
        </Text>
      </Box>
    </Box>
  )
}
