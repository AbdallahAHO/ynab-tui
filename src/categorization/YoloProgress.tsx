import React, { useEffect, useRef } from 'react'
import { Box, Text, useInput } from 'ink'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  yoloProgressItemsAtom,
  yoloIsRunningAtom,
  yoloSummaryAtom,
  yoloNeedsReviewIdsAtom,
  resetYoloAtom,
  type YoloProgressItem,
} from './yolo-atoms.js'
import {
  acceptedCategorizationsAtom,
  acceptedMemosAtom,
  categorizationResultsAtom,
  categorizationQueueAtom,
} from './categorization-atoms.js'
import { transactionsAtom, categoryGroupsAtom } from '../transactions/transaction-atoms.js'
import { navigateAtom, goBackAtom } from '../navigation/navigation-atoms.js'
import { createCategorizer } from './categorizer.js'
import { buildPayeePatterns } from './history-analyzer.js'
import { flattenCategories, formatAmount, type YnabClient } from '../shared/ynab-client.js'
import type { AppConfig } from '../config/config-types.js'

interface YoloProgressProps {
  transactionIds: string[]
  config: AppConfig
  ynabClient: YnabClient
}

export const YoloProgress = ({
  transactionIds,
  config,
  ynabClient,
}: YoloProgressProps) => {
  const navigate = useSetAtom(navigateAtom)
  const goBack = useSetAtom(goBackAtom)
  const resetYolo = useSetAtom(resetYoloAtom)

  const transactions = useAtomValue(transactionsAtom)
  const categoryGroups = useAtomValue(categoryGroupsAtom)
  const categories = flattenCategories(categoryGroups)

  const [progressItems, setProgressItems] = useAtom(yoloProgressItemsAtom)
  const [isRunning, setIsRunning] = useAtom(yoloIsRunningAtom)
  const summary = useAtomValue(yoloSummaryAtom)
  const needsReviewIds = useAtomValue(yoloNeedsReviewIdsAtom)

  // For passing to review screen
  const setAccepted = useSetAtom(acceptedCategorizationsAtom)
  const setAcceptedMemos = useSetAtom(acceptedMemosAtom)
  const setResults = useSetAtom(categorizationResultsAtom)
  const setQueue = useSetAtom(categorizationQueueAtom)

  const threshold = config.ai.yoloThreshold ?? 0.8
  const hasStarted = useRef(false)
  const isCancelled = useRef(false)

  // Initialize and run YOLO categorization
  useEffect(() => {
    if (hasStarted.current) return
    hasStarted.current = true

    const runYolo = async () => {
      setIsRunning(true)

      // Initialize progress items as pending
      const initialItems: YoloProgressItem[] = transactionIds.map((id) => {
        const tx = transactions.find((t) => t.id === id)
        return {
          transactionId: id,
          payeeName: tx?.payee_name ?? 'Unknown',
          amount: tx?.amount ?? 0,
          result: null,
          status: 'pending',
        }
      })
      setProgressItems(initialItems)

      // Build patterns
      const patterns = buildPayeePatterns(transactions, categories)

      // Create categorizer
      const categorizer = createCategorizer(
        {
          openRouterApiKey: config.ai.openRouterApiKey,
          model: config.ai.model,
        },
        categories,
        patterns
      )

      // Process transactions ONE BY ONE for streaming display
      const resultsMap = new Map()
      const acceptedMap = new Map()
      const memosMap = new Map()

      for (let i = 0; i < transactionIds.length; i++) {
        if (isCancelled.current) break

        const txId = transactionIds[i]
        const tx = transactions.find((t) => t.id === txId)
        if (!tx) continue

        // Update status to processing
        setProgressItems((prev) =>
          prev.map((item, idx) => (idx === i ? { ...item, status: 'processing' } : item))
        )

        try {
          const result = await categorizer.categorize(tx)
          resultsMap.set(txId, result)

          const isHighConfidence = result.confidence >= threshold

          if (isHighConfidence) {
            // Auto-accept
            acceptedMap.set(txId, result.categoryId)

            // Auto-apply short memo if transaction has no memo and AI suggested one
            const hasMemo = Boolean(tx.memo && tx.memo.trim())
            if (!hasMemo && result.suggestedMemo) {
              memosMap.set(txId, result.suggestedMemo.short)
            }
          }

          setProgressItems((prev) =>
            prev.map((item, idx) =>
              idx === i
                ? {
                    ...item,
                    result,
                    status: isHighConfidence ? 'auto-accepted' : 'needs-review',
                  }
                : item
            )
          )
        } catch {
          setProgressItems((prev) =>
            prev.map((item, idx) => (idx === i ? { ...item, status: 'error' } : item))
          )
        }
      }

      // Store results for potential review screen
      setResults(resultsMap)
      setAccepted(acceptedMap)
      setAcceptedMemos(memosMap)

      setIsRunning(false)
    }

    runYolo()
  }, [transactionIds])

  // Handle finish - save auto-accepted and optionally transition to review
  const handleFinish = async () => {
    const autoAcceptedItems = progressItems.filter(
      (i) => i.status === 'auto-accepted' && i.result
    )

    // Save auto-accepted items
    if (autoAcceptedItems.length > 0) {
      const updates = autoAcceptedItems.map((item) => {
        const tx = transactions.find((t) => t.id === item.transactionId)
        const hasMemo = Boolean(tx?.memo && tx.memo.trim())
        const suggestedMemo = item.result?.suggestedMemo?.short

        return {
          id: item.transactionId,
          category_id: item.result!.categoryId,
          ...(!hasMemo && suggestedMemo ? { memo: suggestedMemo } : {}),
        }
      })

      await ynabClient.updateTransactions(updates)
    }

    // Transition to review if there are uncertain items
    if (needsReviewIds.length > 0) {
      setQueue(needsReviewIds)
      resetYolo()
      navigate('review', { transactionIds: needsReviewIds })
    } else {
      resetYolo()
      goBack()
    }
  }

  // Auto-finish when processing completes
  useEffect(() => {
    if (!isRunning && progressItems.length > 0 && summary.processed === summary.total) {
      handleFinish()
    }
  }, [isRunning, summary.processed, summary.total, progressItems.length])

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      isCancelled.current = true
      resetYolo()
      goBack()
    }
  })

  // Viewport for scrolling (show last N items)
  const viewportSize = 15
  const visibleItems = progressItems.slice(-viewportSize)

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        YOLO Mode - Auto-Categorizing {transactionIds.length} transactions
      </Text>
      <Text dimColor>
        Threshold: {Math.round(threshold * 100)}% confidence | Model: {config.ai.model}
      </Text>

      <Box marginY={1} flexDirection="column">
        {visibleItems.map((item) => (
          <YoloProgressRow key={item.transactionId} item={item} />
        ))}
        {progressItems.length === 0 && <Text dimColor>Starting...</Text>}
      </Box>

      {/* Summary bar */}
      <Box marginTop={1} gap={2}>
        <Text>
          Progress: {summary.processed}/{summary.total}
        </Text>
        <Text color="green">{summary.autoAccepted} auto-accepted</Text>
        <Text color="yellow">{summary.needsReview} need review</Text>
        {summary.errors > 0 && <Text color="red">{summary.errors} errors</Text>}
      </Box>

      <Box marginTop={1}>
        {isRunning ? (
          <Text dimColor>Processing... Press Esc to cancel</Text>
        ) : (
          <Text dimColor>Complete! Saving...</Text>
        )}
      </Box>
    </Box>
  )
}

const YoloProgressRow = ({ item }: { item: YoloProgressItem }) => {
  const statusIcon = {
    pending: ' ',
    processing: '...',
    'auto-accepted': '✓',
    'needs-review': '?',
    error: '✗',
  }[item.status]

  const statusColor = {
    pending: 'gray',
    processing: 'cyan',
    'auto-accepted': 'green',
    'needs-review': 'yellow',
    error: 'red',
  }[item.status] as 'gray' | 'cyan' | 'green' | 'yellow' | 'red'

  return (
    <Box gap={1}>
      <Text color={statusColor}>{statusIcon}</Text>
      <Box width={25}>
        <Text>{item.payeeName.slice(0, 24)}</Text>
      </Box>
      <Box width={12} justifyContent="flex-end">
        <Text color={item.amount < 0 ? 'red' : 'green'}>{formatAmount(item.amount)}</Text>
      </Box>
      {item.result && (
        <>
          <Text dimColor> → </Text>
          <Text>{item.result.categoryName}</Text>
          <Text dimColor> ({Math.round(item.result.confidence * 100)}%)</Text>
        </>
      )}
    </Box>
  )
}
