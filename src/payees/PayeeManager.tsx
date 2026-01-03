import React, { useEffect, useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { goBackAtom } from '../navigation/navigation-atoms.js'
import {
  payeeRulesAtom,
  payeeSearchAtom,
  filteredPayeesAtom,
  newPayeeCountAtom,
  payeeSyncStatusAtom,
  checkedPayeeIdsAtom,
  checkedPayeeCountAtom,
  untaggedPayeesAtom,
} from './payee-atoms.js'
import { syncPayeesWithYnab, getAllPayeeRules, setPayeeCategory, bulkTagPayeesWithAI } from './payee-service.js'
import { PayeeEditor } from './PayeeEditor.js'
import { PayeeReview } from './PayeeReview.js'
import { CategoryPicker } from '../categories/CategoryPicker.js'
import { useListNavigation } from '../shared/hooks/useListNavigation.js'
import type { YnabClient, Category, CategoryGroupWithCategories } from '../shared/ynab-client.js'
import type { AppConfig } from '../config/config-types.js'
import type { PayeeRule } from './payee-types.js'

interface PayeeManagerProps {
  ynabClient: YnabClient
  config: AppConfig
}

export const PayeeManager = ({ ynabClient, config }: PayeeManagerProps) => {
  const goBack = useSetAtom(goBackAtom)

  const [rules, setRules] = useAtom(payeeRulesAtom)
  const [search, setSearch] = useAtom(payeeSearchAtom)
  const filteredPayees = useAtomValue(filteredPayeesAtom)
  const newCount = useAtomValue(newPayeeCountAtom)
  const [syncStatus, setSyncStatus] = useAtom(payeeSyncStatusAtom)
  const [checkedIds, setCheckedIds] = useAtom(checkedPayeeIdsAtom)
  const checkedCount = useAtomValue(checkedPayeeCountAtom)
  const untaggedPayees = useAtomValue(untaggedPayeesAtom)

  const [mode, setMode] = useState<'list' | 'edit' | 'category' | 'tagging' | 'review'>('list')
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryGroups, setCategoryGroups] = useState<CategoryGroupWithCategories[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [taggingProgress, setTaggingProgress] = useState({ current: 0, total: 0 })
  const [payeesToReview, setPayeesToReview] = useState<PayeeRule[]>([])
  const [reviewIndex, setReviewIndex] = useState(0)

  // Load data on mount
  useEffect(() => {
    const load = async () => {
      const [loadedRules, cats] = await Promise.all([
        getAllPayeeRules(),
        ynabClient.getCategories(),
      ])
      setRules(loadedRules)
      setCategoryGroups(cats)

      const flatCats = cats.flatMap((g) =>
        g.categories.filter((c) => !c.hidden && !c.deleted)
      )
      setCategories(flatCats)
    }
    load()
  }, [])

  const {
    selectedIndex,
    visibleRange,
    isSelected,
    toActualIndex,
  } = useListNavigation({
    itemCount: filteredPayees.length,
    viewportSize: 15,
    enabled: mode === 'list' && !isSearching,
  })

  const visiblePayees = filteredPayees.slice(visibleRange.start, visibleRange.end)
  const selectedPayee: PayeeRule | null = filteredPayees[selectedIndex] ?? null

  const handleSync = async () => {
    setSyncStatus('syncing')
    try {
      const ynabPayees = await ynabClient.getPayees()
      const result = await syncPayeesWithYnab(ynabPayees)
      const updatedRules = await getAllPayeeRules()
      setRules(updatedRules)
      setSyncStatus('done')
      setTimeout(() => setSyncStatus('idle'), 2000)
    } catch {
      setSyncStatus('idle')
    }
  }

  const handleCategorySelect = async (categoryId: string, categoryName: string) => {
    if (selectedPayee) {
      await setPayeeCategory(selectedPayee.payeeId, categoryId, categoryName)
      const updatedRules = await getAllPayeeRules()
      setRules(updatedRules)
    }
    setMode('list')
  }

  const toggleSelection = (payeeId: string) => {
    setCheckedIds((ids: Set<string>) => {
      const next = new Set(ids)
      if (next.has(payeeId)) {
        next.delete(payeeId)
      } else {
        next.add(payeeId)
      }
      return next
    })
  }

  const handleBulkTag = async (payees: PayeeRule[]) => {
    if (payees.length === 0) return

    setMode('tagging')
    setTaggingProgress({ current: 0, total: payees.length })

    await bulkTagPayeesWithAI(
      { openRouterApiKey: config.ai.openRouterApiKey, model: config.ai.model },
      payees,
      categories,
      (current) => setTaggingProgress((p) => ({ ...p, current }))
    )

    const updatedRules = await getAllPayeeRules()
    setRules(updatedRules)

    // Get the tagged payees for review
    const taggedPayees = updatedRules.filter((r) =>
      payees.some((p) => p.payeeId === r.payeeId)
    )
    setPayeesToReview(taggedPayees)
    setReviewIndex(0)
    setCheckedIds(new Set<string>())
    setMode('review')
  }

  useInput((input, key) => {
    if (mode === 'category') return
    if (mode === 'edit') return
    if (mode === 'tagging') return
    if (mode === 'review') return

    if (key.escape) {
      if (isSearching) {
        setIsSearching(false)
        setSearch('')
      } else if (checkedCount > 0) {
        setCheckedIds(new Set<string>())
      } else {
        goBack()
      }
      return
    }

    if (isSearching) {
      if (key.return) {
        setIsSearching(false)
      } else if (key.backspace || key.delete) {
        setSearch((s) => s.slice(0, -1))
      } else if (input && !key.ctrl && !key.meta) {
        setSearch((s) => s + input)
      }
      return
    }

    if (input === '/') {
      setIsSearching(true)
      return
    }

    if (input === 'p' || input === 'P') {
      handleSync()
      return
    }

    if (key.return && selectedPayee) {
      setMode('edit')
      return
    }

    if (input === 'c' && selectedPayee) {
      setMode('category')
      return
    }

    // Space to toggle selection
    if (input === ' ' && selectedPayee) {
      toggleSelection(selectedPayee.payeeId)
      return
    }

    // 't' to tag selected payees
    if (input === 't' && checkedCount > 0) {
      const selectedPayees = rules.filter((r) => checkedIds.has(r.payeeId))
      handleBulkTag(selectedPayees)
      return
    }

    // 'T' to tag all untagged payees
    if (input === 'T' && untaggedPayees.length > 0) {
      handleBulkTag(untaggedPayees)
      return
    }
  })

  if (mode === 'category') {
    return (
      <CategoryPicker
        currentCategoryId={selectedPayee?.defaultCategoryId ?? null}
        onSelect={handleCategorySelect}
        onCancel={() => setMode('list')}
        categoryGroups={categoryGroups}
      />
    )
  }

  if (mode === 'edit' && selectedPayee) {
    return (
      <PayeeEditor
        payee={selectedPayee}
        categories={categories}
        categoryGroups={categoryGroups}
        ynabClient={ynabClient}
        config={config}
        onClose={async () => {
          const updatedRules = await getAllPayeeRules()
          setRules(updatedRules)
          setMode('list')
        }}
      />
    )
  }

  if (mode === 'tagging') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">AI Tagging Payees...</Text>
        <Box marginTop={1}>
          <Text>
            Progress: {taggingProgress.current}/{taggingProgress.total}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Please wait while AI generates tags for your payees...</Text>
        </Box>
      </Box>
    )
  }

  if (mode === 'review' && payeesToReview.length > 0) {
    const currentPayee = payeesToReview[reviewIndex]
    return (
      <PayeeReview
        payee={currentPayee}
        index={reviewIndex}
        total={payeesToReview.length}
        categories={categories}
        categoryGroups={categoryGroups}
        ynabClient={ynabClient}
        config={config}
        onNext={async () => {
          if (reviewIndex < payeesToReview.length - 1) {
            setReviewIndex((i) => i + 1)
          } else {
            const updatedRules = await getAllPayeeRules()
            setRules(updatedRules)
            setMode('list')
          }
        }}
        onPrev={() => {
          if (reviewIndex > 0) {
            setReviewIndex((i) => i - 1)
          }
        }}
        onFinish={async () => {
          const updatedRules = await getAllPayeeRules()
          setRules(updatedRules)
          setMode('list')
        }}
      />
    )
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          Payee Manager [{selectedIndex + 1}/{filteredPayees.length}]
        </Text>
        <Box gap={2}>
          {checkedCount > 0 && <Text color="magenta">{checkedCount} selected</Text>}
          {untaggedPayees.length > 0 && <Text color="yellow">{untaggedPayees.length} untagged</Text>}
          {newCount > 0 && <Text color="yellow">{newCount} new</Text>}
          {syncStatus === 'syncing' && <Text color="cyan">Syncing...</Text>}
          {syncStatus === 'done' && <Text color="green">Synced!</Text>}
        </Box>
      </Box>

      {isSearching && (
        <Box marginTop={1}>
          <Text>Search: </Text>
          <Text color="cyan">{search}</Text>
          <Text color="cyan">_</Text>
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">
        <Box gap={2} marginBottom={1}>
          <Box width={25}><Text bold dimColor>Payee</Text></Box>
          <Box width={20}><Text bold dimColor>Category</Text></Box>
          <Box width={15}><Text bold dimColor>Tags</Text></Box>
          <Box width={10}><Text bold dimColor>Last Seen</Text></Box>
        </Box>

        {visiblePayees.map((payee, viewportIndex) => {
          const actualIndex = toActualIndex(viewportIndex)
          const selected = isSelected(actualIndex)
          const checked = checkedIds.has(payee.payeeId)

          return (
            <Box key={payee.payeeId} gap={1}>
              <Text color={checked ? 'magenta' : undefined}>
                {checked ? '✓' : ' '}
              </Text>
              <Text color={selected ? 'cyan' : undefined}>
                {selected ? '▶' : ' '}
              </Text>
              <Box width={23}>
                <Text bold={selected} color={payee.isNew ? 'yellow' : undefined}>
                  {payee.displayName.slice(0, 22)}
                </Text>
              </Box>
              <Box width={20}>
                <Text dimColor={!payee.defaultCategoryName}>
                  {payee.defaultCategoryName?.slice(0, 19) ?? '-'}
                </Text>
              </Box>
              <Box width={15}>
                <Text dimColor>
                  {payee.aiTags.slice(0, 2).join(',').slice(0, 14) || '-'}
                </Text>
              </Box>
              <Box width={10}>
                <Text dimColor>{payee.lastSeen.slice(5)}</Text>
              </Box>
            </Box>
          )
        })}

        {filteredPayees.length === 0 && (
          <Text dimColor>No payees found. Press P to sync with YNAB.</Text>
        )}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          [j/k] nav  [Space] select  [Enter] edit  [c] category  [P] sync  [/] search
        </Text>
        <Text dimColor>
          [t] tag selected  [T] tag all untagged  [Esc] {checkedCount > 0 ? 'clear' : 'back'}
        </Text>
      </Box>
    </Box>
  )
}
