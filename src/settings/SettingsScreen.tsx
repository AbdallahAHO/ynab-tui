import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { useSetAtom } from 'jotai'
import { navigateAtom, goBackAtom } from '../navigation/navigation-atoms.js'
import { AI_MODELS, type AppConfig } from '../config/config-types.js'
import { updateConfig } from '../config/config-service.js'

interface SettingsScreenProps {
  config: AppConfig
  onReconfigure: () => void
}

type MenuItem = 'model' | 'thresholds' | 'context' | 'payees' | 'reconfigure'

const MENU_ITEMS: { key: MenuItem; label: string; hint: string }[] = [
  { key: 'model', label: 'Change AI Model', hint: 'Select a different AI model' },
  { key: 'thresholds', label: 'Adjust Thresholds', hint: 'Confidence thresholds for auto-accept' },
  { key: 'context', label: 'View/Edit Context', hint: 'Your location, partner, accounts' },
  { key: 'payees', label: 'Manage Payees', hint: 'Configure payee rules' },
  { key: 'reconfigure', label: 'Full Reconfigure', hint: 'Re-run setup wizard' },
]

export const SettingsScreen = ({ config, onReconfigure }: SettingsScreenProps) => {
  const navigate = useSetAtom(navigateAtom)
  const goBack = useSetAtom(goBackAtom)

  const [selectedIndex, setSelectedIndex] = useState(0)
  const [mode, setMode] = useState<'menu' | 'model' | 'thresholds' | 'context'>('menu')
  const [modelIndex, setModelIndex] = useState(
    AI_MODELS.findIndex((m) => m.value === config.ai.model)
  )
  const [yoloThreshold, setYoloThreshold] = useState(config.ai.yoloThreshold ?? 0.8)
  const [confidenceThreshold, setConfidenceThreshold] = useState(config.ai.confidenceThreshold ?? 0.8)

  useInput((input, key) => {
    if (key.escape) {
      if (mode !== 'menu') {
        setMode('menu')
      } else {
        goBack()
      }
      return
    }

    if (mode === 'menu') {
      if (input === 'j' || key.downArrow) {
        setSelectedIndex((i) => Math.min(i + 1, MENU_ITEMS.length - 1))
      } else if (input === 'k' || key.upArrow) {
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (key.return) {
        const item = MENU_ITEMS[selectedIndex]
        if (item.key === 'model') {
          setMode('model')
        } else if (item.key === 'thresholds') {
          setMode('thresholds')
        } else if (item.key === 'context') {
          setMode('context')
        } else if (item.key === 'payees') {
          navigate('payees')
        } else if (item.key === 'reconfigure') {
          onReconfigure()
        }
      }
    } else if (mode === 'model') {
      if (input === 'j' || key.downArrow) {
        setModelIndex((i) => Math.min(i + 1, AI_MODELS.length - 1))
      } else if (input === 'k' || key.upArrow) {
        setModelIndex((i) => Math.max(i - 1, 0))
      } else if (key.return) {
        const newModel = AI_MODELS[modelIndex].value
        updateConfig({ ai: { ...config.ai, model: newModel } })
        setMode('menu')
      }
    } else if (mode === 'thresholds') {
      if (input === 'j' || key.downArrow) {
        setYoloThreshold((t) => Math.max(0.5, t - 0.05))
      } else if (input === 'k' || key.upArrow) {
        setYoloThreshold((t) => Math.min(0.99, t + 0.05))
      } else if (input === 'h' || key.leftArrow) {
        setConfidenceThreshold((t) => Math.max(0.5, t - 0.05))
      } else if (input === 'l' || key.rightArrow) {
        setConfidenceThreshold((t) => Math.min(0.99, t + 0.05))
      } else if (key.return) {
        updateConfig({
          ai: {
            ...config.ai,
            yoloThreshold,
            confidenceThreshold,
          },
        })
        setMode('menu')
      }
    }
  })

  if (mode === 'model') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Select AI Model</Text>
        <Box marginTop={1} flexDirection="column">
          {AI_MODELS.map((m, i) => (
            <Box key={m.value} gap={1}>
              <Text color={i === modelIndex ? 'cyan' : undefined}>
                {i === modelIndex ? '▶' : ' '}
              </Text>
              <Text bold={i === modelIndex}>{m.label}</Text>
              <Text dimColor>({m.pricing})</Text>
              {m.value === config.ai.model && <Text color="green">✓ current</Text>}
            </Box>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>[j/k] navigate  [Enter] select  [Esc] cancel</Text>
        </Box>
      </Box>
    )
  }

  if (mode === 'thresholds') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">Adjust Thresholds</Text>
        <Box marginTop={1} flexDirection="column" gap={1}>
          <Box gap={2}>
            <Text>YOLO Auto-Accept:</Text>
            <Text bold color="cyan">{Math.round(yoloThreshold * 100)}%</Text>
            <Text dimColor>(j/k to adjust)</Text>
          </Box>
          <Box gap={2}>
            <Text>Review Auto-Accept:</Text>
            <Text bold color="cyan">{Math.round(confidenceThreshold * 100)}%</Text>
            <Text dimColor>(h/l to adjust)</Text>
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>[j/k] YOLO  [h/l] Review  [Enter] save  [Esc] cancel</Text>
        </Box>
      </Box>
    )
  }

  if (mode === 'context') {
    const ctx = config.userContext
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">User Context</Text>
        <Box marginTop={1} flexDirection="column">
          <Text>
            <Text dimColor>Location: </Text>
            {ctx?.location ? `${ctx.location.city}, ${ctx.location.country}` : 'Not set'}
          </Text>
          <Text>
            <Text dimColor>Language: </Text>
            {ctx?.language ?? 'Not set'}
          </Text>
          <Text>
            <Text dimColor>Partner: </Text>
            {ctx?.partner ? `${ctx.partner.name} (${ctx.partner.context})` : 'Not set'}
          </Text>
          <Text>
            <Text dimColor>Transaction Sources: </Text>
            {ctx?.transactionSources ?? 'Not set'}
          </Text>
          {ctx?.accountContexts && (
            <Box flexDirection="column" marginTop={1}>
              <Text dimColor>Account Contexts:</Text>
              {Object.entries(ctx.accountContexts).map(([id, context]) => (
                <Text key={id}>  {id.slice(0, 8)}... → {context}</Text>
              ))}
            </Box>
          )}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Run --setup to edit context. [Esc] back</Text>
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">Settings</Text>

      <Box marginTop={1} flexDirection="column">
        {MENU_ITEMS.map((item, i) => (
          <Box key={item.key} gap={1}>
            <Text color={i === selectedIndex ? 'cyan' : undefined}>
              {i === selectedIndex ? '▶' : ' '}
            </Text>
            <Text bold={i === selectedIndex}>{item.label}</Text>
            <Text dimColor>- {item.hint}</Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={2}>
        <Text dimColor>Current model: {config.ai.model}</Text>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>[j/k] navigate  [Enter] select  [Esc] back</Text>
      </Box>
    </Box>
  )
}
