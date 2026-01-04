import React, { useEffect, useRef } from 'react'
import { Box, Text, useInput } from 'ink'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  memoProgressItemsAtom,
  memoIsRunningAtom,
  memoSummaryAtom,
  memoIncludeExistingAtom,
  resetMemoAtom,
  type MemoProgressItem,
} from './memo-atoms.js'
import { transactionsAtom, categoryGroupsAtom, accountsAtom } from '../transactions/transaction-atoms.js'
import { goBackAtom } from '../navigation/navigation-atoms.js'
import { createCategorizer } from './categorizer.js'
import { buildPayeePatterns } from './history-analyzer.js'
import { flattenCategories, formatAmount, type YnabClient } from '../shared/ynab-client.js'
import { buildAIContext } from '../shared/ai-context.js'
import { getAllPayeeRules } from '../payees/payee-service.js'
import type { AppConfig } from '../config/config-types.js'

interface MemoYoloProgressProps {
  transactionIds: string[]
  config: AppConfig
  ynabClient: YnabClient
  includeExisting: boolean
}

export const MemoYoloProgress = ({
  transactionIds,
  config,
  ynabClient,
  includeExisting,
}: MemoYoloProgressProps) => {
  const goBack = useSetAtom(goBackAtom)
  const resetMemo = useSetAtom(resetMemoAtom)

  const transactions = useAtomValue(transactionsAtom)
  const categoryGroups = useAtomValue(categoryGroupsAtom)
  const accounts = useAtomValue(accountsAtom)
  const categories = flattenCategories(categoryGroups)

  const [progressItems, setProgressItems] = useAtom(memoProgressItemsAtom)
  const [isRunning, setIsRunning] = useAtom(memoIsRunningAtom)
  const setIncludeExisting = useSetAtom(memoIncludeExistingAtom)
  const summary = useAtomValue(memoSummaryAtom)

  const hasStarted = useRef(false)
  const isCancelled = useRef(false)

  useEffect(() => {
    if (hasStarted.current) return
    hasStarted.current = true
    setIncludeExisting(includeExisting)

    const runMemoGeneration = async () => {
      setIsRunning(true)

      // Initialize progress items
      const initialItems: MemoProgressItem[] = transactionIds.map((id) => {
        const tx = transactions.find((t) => t.id === id)
        return {
          transactionId: id,
          payeeName: tx?.payee_name ?? 'Unknown',
          amount: tx?.amount ?? 0,
          existingMemo: tx?.memo ?? null,
          result: null,
          status: 'pending',
        }
      })
      setProgressItems(initialItems)

      // Build patterns and context
      const patterns = buildPayeePatterns(transactions, categories)
      const payeeRules = await getAllPayeeRules()

      const aiContext = buildAIContext({
        userContext: config.userContext,
        accounts,
        payeeRules,
        categories,
        historicalPatterns: patterns,
      })

      const categorizer = createCategorizer(
        {
          openRouterApiKey: config.ai.openRouterApiKey,
          model: config.ai.model,
        },
        aiContext
      )

      // Process transactions one by one for streaming display
      const generatedMemos = new Map<string, string>()

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
          const result = await categorizer.generateMemo(tx, includeExisting)

          if (result) {
            generatedMemos.set(txId, result.short)
            setProgressItems((prev) =>
              prev.map((item, idx) =>
                idx === i ? { ...item, result, status: 'generated' } : item
              )
            )
          } else {
            setProgressItems((prev) =>
              prev.map((item, idx) => (idx === i ? { ...item, status: 'skipped' } : item))
            )
          }
        } catch {
          setProgressItems((prev) =>
            prev.map((item, idx) => (idx === i ? { ...item, status: 'error' } : item))
          )
        }
      }

      // Save all generated memos to YNAB
      if (generatedMemos.size > 0 && !isCancelled.current) {
        const updates = Array.from(generatedMemos.entries()).map(([id, memo]) => ({
          id,
          memo,
        }))
        await ynabClient.updateTransactions(updates)
      }

      setIsRunning(false)
    }

    runMemoGeneration()
  }, [transactionIds])

  // Auto-finish when complete
  useEffect(() => {
    if (!isRunning && progressItems.length > 0 && summary.processed === summary.total) {
      const timer = setTimeout(() => {
        resetMemo()
        goBack()
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [isRunning, summary.processed, summary.total, progressItems.length])

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      isCancelled.current = true
      resetMemo()
      goBack()
    }
  })

  // Viewport for scrolling
  const viewportSize = 15
  const visibleItems = progressItems.slice(-viewportSize)

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">
        Bulk Memo Generation - {transactionIds.length} transactions
      </Text>
      <Text dimColor>
        {includeExisting ? 'Replacing existing memos' : 'Only empty memos'} | Model: {config.ai.model}
      </Text>

      <Box marginY={1} flexDirection="column">
        {visibleItems.map((item) => (
          <MemoProgressRow key={item.transactionId} item={item} />
        ))}
        {progressItems.length === 0 && <Text dimColor>Starting...</Text>}
      </Box>

      <Box marginTop={1} gap={2}>
        <Text>
          Progress: {summary.processed}/{summary.total}
        </Text>
        <Text color="green">{summary.generated} generated</Text>
        <Text dimColor>{summary.skipped} skipped</Text>
        {summary.errors > 0 && <Text color="red">{summary.errors} errors</Text>}
      </Box>

      <Box marginTop={1}>
        {isRunning ? (
          <Text dimColor>Generating memos... Press Esc to cancel</Text>
        ) : (
          <Text color="green">Complete! Returning...</Text>
        )}
      </Box>
    </Box>
  )
}

const MemoProgressRow = ({ item }: { item: MemoProgressItem }) => {
  const statusIcon = {
    pending: ' ',
    processing: '...',
    generated: '✓',
    skipped: '-',
    error: '✗',
  }[item.status]

  const statusColor = {
    pending: 'gray',
    processing: 'cyan',
    generated: 'green',
    skipped: 'gray',
    error: 'red',
  }[item.status] as 'gray' | 'cyan' | 'green' | 'red'

  return (
    <Box gap={1}>
      <Text color={statusColor}>{statusIcon}</Text>
      <Box width={20}>
        <Text>{item.payeeName.slice(0, 19)}</Text>
      </Box>
      <Box width={10} justifyContent="flex-end">
        <Text color={item.amount < 0 ? 'red' : 'green'}>{formatAmount(item.amount)}</Text>
      </Box>
      {item.result && (
        <>
          <Text dimColor> → </Text>
          <Text color="cyan">{item.result.short}</Text>
        </>
      )}
      {item.status === 'skipped' && item.existingMemo && (
        <>
          <Text dimColor> (has memo)</Text>
        </>
      )}
    </Box>
  )
}
