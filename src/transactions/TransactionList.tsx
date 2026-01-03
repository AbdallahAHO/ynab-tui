import React, { useEffect } from 'react'
import { Box, Text, useInput, useApp } from 'ink'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  filteredTransactionsAtom,
  selectedIndexAtom,
  checkedIdsAtom,
  categoryMapAtom,
  accountMapAtom,
  showUncategorizedOnlyAtom,
  isLoadingAtom,
  transactionsAtom,
  viewportStartAtom,
  viewportSizeAtom,
} from './transaction-atoms.js'
import { navigateAtom } from '../navigation/navigation-atoms.js'
import { TransactionRow } from './TransactionRow.js'
import { KeyHints } from '../shared/components/KeyHints.js'
import { StatusBar } from '../shared/components/StatusBar.js'

interface TransactionListProps {
  budgetName: string
  onRefresh: () => Promise<void>
}

export const TransactionList = ({ budgetName, onRefresh }: TransactionListProps) => {
  const { exit } = useApp()
  const transactions = useAtomValue(filteredTransactionsAtom)
  const allTransactions = useAtomValue(transactionsAtom)
  const [selectedIndex, setSelectedIndex] = useAtom(selectedIndexAtom)
  const [checkedIds, setCheckedIds] = useAtom(checkedIdsAtom)
  const categoryMap = useAtomValue(categoryMapAtom)
  const accountMap = useAtomValue(accountMapAtom)
  const [showUncategorizedOnly, setShowUncategorizedOnly] = useAtom(showUncategorizedOnlyAtom)
  const isLoading = useAtomValue(isLoadingAtom)
  const navigate = useSetAtom(navigateAtom)
  const [viewportStart, setViewportStart] = useAtom(viewportStartAtom)
  const viewportSize = useAtomValue(viewportSizeAtom)

  // Track 'g' key for gg command
  const [waitingForG, setWaitingForG] = React.useState(false)

  // Keep selection in bounds
  useEffect(() => {
    if (selectedIndex >= transactions.length) {
      setSelectedIndex(Math.max(0, transactions.length - 1))
    }
  }, [transactions.length, selectedIndex, setSelectedIndex])

  // Keep viewport following selection
  useEffect(() => {
    if (selectedIndex < viewportStart) {
      setViewportStart(selectedIndex)
    } else if (selectedIndex >= viewportStart + viewportSize) {
      setViewportStart(selectedIndex - viewportSize + 1)
    }
  }, [selectedIndex, viewportStart, viewportSize, setViewportStart])

  useInput((input, key) => {
    const halfPage = Math.floor(viewportSize / 2)

    // Handle gg command (two g presses)
    if (waitingForG) {
      setWaitingForG(false)
      if (input === 'g') {
        setSelectedIndex(0)
        setViewportStart(0)
        return
      }
    }

    // Vim: G = go to end
    if (input === 'G') {
      setSelectedIndex(transactions.length - 1)
      setViewportStart(Math.max(0, transactions.length - viewportSize))
      return
    }

    // Vim: g = start gg sequence
    if (input === 'g') {
      setWaitingForG(true)
      return
    }

    // Navigation
    if (input === 'j' || key.downArrow) {
      setSelectedIndex((i) => Math.min(i + 1, transactions.length - 1))
    }
    if (input === 'k' || key.upArrow) {
      setSelectedIndex((i) => Math.max(i - 1, 0))
    }

    // Page navigation
    if (key.pageDown) {
      setSelectedIndex((i) => Math.min(i + viewportSize, transactions.length - 1))
    }
    if (key.pageUp) {
      setSelectedIndex((i) => Math.max(i - viewportSize, 0))
    }

    // Vim: Ctrl+d = half page down
    if (key.ctrl && input === 'd') {
      setSelectedIndex((i) => Math.min(i + halfPage, transactions.length - 1))
    }
    // Vim: Ctrl+u = half page up
    if (key.ctrl && input === 'u') {
      setSelectedIndex((i) => Math.max(i - halfPage, 0))
    }

    // Toggle selection
    if (input === ' ') {
      const tx = transactions[selectedIndex]
      if (tx) {
        setCheckedIds((ids: Set<string>) => {
          const next = new Set(ids)
          if (next.has(tx.id)) {
            next.delete(tx.id)
          } else {
            next.add(tx.id)
          }
          return next
        })
      }
    }

    // Edit transaction
    if (key.return) {
      const tx = transactions[selectedIndex]
      if (tx) {
        navigate('edit', { transactionId: tx.id })
      }
    }

    // AI categorize
    if (input === 'c') {
      const ids = checkedIds.size > 0
        ? Array.from(checkedIds)
        : transactions[selectedIndex]
          ? [transactions[selectedIndex].id]
          : []

      if (ids.length > 0) {
        navigate('review', { transactionIds: ids })
      }
    }

    // YOLO mode - auto-categorize all uncategorized
    if (input === 'Y') {
      const uncategorized = allTransactions.filter((tx) => !tx.category_id && !tx.deleted)
      if (uncategorized.length > 0) {
        navigate('yolo', { transactionIds: uncategorized.map((tx) => tx.id) })
      }
    }

    // Toggle filter
    if (input === 'u') {
      setShowUncategorizedOnly((v) => !v)
    }

    // Refresh
    if (input === 'r') {
      onRefresh()
    }

    // Help
    if (input === '?') {
      navigate('help')
    }

    // Settings
    if (input === 'S') {
      navigate('settings')
    }

    // Quit
    if (input === 'q') {
      exit()
    }
  })

  const uncategorizedCount = allTransactions.filter((t) => !t.category_id && !t.deleted).length

  if (isLoading) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="cyan">Loading transactions...</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <StatusBar
        budgetName={budgetName}
        transactionCount={allTransactions.length}
        uncategorizedCount={uncategorizedCount}
        selectedCount={checkedIds.size}
      />

      {/* Filter bar */}
      <Box paddingX={1} gap={2}>
        <Text>
          Filter:{' '}
          <Text color={showUncategorizedOnly ? 'yellow' : 'gray'}>
            {showUncategorizedOnly ? 'Uncategorized only' : 'All transactions'}
          </Text>
        </Text>
        <Text dimColor>
          {transactions.length > 0
            ? `${selectedIndex + 1}/${transactions.length}`
            : 'No transactions'}
        </Text>
      </Box>

      {/* Header */}
      <Box paddingX={1} gap={1} marginTop={1}>
        <Text dimColor>  </Text>
        <Text dimColor>  </Text>
        <Text dimColor> </Text>
        <Box width={10}>
          <Text dimColor bold>Date</Text>
        </Box>
        <Box width={25}>
          <Text dimColor bold>Payee</Text>
        </Box>
        <Box width={20}>
          <Text dimColor bold>Category</Text>
        </Box>
        <Box width={15}>
          <Text dimColor bold>Account</Text>
        </Box>
        <Box width={12} justifyContent="flex-end">
          <Text dimColor bold>Amount</Text>
        </Box>
      </Box>

      {/* Transaction list */}
      <Box flexDirection="column" paddingX={1}>
        {transactions.length === 0 ? (
          <Box marginY={2}>
            <Text color="green">
              {showUncategorizedOnly
                ? '✓ All transactions are categorized!'
                : 'No transactions found.'}
            </Text>
          </Box>
        ) : (
          transactions.slice(viewportStart, viewportStart + viewportSize).map((tx, viewportIndex) => {
            const actualIndex = viewportStart + viewportIndex
            return (
              <TransactionRow
                key={tx.id}
                transaction={tx}
                categoryName={tx.category_id ? categoryMap.get(tx.category_id)?.name ?? null : null}
                accountName={accountMap.get(tx.account_id) ?? 'Unknown'}
                isSelected={actualIndex === selectedIndex}
                isChecked={checkedIds.has(tx.id)}
              />
            )
          })
        )}
      </Box>

      <KeyHints
        hints={[
          { key: 'j/k', label: 'nav' },
          { key: 'G/gg', label: 'end/start' },
          { key: 'Space', label: 'select' },
          { key: 'c', label: 'categorize' },
          { key: 'Y', label: 'yolo' },
          { key: 'Enter', label: 'edit' },
          { key: 'u', label: 'filter' },
          { key: 'r', label: 'refresh' },
          { key: 'S', label: 'settings' },
          { key: 'q', label: 'quit' },
        ]}
      />
    </Box>
  )
}
