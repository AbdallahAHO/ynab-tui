import React from 'react'
import { Box, Text } from 'ink'

interface KeyHint {
  key: string
  label: string
}

interface KeyHintsProps {
  hints: KeyHint[]
}

export const KeyHints = ({ hints }: KeyHintsProps) => (
  <Box marginTop={1} gap={2} flexWrap="wrap">
    {hints.map(({ key, label }) => (
      <Box key={key} gap={1}>
        <Text color="cyan" bold>
          {key}
        </Text>
        <Text dimColor>{label}</Text>
      </Box>
    ))}
  </Box>
)
