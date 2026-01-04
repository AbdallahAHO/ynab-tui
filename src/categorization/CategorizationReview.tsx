import React, { useEffect, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  categorizationQueueAtom,
  currentReviewIndexAtom,
  categorizationResultsAtom,
  acceptedCategorizationsAtom,
  acceptedMemosAtom,
  rejectedCategorizationsAtom,
  skippedCategorizationsAtom,
  isCategorizingAtom,
  reviewProgressAtom,
  resetCategorizationAtom,
  payeePatternsAtom,
} from './categorization-atoms.js'
import { transactionsAtom, categoryGroupsAtom, accountsAtom } from '../transactions/transaction-atoms.js'
import { transferPairMapAtom } from '../transfers/transfer-atoms.js'
import type { TransferPair } from '../transfers/transfer-detector.js'
import { goBackAtom } from '../navigation/navigation-atoms.js'
import { createCategorizer } from './categorizer.js'
import { buildPayeePatterns } from './history-analyzer.js'
import { flattenCategories, formatAmount, type YnabClient } from '../shared/ynab-client.js'
import { KeyHints } from '../shared/components/KeyHints.js'
import { CategoryPicker } from '../categories/CategoryPicker.js'
import { buildAIContext } from '../shared/ai-context.js'
import { getAllPayeeRules } from '../payees/payee-service.js'
import type { AppConfig } from '../config/config-types.js'

interface CategorizationReviewProps {
  transactionIds: string[]
  config: AppConfig
  ynabClient: YnabClient
}

export const CategorizationReview = ({
  transactionIds,
  config,
  ynabClient,
}: CategorizationReviewProps) => {
  const goBack = useSetAtom(goBackAtom)
  const resetCategorization = useSetAtom(resetCategorizationAtom)

  const transactions = useAtomValue(transactionsAtom)
  const categoryGroups = useAtomValue(categoryGroupsAtom)
  const accounts = useAtomValue(accountsAtom)
  const categories = flattenCategories(categoryGroups)
  const transferPairMap = useAtomValue(transferPairMapAtom)

  const [queue, setQueue] = useAtom(categorizationQueueAtom)
  const [currentIndex, setCurrentIndex] = useAtom(currentReviewIndexAtom)
  const [results, setResults] = useAtom(categorizationResultsAtom)
  const [accepted, setAccepted] = useAtom(acceptedCategorizationsAtom)
  const [rejected, setRejected] = useAtom(rejectedCategorizationsAtom)
  const [skipped, setSkipped] = useAtom(skippedCategorizationsAtom)
  const [isCategorizing, setIsCategorizing] = useAtom(isCategorizingAtom)
  const [patterns, setPatterns] = useAtom(payeePatternsAtom)

  const progress = useAtomValue(reviewProgressAtom)

  const [showCategoryPicker, setShowCategoryPicker] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Memo step state
  const [memoStepActive, setMemoStepActive] = useState(false)
  const [memoEditMode, setMemoEditMode] = useState(false)
  const [memoEditValue, setMemoEditValue] = useState('')
  const [acceptedMemos, setAcceptedMemos] = useAtom(acceptedMemosAtom)

  // Transfer confirmation state
  const [skippedTransfers, setSkippedTransfers] = useState<Set<string>>(new Set())

  // Initialize queue and run categorization
  useEffect(() => {
    if (queue.length > 0) return // Already initialized

    setQueue(transactionIds)

    // Check if results are already populated (from YOLO mode transition)
    if (results.size > 0) {
      return // Skip AI categorization - already done by YOLO
    }

    // Build patterns from all transactions
    const allPatterns = buildPayeePatterns(transactions, categories)
    setPatterns(allPatterns)

    // Run AI categorization
    const runCategorization = async () => {
      setIsCategorizing(true)
      setError(null)

      try {
        // Load payee rules for context
        const payeeRules = await getAllPayeeRules()

        // Build rich AI context
        const aiContext = buildAIContext({
          userContext: config.userContext,
          accounts,
          payeeRules,
          categories,
          historicalPatterns: allPatterns,
        })

        const categorizer = createCategorizer(
          {
            openRouterApiKey: config.ai.openRouterApiKey,
            model: config.ai.model,
          },
          aiContext
        )

        const txsToCateg = transactions.filter((tx) => transactionIds.includes(tx.id))
        const categResults = await categorizer.categorizeBatch(txsToCateg)
        setResults(categResults)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Categorization failed')
      } finally {
        setIsCategorizing(false)
      }
    }

    runCategorization()
  }, [transactionIds])

  // Current transaction and result
  const currentTxId = queue[currentIndex]
  const currentTx = transactions.find((t) => t.id === currentTxId)
  const currentResult = results.get(currentTxId)

  // Check if current transaction is part of a detected transfer
  const currentTransferPair = currentTxId ? transferPairMap.get(currentTxId) : undefined
  const isTransferPending = currentTransferPair && !skippedTransfers.has(currentTxId)

  // Check if current item is already processed
  const isProcessed =
    accepted.has(currentTxId) ||
    rejected.has(currentTxId) ||
    skipped.has(currentTxId)

  const moveNext = () => {
    if (currentIndex < queue.length - 1) {
      setCurrentIndex((i) => i + 1)
    }
  }

  const movePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1)
    }
  }

  const accept = (categoryId?: string, skipMemoStep = false) => {
    if (!currentTxId || !currentResult) return

    setAccepted((prev: Map<string, string>) => {
      const next = new Map(prev)
      next.set(currentTxId, categoryId || currentResult.categoryId)
      return next
    })

    // Check if transaction needs memo step (no memo + AI suggested one)
    const hasMemo = Boolean(currentTx?.memo && currentTx.memo.trim())
    const hasSuggestedMemo = currentResult.suggestedMemo

    if (!skipMemoStep && !hasMemo && hasSuggestedMemo) {
      setMemoStepActive(true)
    } else {
      moveNext()
    }
  }

  const acceptMemo = (memo: string) => {
    if (!currentTxId) return

    setAcceptedMemos((prev) => {
      const next = new Map(prev)
      next.set(currentTxId, memo)
      return next
    })
    setMemoStepActive(false)
    setMemoEditMode(false)
    moveNext()
  }

  const skipMemo = () => {
    setMemoStepActive(false)
    setMemoEditMode(false)
    moveNext()
  }

  const reject = () => {
    if (!currentTxId) return

    setRejected((prev: Set<string>) => {
      const next = new Set(prev)
      next.add(currentTxId)
      return next
    })
    moveNext()
  }

  const skip = () => {
    if (!currentTxId) return

    setSkipped((prev) => {
      const next = new Set(prev)
      next.add(currentTxId)
      return next
    })
    moveNext()
  }

  const confirmTransfer = () => {
    if (!currentTransferPair) return

    // Skip both sides of the transfer (they don't need categorization)
    setSkipped((prev) => {
      const next = new Set(prev)
      next.add(currentTransferPair.outflow.id)
      next.add(currentTransferPair.inflow.id)
      return next
    })

    // Mark as processed so we don't show transfer prompt again
    setSkippedTransfers((prev) => {
      const next = new Set(prev)
      next.add(currentTransferPair.outflow.id)
      next.add(currentTransferPair.inflow.id)
      return next
    })

    moveNext()
  }

  const rejectTransfer = () => {
    if (!currentTxId) return

    // Mark transfer as rejected so we show AI suggestion instead
    setSkippedTransfers((prev) => {
      const next = new Set(prev)
      next.add(currentTxId)
      return next
    })
  }

  const finish = async () => {
    if (accepted.size === 0) {
      resetCategorization()
      goBack()
      return
    }

    setIsSaving(true)
    try {
      const updates = Array.from(accepted.entries()).map(([txId, catId]) => {
        const memo = acceptedMemos.get(txId)
        return {
          id: txId,
          category_id: catId,
          ...(memo ? { memo } : {}),
        }
      })

      await ynabClient.updateTransactions(updates)
      resetCategorization()
      goBack()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
      setIsSaving(false)
    }
  }

  // Count high confidence items (90%+)
  const highConfidenceCount = queue.filter((txId) => {
    if (accepted.has(txId) || rejected.has(txId) || skipped.has(txId)) return false
    const result = results.get(txId)
    return result && result.confidence >= 0.9
  }).length

  const acceptAllHighConfidence = () => {
    const threshold = 0.9

    queue.forEach((txId) => {
      if (accepted.has(txId) || rejected.has(txId) || skipped.has(txId)) return

      const result = results.get(txId)
      if (result && result.confidence >= threshold) {
        setAccepted((prev: Map<string, string>) => {
          const next = new Map(prev)
          next.set(txId, result.categoryId)
          return next
        })
      }
    })

    // Jump to first non-processed transaction
    const firstUnprocessed = queue.findIndex(
      (txId) => !accepted.has(txId) && !rejected.has(txId) && !skipped.has(txId)
    )
    if (firstUnprocessed >= 0) {
      setCurrentIndex(firstUnprocessed)
    }
  }

  useInput((input, key) => {
    if (showCategoryPicker) return

    // Handle memo step input
    if (memoStepActive && !memoEditMode) {
      if (input === 's' && currentResult?.suggestedMemo) {
        acceptMemo(currentResult.suggestedMemo.short)
        return
      }
      if (input === 'd' && currentResult?.suggestedMemo) {
        acceptMemo(currentResult.suggestedMemo.detailed)
        return
      }
      if (input === 'e' && currentResult?.suggestedMemo) {
        setMemoEditValue(currentResult.suggestedMemo.short)
        setMemoEditMode(true)
        return
      }
      if (input === 'n' || key.escape) {
        skipMemo()
        return
      }
      return // Block other input during memo step
    }

    // Handle memo edit mode (text input handles most keys)
    if (memoEditMode) {
      if (key.escape) {
        setMemoEditMode(false)
        return
      }
      if (key.return && memoEditValue.trim()) {
        acceptMemo(memoEditValue.trim())
        return
      }
      return
    }

    // Handle transfer confirmation prompt
    if (isTransferPending && !isProcessed) {
      if (input === 'y' || input === 'a') {
        confirmTransfer()
        return
      }
      if (input === 'n' || input === 'r') {
        rejectTransfer()
        return
      }
      // Allow navigation during transfer prompt
      if (key.leftArrow || input === 'h') {
        movePrev()
        return
      }
      if (key.rightArrow || input === 'l') {
        moveNext()
        return
      }
      if (key.escape || input === 'q') {
        if (accepted.size > 0) {
          finish()
        } else {
          resetCategorization()
          goBack()
        }
        return
      }
      return // Block other input during transfer prompt
    }

    if (key.escape || input === 'q') {
      if (accepted.size > 0) {
        finish()
      } else {
        resetCategorization()
        goBack()
      }
      return
    }

    // Bulk accept high confidence (90%+)
    if (input === 'H' && !isCategorizing && highConfidenceCount > 0) {
      acceptAllHighConfidence()
      return
    }

    if (input === 'a' && currentResult && !isProcessed) {
      accept()
      return
    }

    if (input === 'r' && !isProcessed) {
      reject()
      return
    }

    if (input === 's' && !isProcessed) {
      skip()
      return
    }

    if (input === 'e' && currentResult) {
      setShowCategoryPicker(true)
      return
    }

    // Number keys to select alternatives (1, 2, 3...)
    if (currentResult && !isProcessed && /^[1-9]$/.test(input)) {
      const altIndex = parseInt(input, 10) - 1
      if (altIndex < currentResult.alternatives.length) {
        const alt = currentResult.alternatives[altIndex]
        accept(alt.categoryId)
      }
      return
    }

    if (input === 'f' && !isCategorizing) {
      finish()
      return
    }

    if (key.leftArrow || input === 'h') {
      movePrev()
    }

    if (key.rightArrow || input === 'l') {
      moveNext()
    }
  })

  if (showCategoryPicker) {
    return (
      <CategoryPicker
        currentCategoryId={currentResult?.categoryId ?? null}
        onSelect={(catId, catName) => {
          accept(catId)
          setShowCategoryPicker(false)
        }}
        onCancel={() => setShowCategoryPicker(false)}
      />
    )
  }

  // Memo step UI
  if (memoStepActive && currentResult?.suggestedMemo) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Add memo?</Text>

        <Box marginY={1} flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
          <Text bold>{currentTx?.payee_name || 'Unknown'}</Text>
          <Text dimColor>Category: {currentResult.categoryName}</Text>
        </Box>

        {memoEditMode ? (
          <Box flexDirection="column" marginY={1}>
            <Text>Edit memo:</Text>
            <Box>
              <Text color="cyan">{'> '}</Text>
              <TextInput
                value={memoEditValue}
                onChange={setMemoEditValue}
                onSubmit={() => {
                  if (memoEditValue.trim()) {
                    acceptMemo(memoEditValue.trim())
                  }
                }}
              />
            </Box>
            <Text dimColor>Press Enter to save, Esc to cancel</Text>
          </Box>
        ) : (
          <Box flexDirection="column" marginY={1} gap={1}>
            <Box gap={1}>
              <Text color="yellow">[s]</Text>
              <Text>Short: </Text>
              <Text color="green">"{currentResult.suggestedMemo.short}"</Text>
            </Box>
            <Box gap={1}>
              <Text color="yellow">[d]</Text>
              <Text>Detailed: </Text>
              <Text color="green">"{currentResult.suggestedMemo.detailed}"</Text>
            </Box>
          </Box>
        )}

        {!memoEditMode && (
          <KeyHints
            hints={[
              { key: 's', label: 'short memo' },
              { key: 'd', label: 'detailed memo' },
              { key: 'e', label: 'edit' },
              { key: 'n', label: 'skip' },
            ]}
          />
        )}
      </Box>
    )
  }

  // Transfer confirmation UI
  if (isTransferPending && currentTx && !isProcessed) {
    const isOutflow = currentTx.id === currentTransferPair.outflow.id
    const fromAccount = isOutflow ? currentTransferPair.fromAccount : currentTransferPair.toAccount
    const toAccount = isOutflow ? currentTransferPair.toAccount : currentTransferPair.fromAccount

    return (
      <Box flexDirection="column" padding={1}>
        {/* Progress bar */}
        <Box gap={2}>
          <Text bold>
            Review [{currentIndex + 1}/{queue.length}]
          </Text>
          <Box>
            <Text color="green">{progress.accepted}✓</Text>
            <Text> </Text>
            <Text color="red">{progress.rejected}✗</Text>
            <Text> </Text>
            <Text color="yellow">{progress.skipped}○</Text>
          </Box>
        </Box>

        <Box marginY={1} flexDirection="column" borderStyle="round" borderColor="magenta" padding={1}>
          <Text bold color="magenta">↔ Detected Transfer</Text>

          <Box marginTop={1} flexDirection="column" gap={1}>
            <Box gap={2}>
              <Text bold>{fromAccount.name}</Text>
              <Text color="red">{formatAmount(currentTransferPair.outflow.amount)}</Text>
              <Text dimColor>{currentTransferPair.outflow.date}</Text>
            </Box>

            <Text color="magenta">→</Text>

            <Box gap={2}>
              <Text bold>{toAccount.name}</Text>
              <Text color="green">{formatAmount(currentTransferPair.inflow.amount)}</Text>
              <Text dimColor>{currentTransferPair.inflow.date}</Text>
            </Box>
          </Box>

          <Box marginTop={1}>
            <Text dimColor>
              Confidence: {Math.round(currentTransferPair.confidence * 100)}%
            </Text>
          </Box>
        </Box>

        <Box marginY={1}>
          <Text>Confirm this is an internal transfer? Both transactions will be skipped.</Text>
        </Box>

        <KeyHints
          hints={[
            { key: 'y', label: 'confirm transfer' },
            { key: 'n', label: 'not a transfer' },
            { key: '←/→', label: 'navigate' },
            { key: 'Esc', label: 'finish' },
          ]}
        />
      </Box>
    )
  }

  // Loading state
  if (isCategorizing) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">
          Analyzing {transactionIds.length} transaction{transactionIds.length !== 1 ? 's' : ''}...
        </Text>
        <Text dimColor>Using {config.ai.model}</Text>
      </Box>
    )
  }

  // Error state
  if (error) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red">Error: {error}</Text>
        <Text dimColor>Press Esc to go back</Text>
      </Box>
    )
  }

  // Saving state
  if (isSaving) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">
          Saving {accepted.size} categorization{accepted.size !== 1 ? 's' : ''}
          {acceptedMemos.size > 0 ? ` + ${acceptedMemos.size} memo${acceptedMemos.size !== 1 ? 's' : ''}` : ''}...
        </Text>
      </Box>
    )
  }

  // All done
  if (!currentTx || currentIndex >= queue.length) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="green">Review Complete!</Text>
        <Box marginY={1} flexDirection="column">
          <Text>Accepted: <Text color="green">{progress.accepted}</Text></Text>
          <Text>Rejected: <Text color="red">{progress.rejected}</Text></Text>
          <Text>Skipped: <Text color="yellow">{progress.skipped}</Text></Text>
        </Box>
        <Text dimColor>Press 'f' to finish and save, or Esc to cancel</Text>
      </Box>
    )
  }

  const confidence = currentResult?.confidence ?? 0
  const confidenceColor =
    confidence >= 0.8 ? 'green' : confidence >= 0.6 ? 'yellow' : 'red'

  return (
    <Box flexDirection="column" padding={1}>
      {/* Progress bar */}
      <Box gap={2}>
        <Text bold>
          Review [{currentIndex + 1}/{queue.length}]
        </Text>
        <Box>
          <Text color="green">{progress.accepted}✓</Text>
          <Text> </Text>
          <Text color="red">{progress.rejected}✗</Text>
          <Text> </Text>
          <Text color="yellow">{progress.skipped}○</Text>
          {highConfidenceCount > 0 && (
            <>
              <Text> </Text>
              <Text color="cyan">{highConfidenceCount} high conf</Text>
            </>
          )}
        </Box>
      </Box>

      {/* Transaction details */}
      <Box
        marginY={1}
        flexDirection="column"
        borderStyle="round"
        borderColor={isProcessed ? 'gray' : 'cyan'}
        padding={1}
      >
        <Box gap={2}>
          <Text bold>{currentTx.payee_name || 'Unknown Payee'}</Text>
          <Text color={currentTx.amount < 0 ? 'red' : 'green'}>
            {formatAmount(currentTx.amount)}
          </Text>
        </Box>

        <Box gap={2}>
          <Text dimColor>{currentTx.date}</Text>
          {currentTx.memo && <Text dimColor>Memo: {currentTx.memo}</Text>}
        </Box>

        {isProcessed && (
          <Box marginTop={1}>
            {accepted.has(currentTxId) && (
              <Text color="green">✓ Accepted: {currentResult?.categoryName}</Text>
            )}
            {rejected.has(currentTxId) && (
              <Text color="red">✗ Rejected</Text>
            )}
            {skipped.has(currentTxId) && (
              <Text color="yellow">○ Skipped</Text>
            )}
          </Box>
        )}
      </Box>

      {/* AI Suggestion */}
      {currentResult && !isProcessed && (
        <Box flexDirection="column" marginBottom={1}>
          <Box gap={2}>
            <Text>Suggested: </Text>
            <Text bold color="cyan">{currentResult.categoryName}</Text>
            <Text color={confidenceColor}>
              ({Math.round(confidence * 100)}% confident)
            </Text>
          </Box>

          <Box marginTop={1}>
            <Text dimColor italic>"{currentResult.reasoning}"</Text>
          </Box>

          {currentResult.alternatives.length > 0 && (
            <Box marginTop={1} flexDirection="column">
              <Text dimColor>Alternatives:</Text>
              {currentResult.alternatives.map((alt, i) => (
                <Box key={i} gap={1}>
                  <Text color="yellow">[{i + 1}]</Text>
                  <Text>{alt.categoryName}</Text>
                  <Text dimColor>({Math.round(alt.confidence * 100)}%)</Text>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )}

      <KeyHints
        hints={
          isProcessed
            ? [
                { key: '←/→', label: 'navigate' },
                { key: 'f', label: 'finish & save' },
                { key: 'Esc', label: 'cancel' },
              ]
            : [
                { key: 'a', label: 'accept' },
                ...(currentResult?.alternatives.length ? [{ key: '1-9', label: 'alt' }] : []),
                { key: 'r', label: 'reject' },
                { key: 'e', label: 'edit' },
                { key: 's', label: 'skip' },
                ...(highConfidenceCount > 0 ? [{ key: 'H', label: `accept ${highConfidenceCount} high` }] : []),
                { key: 'f', label: 'finish' },
              ]
        }
      />
    </Box>
  )
}
