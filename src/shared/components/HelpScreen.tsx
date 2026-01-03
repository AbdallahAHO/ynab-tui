import React from 'react'
import { Box, Text, useInput } from 'ink'

interface HelpScreenProps {
  onClose: () => void
}

export const HelpScreen = ({ onClose }: HelpScreenProps) => {
  useInput((input, key) => {
    if (key.escape || input === 'q' || input === '?') {
      onClose()
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="cyan">YNAB TUI - Keyboard Shortcuts</Text>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Transaction List</Text>
        <Box flexDirection="column" marginLeft={2}>
          <Text><Text color="cyan" bold>j/k</Text> or <Text color="cyan" bold>↑/↓</Text>   Navigate up/down</Text>
          <Text><Text color="cyan" bold>G</Text>           Jump to last item</Text>
          <Text><Text color="cyan" bold>gg</Text>          Jump to first item</Text>
          <Text><Text color="cyan" bold>Ctrl+d/u</Text>    Half-page down/up</Text>
          <Text><Text color="cyan" bold>PgDn/PgUp</Text>   Full page down/up</Text>
          <Text><Text color="cyan" bold>Space</Text>       Toggle selection</Text>
          <Text><Text color="cyan" bold>Enter</Text>       Edit transaction</Text>
          <Text><Text color="cyan" bold>c</Text>           AI categorize (selected or current)</Text>
          <Text><Text color="cyan" bold>Y</Text>           YOLO mode (auto-categorize all)</Text>
          <Text><Text color="cyan" bold>u</Text>           Toggle uncategorized filter</Text>
          <Text><Text color="cyan" bold>r</Text>           Refresh data</Text>
          <Text><Text color="cyan" bold>S</Text>           Open settings</Text>
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>YOLO Mode</Text>
        <Box flexDirection="column" marginLeft={2}>
          <Text dimColor>Auto-categorizes all uncategorized transactions</Text>
          <Text dimColor>above 80% confidence with short memos.</Text>
          <Text dimColor>Uncertain items go to manual review.</Text>
          <Text><Text color="cyan" bold>Esc</Text>         Cancel</Text>
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Categorization Review</Text>
        <Box flexDirection="column" marginLeft={2}>
          <Text><Text color="cyan" bold>a</Text>           Accept AI suggestion</Text>
          <Text><Text color="cyan" bold>1-9</Text>         Accept alternative (by number)</Text>
          <Text><Text color="cyan" bold>r</Text>           Reject suggestion</Text>
          <Text><Text color="cyan" bold>e</Text>           Edit (pick different category)</Text>
          <Text><Text color="cyan" bold>s</Text>           Skip this transaction</Text>
          <Text><Text color="cyan" bold>H</Text>           Accept all 90%+ confidence</Text>
          <Text><Text color="cyan" bold>←/→</Text>         Navigate between items</Text>
          <Text><Text color="cyan" bold>f</Text>           Finish and save</Text>
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Memo Step (after accept)</Text>
        <Box flexDirection="column" marginLeft={2}>
          <Text><Text color="cyan" bold>s</Text>           Use short memo</Text>
          <Text><Text color="cyan" bold>d</Text>           Use detailed memo</Text>
          <Text><Text color="cyan" bold>e</Text>           Edit memo text</Text>
          <Text><Text color="cyan" bold>n</Text>           No memo, skip</Text>
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Category Picker</Text>
        <Box flexDirection="column" marginLeft={2}>
          <Text><Text color="cyan" bold>j/k</Text>         Navigate up/down</Text>
          <Text><Text color="cyan" bold>G/gg</Text>        Jump to end/start</Text>
          <Text><Text color="cyan" bold>Enter</Text>       Select category</Text>
          <Text><Text color="cyan" bold>Esc</Text>         Cancel</Text>
          <Text dimColor>Type to filter categories</Text>
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Edit Transaction</Text>
        <Box flexDirection="column" marginLeft={2}>
          <Text><Text color="cyan" bold>Tab/↓</Text>       Next field</Text>
          <Text><Text color="cyan" bold>Shift+Tab/↑</Text> Previous field</Text>
          <Text><Text color="cyan" bold>Enter</Text>       Save changes</Text>
          <Text><Text color="cyan" bold>Esc</Text>         Cancel</Text>
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Settings</Text>
        <Box flexDirection="column" marginLeft={2}>
          <Text><Text color="cyan" bold>j/k</Text>         Navigate menu</Text>
          <Text><Text color="cyan" bold>Enter</Text>       Select option</Text>
          <Text><Text color="cyan" bold>Esc</Text>         Go back</Text>
          <Text dimColor>Run with --setup flag for full reconfigure</Text>
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Payee Manager</Text>
        <Box flexDirection="column" marginLeft={2}>
          <Text><Text color="cyan" bold>j/k</Text>         Navigate payees</Text>
          <Text><Text color="cyan" bold>Space</Text>       Toggle selection</Text>
          <Text><Text color="cyan" bold>Enter</Text>       Edit payee</Text>
          <Text><Text color="cyan" bold>c</Text>           Set default category</Text>
          <Text><Text color="cyan" bold>t</Text>           AI tag selected payees</Text>
          <Text><Text color="cyan" bold>T</Text>           AI tag all untagged</Text>
          <Text><Text color="cyan" bold>P</Text>           Sync payees from YNAB</Text>
          <Text><Text color="cyan" bold>/</Text>           Search payees</Text>
          <Text><Text color="cyan" bold>Esc</Text>         Clear selection / Go back</Text>
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Payee Review (after bulk tagging)</Text>
        <Box flexDirection="column" marginLeft={2}>
          <Text><Text color="cyan" bold>a</Text>           Accept and next</Text>
          <Text><Text color="cyan" bold>s</Text>           Skip without saving</Text>
          <Text><Text color="cyan" bold>n</Text>           Edit display name</Text>
          <Text><Text color="cyan" bold>t</Text>           Edit tags</Text>
          <Text><Text color="cyan" bold>c</Text>           Set category</Text>
          <Text><Text color="cyan" bold>y</Text>           Sync name to YNAB</Text>
          <Text><Text color="cyan" bold>←/→</Text>         Navigate items</Text>
          <Text><Text color="cyan" bold>f</Text>           Finish review</Text>
        </Box>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Global</Text>
        <Box flexDirection="column" marginLeft={2}>
          <Text><Text color="cyan" bold>?</Text>           Show this help</Text>
          <Text><Text color="cyan" bold>q</Text>           Quit</Text>
        </Box>
      </Box>

      <Box marginTop={2}>
        <Text dimColor>Press Esc or ? to close</Text>
      </Box>
    </Box>
  )
}
