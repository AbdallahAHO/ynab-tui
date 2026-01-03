import React, { useState, useMemo } from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import { useAtomValue, useSetAtom } from 'jotai'
import { transactionsAtom, categoryMapAtom } from './transaction-atoms.js'
import { goBackAtom } from '../navigation/navigation-atoms.js'
import { CategoryPicker } from '../categories/CategoryPicker.js'
import { formatAmount } from '../shared/ynab-client.js'
import { KeyHints } from '../shared/components/KeyHints.js'
import type { YnabClient } from '../shared/ynab-client.js'

interface TransactionEditProps {
  transactionId: string
  ynabClient: YnabClient
}

type Field = 'payee' | 'memo' | 'category' | 'flag'
type FlagColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | null

const FLAG_OPTIONS: { value: FlagColor; label: string }[] = [
  { value: null, label: 'None' },
  { value: 'red', label: '🔴 Red' },
  { value: 'orange', label: '🟠 Orange' },
  { value: 'yellow', label: '🟡 Yellow' },
  { value: 'green', label: '🟢 Green' },
  { value: 'blue', label: '🔵 Blue' },
  { value: 'purple', label: '🟣 Purple' },
]

export const TransactionEdit = ({ transactionId, ynabClient }: TransactionEditProps) => {
  const transactions = useAtomValue(transactionsAtom)
  const categoryMap = useAtomValue(categoryMapAtom)
  const goBack = useSetAtom(goBackAtom)

  const transaction = useMemo(
    () => transactions.find((t) => t.id === transactionId),
    [transactions, transactionId]
  )

  const [payee, setPayee] = useState(transaction?.payee_name || '')
  const [memo, setMemo] = useState(transaction?.memo || '')
  const [categoryId, setCategoryId] = useState<string | null>(transaction?.category_id || null)
  const [categoryName, setCategoryName] = useState(
    transaction?.category_id ? categoryMap.get(transaction.category_id)?.name || '' : ''
  )
  const [flagColor, setFlagColor] = useState<FlagColor>(transaction?.flag_color || null)

  const [currentField, setCurrentField] = useState<Field>('payee')
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const hasChanges =
    payee !== transaction?.payee_name ||
    memo !== (transaction?.memo || '') ||
    categoryId !== transaction?.category_id ||
    flagColor !== transaction?.flag_color

  const save = async () => {
    if (!transaction || !hasChanges) return

    setIsSaving(true)
    try {
      await ynabClient.updateTransactions([
        {
          id: transaction.id,
          payee_name: payee !== transaction.payee_name ? payee : undefined,
          memo: memo !== (transaction.memo || '') ? memo : undefined,
          category_id: categoryId !== transaction.category_id ? categoryId : undefined,
          flag_color: flagColor !== transaction.flag_color ? flagColor : undefined,
        },
      ])
      goBack()
    } catch (error) {
      // TODO: show error
      setIsSaving(false)
    }
  }

  useInput((input, key) => {
    if (showCategoryPicker) return

    if (key.escape) {
      goBack()
      return
    }

    if (key.return && currentField !== 'category') {
      save()
      return
    }

    if (key.tab || key.downArrow) {
      const fields: Field[] = ['payee', 'memo', 'category', 'flag']
      const idx = fields.indexOf(currentField)
      setCurrentField(fields[(idx + 1) % fields.length])
      return
    }

    if ((key.shift && key.tab) || key.upArrow) {
      const fields: Field[] = ['payee', 'memo', 'category', 'flag']
      const idx = fields.indexOf(currentField)
      setCurrentField(fields[(idx - 1 + fields.length) % fields.length])
      return
    }

    // Flag cycling
    if (currentField === 'flag') {
      if (input === ' ' || key.return) {
        const idx = FLAG_OPTIONS.findIndex((f) => f.value === flagColor)
        setFlagColor(FLAG_OPTIONS[(idx + 1) % FLAG_OPTIONS.length].value)
      }
    }

    // Category picker
    if (currentField === 'category' && key.return) {
      setShowCategoryPicker(true)
    }
  })

  if (!transaction) {
    return <Text color="red">Transaction not found</Text>
  }

  if (showCategoryPicker) {
    return (
      <CategoryPicker
        currentCategoryId={categoryId}
        onSelect={(id, name) => {
          setCategoryId(id)
          setCategoryName(name)
          setShowCategoryPicker(false)
        }}
        onCancel={() => setShowCategoryPicker(false)}
      />
    )
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold>Edit Transaction</Text>
        <Text dimColor> · {transaction.date} · {formatAmount(transaction.amount)}</Text>
      </Box>

      <Box flexDirection="column" gap={1}>
        {/* Payee */}
        <Box gap={1}>
          <Text color={currentField === 'payee' ? 'cyan' : undefined}>
            {currentField === 'payee' ? '▶' : ' '}
          </Text>
          <Box width={12}>
            <Text bold>Payee:</Text>
          </Box>
          {currentField === 'payee' ? (
            <TextInput value={payee} onChange={setPayee} />
          ) : (
            <Text>{payee || <Text dimColor>empty</Text>}</Text>
          )}
        </Box>

        {/* Memo */}
        <Box gap={1}>
          <Text color={currentField === 'memo' ? 'cyan' : undefined}>
            {currentField === 'memo' ? '▶' : ' '}
          </Text>
          <Box width={12}>
            <Text bold>Memo:</Text>
          </Box>
          {currentField === 'memo' ? (
            <TextInput value={memo} onChange={setMemo} />
          ) : (
            <Text>{memo || <Text dimColor>empty</Text>}</Text>
          )}
        </Box>

        {/* Category */}
        <Box gap={1}>
          <Text color={currentField === 'category' ? 'cyan' : undefined}>
            {currentField === 'category' ? '▶' : ' '}
          </Text>
          <Box width={12}>
            <Text bold>Category:</Text>
          </Box>
          <Text color={categoryId ? 'green' : 'yellow'}>
            {categoryName || 'Uncategorized'}
          </Text>
          {currentField === 'category' && (
            <Text dimColor> (press Enter to change)</Text>
          )}
        </Box>

        {/* Flag */}
        <Box gap={1}>
          <Text color={currentField === 'flag' ? 'cyan' : undefined}>
            {currentField === 'flag' ? '▶' : ' '}
          </Text>
          <Box width={12}>
            <Text bold>Flag:</Text>
          </Box>
          <Text>
            {FLAG_OPTIONS.find((f) => f.value === flagColor)?.label || 'None'}
          </Text>
          {currentField === 'flag' && (
            <Text dimColor> (press Space to cycle)</Text>
          )}
        </Box>
      </Box>

      {/* Status */}
      <Box marginTop={2}>
        {isSaving ? (
          <Text color="cyan">Saving...</Text>
        ) : hasChanges ? (
          <Text color="yellow">Unsaved changes</Text>
        ) : (
          <Text dimColor>No changes</Text>
        )}
      </Box>

      <KeyHints
        hints={[
          { key: 'Tab/↓', label: 'next field' },
          { key: 'Shift+Tab/↑', label: 'prev field' },
          { key: 'Enter', label: 'save' },
          { key: 'Esc', label: 'cancel' },
        ]}
      />
    </Box>
  )
}
