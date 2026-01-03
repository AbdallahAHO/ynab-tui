import React from 'react'
import { Box, Text } from 'ink'

interface StatusBarProps {
  budgetName: string
  transactionCount: number
  uncategorizedCount: number
  selectedCount?: number
}

export const StatusBar = ({
  budgetName,
  transactionCount,
  uncategorizedCount,
  selectedCount = 0,
}: StatusBarProps) => (
  <Box
    borderStyle="single"
    borderColor="gray"
    paddingX={1}
    justifyContent="space-between"
  >
    <Text>
      <Text bold color="green">
        {budgetName}
      </Text>
    </Text>
    <Box gap={2}>
      {selectedCount > 0 && (
        <Text color="yellow">{selectedCount} selected</Text>
      )}
      <Text dimColor>
        {uncategorizedCount > 0 && (
          <Text color="yellow">{uncategorizedCount} uncategorized</Text>
        )}
        {uncategorizedCount > 0 && ' · '}
        {transactionCount} total
      </Text>
    </Box>
  </Box>
)
