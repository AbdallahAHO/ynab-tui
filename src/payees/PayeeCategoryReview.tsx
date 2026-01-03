import React, { useState, useMemo } from 'react'
import { Box, Text, useInput } from 'ink'
import { useAtomValue } from 'jotai'
import type { PayeeRule } from './payee-types.js'
import { updatePayeeRule } from './payee-service.js'
import { CategoryPicker } from '../categories/CategoryPicker.js'
import { transactionsAtom, accountMapAtom } from '../transactions/transaction-atoms.js'
import type { Category, CategoryGroupWithCategories } from '../shared/ynab-client.js'

interface PayeeCategoryReviewProps {
  payees: PayeeRule[]
  categories: Category[]
  categoryGroups: CategoryGroupWithCategories[]
  onFinish: () => void
}

type ReviewMode = 'view' | 'category'

export const PayeeCategoryReview = ({
  payees,
  categories,
  categoryGroups,
  onFinish,
}: PayeeCategoryReviewProps) => {
  const [index, setIndex] = useState(0)
  const [mode, setMode] = useState<ReviewMode>('view')
  const [saving, setSaving] = useState(false)
  const [acceptedCount, setAcceptedCount] = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)

  const currentPayee = payees[index]

  // Get recent transactions for context
  const allTransactions = useAtomValue(transactionsAtom)
  const accountMap = useAtomValue(accountMapAtom)

  const recentTransactions = useMemo(() => {
    if (!currentPayee) return []
    return allTransactions
      .filter((tx) => tx.payee_id === currentPayee.payeeId && !tx.deleted)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3)
  }, [allTransactions, currentPayee?.payeeId])

  if (!currentPayee) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="green">Category Review Complete!</Text>
        <Box marginTop={1}>
          <Text>{acceptedCount} accepted, {skippedCount} skipped</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Press any key to go back...</Text>
        </Box>
      </Box>
    )
  }

  const handleAccept = async () => {
    if (!currentPayee.suggestedCategoryId) return
    setSaving(true)
    await updatePayeeRule(currentPayee.payeeId, {
      defaultCategoryId: currentPayee.suggestedCategoryId,
      defaultCategoryName: currentPayee.suggestedCategoryName,
      suggestedCategoryId: undefined,
      suggestedCategoryName: undefined,
      isNew: false,
    })
    setSaving(false)
    setAcceptedCount((c) => c + 1)
    moveNext()
  }

  const handleSkip = () => {
    setSkippedCount((c) => c + 1)
    moveNext()
  }

  const handleReject = async () => {
    // Clear suggestion without setting category
    await updatePayeeRule(currentPayee.payeeId, {
      suggestedCategoryId: undefined,
      suggestedCategoryName: undefined,
    })
    setSkippedCount((c) => c + 1)
    moveNext()
  }

  const handleCategorySelect = async (categoryId: string, categoryName: string) => {
    setSaving(true)
    await updatePayeeRule(currentPayee.payeeId, {
      defaultCategoryId: categoryId,
      defaultCategoryName: categoryName,
      suggestedCategoryId: undefined,
      suggestedCategoryName: undefined,
      isNew: false,
    })
    setSaving(false)
    setAcceptedCount((c) => c + 1)
    setMode('view')
    moveNext()
  }

  const moveNext = () => {
    if (index < payees.length - 1) {
      setIndex((i) => i + 1)
    } else {
      onFinish()
    }
  }

  const movePrev = () => {
    if (index > 0) {
      setIndex((i) => i - 1)
    }
  }

  const handleAcceptAllHighConfidence = async () => {
    setSaving(true)
    let accepted = 0

    for (const payee of payees) {
      if (payee.suggestedCategoryId) {
        await updatePayeeRule(payee.payeeId, {
          defaultCategoryId: payee.suggestedCategoryId,
          defaultCategoryName: payee.suggestedCategoryName,
          suggestedCategoryId: undefined,
          suggestedCategoryName: undefined,
          isNew: false,
        })
        accepted++
      }
    }

    setSaving(false)
    setAcceptedCount((c) => c + accepted)
    onFinish()
  }

  useInput((input, key) => {
    if (mode === 'category') return
    if (saving) return

    if (key.escape) {
      onFinish()
      return
    }

    // Accept suggested category
    if (input === 'a' && currentPayee.suggestedCategoryId) {
      handleAccept()
      return
    }

    // Reject (clear suggestion)
    if (input === 'r') {
      handleReject()
      return
    }

    // Skip
    if (input === 's') {
      handleSkip()
      return
    }

    // Edit/pick different category
    if (input === 'e' || input === 'c') {
      setMode('category')
      return
    }

    // Accept all with suggestions
    if (input === 'H') {
      handleAcceptAllHighConfidence()
      return
    }

    // Navigate
    if (key.leftArrow || input === 'h') {
      movePrev()
      return
    }

    if (key.rightArrow || input === 'l') {
      moveNext()
      return
    }

    // Finish
    if (input === 'f') {
      onFinish()
      return
    }
  })

  if (mode === 'category') {
    return (
      <CategoryPicker
        currentCategoryId={currentPayee.defaultCategoryId}
        onSelect={handleCategorySelect}
        onCancel={() => setMode('view')}
        categoryGroups={categoryGroups}
      />
    )
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          Category Review [{index + 1}/{payees.length}]
        </Text>
        <Box gap={2}>
          {acceptedCount > 0 && <Text color="green">{acceptedCount} accepted</Text>}
          {skippedCount > 0 && <Text dimColor>{skippedCount} skipped</Text>}
          {saving && <Text color="cyan">Saving...</Text>}
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Box gap={1}>
          <Text dimColor>Payee:</Text>
          <Text bold>{currentPayee.displayName}</Text>
        </Box>

        {currentPayee.aiContext && (
          <Box gap={1}>
            <Text dimColor>Context:</Text>
            <Text italic>{currentPayee.aiContext}</Text>
          </Box>
        )}

        {currentPayee.aiTags.length > 0 && (
          <Box gap={1}>
            <Text dimColor>Tags:</Text>
            <Text color="yellow">{currentPayee.aiTags.join(', ')}</Text>
          </Box>
        )}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Box gap={1}>
          <Text dimColor>Suggested:</Text>
          {currentPayee.suggestedCategoryName ? (
            <Text bold color="green">{currentPayee.suggestedCategoryName}</Text>
          ) : (
            <Text dimColor>No suggestion</Text>
          )}
        </Box>

        {currentPayee.defaultCategoryName && (
          <Box gap={1}>
            <Text dimColor>Current:</Text>
            <Text>{currentPayee.defaultCategoryName}</Text>
          </Box>
        )}
      </Box>

      {/* Recent Transactions */}
      {recentTransactions.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Recent transactions:</Text>
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
          [a] accept suggestion  [r] reject  [s] skip  [e] pick different
        </Text>
        <Text dimColor>
          [H] accept all  [←/→] navigate  [f] finish  [Esc] exit
        </Text>
      </Box>
    </Box>
  )
}
