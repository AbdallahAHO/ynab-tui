import React from 'react'
import { Box, Text } from 'ink'

interface SpendingSummaryProps {
  totalSpent: number
  totalIncome: number
  topCategory: { name: string; spent: number } | null
}

const formatMoney = (milliunits: number): string => {
  const dollars = Math.abs(milliunits) / 1000
  const formatted = dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return milliunits < 0 ? `-$${formatted}` : `$${formatted}`
}

const formatCompact = (milliunits: number): string => {
  const dollars = Math.abs(milliunits) / 1000
  if (dollars >= 1000) {
    return `${milliunits < 0 ? '-' : ''}$${(dollars / 1000).toFixed(1)}k`
  }
  return formatMoney(milliunits)
}

export const SpendingSummary = ({ totalSpent, totalIncome, topCategory }: SpendingSummaryProps) => {
  const netChange = totalIncome + totalSpent

  return (
    <Box paddingX={1} gap={3} borderStyle="single" borderColor="gray" borderTop={false} borderLeft={false} borderRight={false}>
      <Box gap={1}>
        <Text dimColor>Spent:</Text>
        <Text color="red" bold>{formatCompact(totalSpent)}</Text>
      </Box>

      <Box gap={1}>
        <Text dimColor>Income:</Text>
        <Text color="green" bold>{formatCompact(totalIncome)}</Text>
      </Box>

      <Box gap={1}>
        <Text dimColor>Net:</Text>
        <Text color={netChange >= 0 ? 'green' : 'red'} bold>
          {formatCompact(netChange)}
        </Text>
      </Box>

      {topCategory && (
        <Box gap={1}>
          <Text dimColor>Top:</Text>
          <Text color="yellow">{topCategory.name.slice(0, 12)}</Text>
          <Text dimColor>({formatCompact(topCategory.spent)})</Text>
        </Box>
      )}
    </Box>
  )
}
