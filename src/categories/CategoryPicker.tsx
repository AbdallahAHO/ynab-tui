import React, { useState, useMemo, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import { useAtomValue } from 'jotai'
import { categoryGroupsAtom } from '../transactions/transaction-atoms.js'
import { flattenCategories, type CategoryGroupWithCategories } from '../shared/ynab-client.js'
import { useListNavigation } from '../shared/hooks/index.js'

interface CategoryPickerProps {
  currentCategoryId: string | null
  onSelect: (categoryId: string, categoryName: string) => void
  onCancel: () => void
  /** Optional categories override (if not provided, reads from atom) */
  categoryGroups?: CategoryGroupWithCategories[]
}

const VIEWPORT_SIZE = 12

export const CategoryPicker = ({
  currentCategoryId,
  onSelect,
  onCancel,
  categoryGroups: categoryGroupsProp,
}: CategoryPickerProps) => {
  const categoryGroupsFromAtom = useAtomValue(categoryGroupsAtom)
  const categoryGroups = categoryGroupsProp ?? categoryGroupsFromAtom
  const categories = useMemo(() => flattenCategories(categoryGroups), [categoryGroups])

  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search) return categories
    const lower = search.toLowerCase()
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(lower) ||
        categoryGroups.find((g) => g.categories.some((cat) => cat.id === c.id))
          ?.name.toLowerCase().includes(lower)
    )
  }, [categories, categoryGroups, search])

  const {
    selectedIndex,
    setSelectedIndex,
    visibleRange,
    positionDisplay,
    isSelected,
    toActualIndex,
  } = useListNavigation({
    itemCount: filtered.length,
    viewportSize: VIEWPORT_SIZE,
    vimKeys: true,
  })

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [search, setSelectedIndex])

  useInput((input, key) => {
    if (key.escape) {
      onCancel()
      return
    }

    if (key.return) {
      const cat = filtered[selectedIndex]
      if (cat) {
        onSelect(cat.id, cat.name)
      }
      return
    }

    // Ctrl+n/p for navigation (in addition to hook's j/k)
    if (key.ctrl && input === 'n') {
      setSelectedIndex((i) => i + 1)
      return
    }
    if (key.ctrl && input === 'p') {
      setSelectedIndex((i) => i - 1)
      return
    }

    if (key.backspace || key.delete) {
      setSearch((s) => s.slice(0, -1))
      return
    }

    // Regular character input (but not navigation keys)
    if (input && input.length === 1 && !key.ctrl && !key.meta) {
      // Don't capture j/k/g/G as they're for navigation
      if (!['j', 'k', 'g', 'G'].includes(input)) {
        setSearch((s) => s + input)
      }
    }
  })

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
      <Box gap={2}>
        <Text bold>Select Category</Text>
        {filtered.length > 0 && <Text dimColor>{positionDisplay}</Text>}
      </Box>

      <Box marginY={1}>
        <Text dimColor>Search: </Text>
        <Text>{search || <Text dimColor>type to filter...</Text>}</Text>
      </Box>

      <Box flexDirection="column" height={VIEWPORT_SIZE} overflow="hidden">
        {filtered.slice(visibleRange.start, visibleRange.end).map((cat, viewportIndex) => {
          const actualIndex = toActualIndex(viewportIndex)
          const group = categoryGroups.find((g) =>
            g.categories.some((c) => c.id === cat.id)
          )
          const selected = isSelected(actualIndex)
          const isCurrent = cat.id === currentCategoryId

          return (
            <Box key={cat.id} gap={1}>
              <Text color={selected ? 'cyan' : undefined}>
                {selected ? '▶' : ' '}
              </Text>
              <Text bold={selected} color={isCurrent ? 'green' : undefined}>
                {cat.name}
              </Text>
              <Text dimColor>({group?.name})</Text>
            </Box>
          )
        })}
        {filtered.length === 0 && (
          <Text dimColor italic>
            No categories match "{search}"
          </Text>
        )}
      </Box>

      <Box marginTop={1} gap={2}>
        <Text dimColor>
          <Text color="cyan">j/k</Text> nav
        </Text>
        <Text dimColor>
          <Text color="cyan">G/gg</Text> end/start
        </Text>
        <Text dimColor>
          <Text color="cyan">Enter</Text> select
        </Text>
        <Text dimColor>
          <Text color="cyan">Esc</Text> cancel
        </Text>
      </Box>
    </Box>
  )
}
