import React from 'react'
import { Box, Text } from 'ink'
import type { TransactionDetail } from '../shared/ynab-client.js'
import { formatAmount, getFlagEmoji } from '../shared/ynab-client.js'

interface TransactionRowProps {
  transaction: TransactionDetail
  categoryName: string | null
  accountName: string
  isSelected: boolean
  isChecked: boolean
}

export const TransactionRow = ({
  transaction,
  categoryName,
  accountName,
  isSelected,
  isChecked,
}: TransactionRowProps) => {
  const flag = getFlagEmoji(transaction.flag_color)
  const amount = formatAmount(transaction.amount)
  const isExpense = transaction.amount < 0

  return (
    <Box gap={1}>
      {/* Selection indicator */}
      <Text color={isSelected ? 'cyan' : undefined}>
        {isSelected ? '▶' : ' '}
      </Text>

      {/* Checkbox */}
      <Text color={isChecked ? 'green' : 'gray'}>
        {isChecked ? '☑' : '☐'}
      </Text>

      {/* Flag */}
      <Text>{flag || ' '}</Text>

      {/* Date */}
      <Box width={10}>
        <Text dimColor>{transaction.date}</Text>
      </Box>

      {/* Payee */}
      <Box width={25}>
        <Text bold={isSelected}>
          {(transaction.payee_name || 'Unknown').slice(0, 24)}
        </Text>
      </Box>

      {/* Category */}
      <Box width={20}>
        {categoryName ? (
          <Text color="green">{categoryName.slice(0, 19)}</Text>
        ) : (
          <Text color="yellow" italic>
            Uncategorized
          </Text>
        )}
      </Box>

      {/* Account */}
      <Box width={15}>
        <Text dimColor>{accountName.slice(0, 14)}</Text>
      </Box>

      {/* Amount */}
      <Box width={12} justifyContent="flex-end">
        <Text color={isExpense ? 'red' : 'green'}>{amount}</Text>
      </Box>
    </Box>
  )
}
