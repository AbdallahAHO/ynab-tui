import React, { useState, useMemo, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import { useAtomValue } from 'jotai'
import TextInput from 'ink-text-input'
import type { PayeeRule } from './payee-types.js'
import { updatePayeeRule } from './payee-service.js'
import { CategoryPicker } from '../categories/CategoryPicker.js'
import { transactionsAtom, accountMapAtom } from '../transactions/transaction-atoms.js'
import type { YnabClient, Category, CategoryGroupWithCategories } from '../shared/ynab-client.js'
import type { AppConfig } from '../config/config-types.js'

interface PayeeReviewProps {
  payee: PayeeRule
  index: number
  total: number
  categories: Category[]
  categoryGroups: CategoryGroupWithCategories[]
  ynabClient: YnabClient
  config: AppConfig
  onNext: () => void
  onPrev: () => void
  onFinish: () => void
}

type ReviewMode = 'view' | 'editName' | 'editTags' | 'category'

export const PayeeReview = ({
  payee,
  index,
  total,
  categories,
  categoryGroups,
  ynabClient,
  config,
  onNext,
  onPrev,
  onFinish,
}: PayeeReviewProps) => {
  const [mode, setMode] = useState<ReviewMode>('view')
  const [displayName, setDisplayName] = useState(payee.displayName)
  const [tagsInput, setTagsInput] = useState(payee.aiTags.join(', '))
  const [saving, setSaving] = useState(false)

  // Sync state when payee changes (navigation)
  useEffect(() => {
    setDisplayName(payee.displayName)
    setTagsInput(payee.aiTags.join(', '))
    setMode('view')
  }, [payee.payeeId, payee.displayName, payee.aiTags])

  // Get recent transactions for this payee
  const allTransactions = useAtomValue(transactionsAtom)
  const accountMap = useAtomValue(accountMapAtom)

  const recentTransactions = useMemo(() => {
    return allTransactions
      .filter((tx) => tx.payee_id === payee.payeeId && !tx.deleted)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3) // Show fewer in review mode
  }, [allTransactions, payee.payeeId])

  const handleAccept = async () => {
    setSaving(true)
    await updatePayeeRule(payee.payeeId, {
      displayName,
      aiTags: tagsInput.split(',').map((t) => t.trim()).filter(Boolean),
      isNew: false,
    })
    setSaving(false)
    onNext()
  }

  const handleSkip = () => {
    onNext()
  }

  const handleCategorySelect = async (categoryId: string, categoryName: string) => {
    await updatePayeeRule(payee.payeeId, {
      defaultCategoryId: categoryId,
      defaultCategoryName: categoryName,
    })
    setMode('view')
  }

  const handleSyncToYnab = async () => {
    setSaving(true)
    try {
      await ynabClient.updatePayee(payee.payeeId, displayName)
      await updatePayeeRule(payee.payeeId, { syncedToYnab: true })
    } catch {
      // Failed
    }
    setSaving(false)
  }

  useInput((input, key) => {
    if (mode === 'category') return

    if (mode === 'editName' || mode === 'editTags') {
      if (key.escape) {
        setMode('view')
      }
      return
    }

    if (key.escape) {
      onFinish()
      return
    }

    // Accept and move to next
    if (input === 'a') {
      handleAccept()
      return
    }

    // Skip without saving
    if (input === 's') {
      handleSkip()
      return
    }

    // Edit name
    if (input === 'n') {
      setMode('editName')
      return
    }

    // Edit tags
    if (input === 't') {
      setMode('editTags')
      return
    }

    // Set category
    if (input === 'c') {
      setMode('category')
      return
    }

    // Sync to YNAB
    if (input === 'y') {
      handleSyncToYnab()
      return
    }

    // Navigate
    if (key.leftArrow || input === 'h') {
      onPrev()
      return
    }

    if (key.rightArrow || input === 'l') {
      onNext()
      return
    }

    // Finish review
    if (input === 'f') {
      onFinish()
      return
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
      <Box justifyContent="space-between">
        <Text bold color="cyan">Review Payee [{index + 1}/{total}]</Text>
        {saving && <Text color="cyan">Saving...</Text>}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Original: {payee.payeeName}</Text>
        {payee.syncedToYnab && <Text color="green" dimColor>✓ Synced to YNAB</Text>}
      </Box>

      <Box marginTop={1} flexDirection="column" gap={1}>
        <Box gap={1}>
          <Box width={16}>
            <Text dimColor>Display Name:</Text>
          </Box>
          {mode === 'editName' ? (
            <TextInput
              value={displayName}
              onChange={setDisplayName}
              onSubmit={() => setMode('view')}
            />
          ) : (
            <Text bold color="green">{displayName}</Text>
          )}
        </Box>

        <Box gap={1}>
          <Box width={16}>
            <Text dimColor>AI Tags:</Text>
          </Box>
          {mode === 'editTags' ? (
            <TextInput
              value={tagsInput}
              onChange={setTagsInput}
              onSubmit={() => setMode('view')}
            />
          ) : (
            <Text color="yellow">
              {payee.aiTags.length > 0 ? payee.aiTags.join(', ') : 'None'}
            </Text>
          )}
        </Box>

        <Box gap={1}>
          <Box width={16}>
            <Text dimColor>Category:</Text>
          </Box>
          <Text dimColor={!payee.defaultCategoryName}>
            {payee.defaultCategoryName ?? 'Not set'}
          </Text>
        </Box>
      </Box>

      {/* Recent Transactions */}
      {recentTransactions.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Recent:</Text>
          {recentTransactions.map((tx) => {
            const amount = tx.amount / 1000
            const isNegative = amount < 0
            return (
              <Box key={tx.id} gap={1}>
                <Text dimColor>  {tx.date.slice(5)}</Text>
                <Text color={isNegative ? 'red' : 'green'}>
                  {isNegative ? '-' : '+'}${Math.abs(amount).toFixed(2).padStart(7)}
                </Text>
                <Text dimColor>{accountMap.get(tx.account_id)?.slice(0, 10) ?? ''}</Text>
              </Box>
            )
          })}
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          [a] accept & next  [s] skip  [n] edit name  [t] edit tags  [c] category
        </Text>
        <Text dimColor>
          [y] sync to YNAB  [←/→] navigate  [f] finish  [Esc] exit
        </Text>
      </Box>
    </Box>
  )
}
