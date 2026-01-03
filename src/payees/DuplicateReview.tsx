import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { PayeeRule } from './payee-types.js'
import type { DuplicateGroup } from './duplicate-detection.js'
import { updatePayeeRule } from './payee-service.js'
import type { YnabClient } from '../shared/ynab-client.js'

interface DuplicateReviewProps {
  groups: DuplicateGroup[]
  ynabClient: YnabClient
  onFinish: () => void
}

export const DuplicateReview = ({
  groups,
  ynabClient,
  onFinish,
}: DuplicateReviewProps) => {
  const [groupIndex, setGroupIndex] = useState(0)
  const [selectedPrimary, setSelectedPrimary] = useState(0)
  const [saving, setSaving] = useState(false)
  const [mergedCount, setMergedCount] = useState(0)

  const currentGroup = groups[groupIndex]
  if (!currentGroup) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="green">No duplicates found!</Text>
        <Text dimColor>Press any key to go back...</Text>
      </Box>
    )
  }

  const allInGroup = [currentGroup.primary, ...currentGroup.duplicates]
  const selectedPayee = allInGroup[selectedPrimary]

  const handleMerge = async () => {
    if (!selectedPayee) return
    setSaving(true)

    const primary = selectedPayee
    const duplicates = allInGroup.filter((p) => p.payeeId !== primary.payeeId)

    // Mark duplicates and rename them in YNAB to match primary
    for (const dup of duplicates) {
      try {
        await ynabClient.updatePayee(dup.payeeId, primary.displayName)
        await updatePayeeRule(dup.payeeId, {
          duplicateOf: primary.payeeId,
          displayName: primary.displayName,
          syncedToYnab: true,
        })
      } catch {
        // Skip on error
      }
    }

    setMergedCount((c) => c + 1)
    setSaving(false)
    moveNext()
  }

  const handleSkip = () => {
    moveNext()
  }

  const moveNext = () => {
    if (groupIndex < groups.length - 1) {
      setGroupIndex((i) => i + 1)
      setSelectedPrimary(0)
    } else {
      onFinish()
    }
  }

  const movePrev = () => {
    if (groupIndex > 0) {
      setGroupIndex((i) => i - 1)
      setSelectedPrimary(0)
    }
  }

  useInput((input, key) => {
    if (saving) return

    if (key.escape) {
      onFinish()
      return
    }

    // Navigate within group
    if ((key.downArrow || input === 'j') && selectedPrimary < allInGroup.length - 1) {
      setSelectedPrimary((i) => i + 1)
      return
    }

    if ((key.upArrow || input === 'k') && selectedPrimary > 0) {
      setSelectedPrimary((i) => i - 1)
      return
    }

    // Navigate between groups
    if (key.leftArrow || input === 'h') {
      movePrev()
      return
    }

    if (key.rightArrow || input === 'l') {
      moveNext()
      return
    }

    // Merge with selected as primary
    if (input === 'm' || key.return) {
      handleMerge()
      return
    }

    // Skip group
    if (input === 's') {
      handleSkip()
      return
    }

    // Finish
    if (input === 'f') {
      onFinish()
      return
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          Duplicate Review [{groupIndex + 1}/{groups.length}]
        </Text>
        <Box gap={2}>
          {mergedCount > 0 && <Text color="green">{mergedCount} merged</Text>}
          {saving && <Text color="cyan">Merging...</Text>}
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          Similarity: <Text color="yellow">{Math.round(currentGroup.similarity * 100)}%</Text>
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Box marginBottom={1}>
          <Text dimColor>Select the primary payee (others will be renamed to match):</Text>
        </Box>

        {allInGroup.map((payee, idx) => {
          const isSelected = idx === selectedPrimary
          const isPrimary = idx === 0

          return (
            <Box key={payee.payeeId} gap={1}>
              <Text color={isSelected ? 'cyan' : undefined}>
                {isSelected ? '▶' : ' '}
              </Text>
              <Box width={30}>
                <Text bold={isSelected} color={isSelected ? 'green' : undefined}>
                  {payee.displayName.slice(0, 29)}
                </Text>
              </Box>
              <Box width={20}>
                <Text dimColor>
                  {payee.payeeName !== payee.displayName
                    ? `(${payee.payeeName.slice(0, 18)})`
                    : ''}
                </Text>
              </Box>
              <Text dimColor>
                {isPrimary ? '[most used]' : ''}
              </Text>
            </Box>
          )
        })}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          [j/k] select primary  [m/Enter] merge group  [s] skip  [←/→] nav groups
        </Text>
        <Text dimColor>
          [f] finish  [Esc] exit
        </Text>
      </Box>
    </Box>
  )
}
