import { useState, useEffect, useCallback } from 'react'
import { useInput } from 'ink'

interface UseListNavigationOptions {
  /** Total number of items in the list */
  itemCount: number
  /** Number of visible items in the viewport */
  viewportSize?: number
  /** Enable vim-style shortcuts (G, gg, Ctrl+d, Ctrl+u) */
  vimKeys?: boolean
  /** Called when selection changes */
  onSelect?: (index: number) => void
  /** Whether navigation is enabled */
  enabled?: boolean
}

interface UseListNavigationResult {
  /** Currently selected index */
  selectedIndex: number
  /** First visible item index for virtual scrolling */
  viewportStart: number
  /** Set selection programmatically */
  setSelectedIndex: (index: number | ((prev: number) => number)) => void
  /** Items to render (slice indices) */
  visibleRange: { start: number; end: number }
  /** Position display string like "12/45" */
  positionDisplay: string
  /** Whether an item at given index is selected */
  isSelected: (index: number) => boolean
  /** Convert viewport-relative index to actual index */
  toActualIndex: (viewportIndex: number) => number
}

/**
 * Reusable hook for list navigation with virtual scrolling and vim keys.
 *
 * @example
 * const { selectedIndex, visibleRange, isSelected } = useListNavigation({
 *   itemCount: items.length,
 *   viewportSize: 20,
 *   vimKeys: true,
 * })
 *
 * // Render only visible items
 * items.slice(visibleRange.start, visibleRange.end).map((item, i) => (
 *   <Item key={item.id} selected={isSelected(visibleRange.start + i)} />
 * ))
 */
export const useListNavigation = ({
  itemCount,
  viewportSize = 20,
  vimKeys = true,
  onSelect,
  enabled = true,
}: UseListNavigationOptions): UseListNavigationResult => {
  const [selectedIndex, setSelectedIndexState] = useState(0)
  const [viewportStart, setViewportStart] = useState(0)
  const [waitingForG, setWaitingForG] = useState(false)

  const effectiveViewportSize = Math.min(viewportSize, itemCount)
  const halfPage = Math.floor(effectiveViewportSize / 2)

  // Keep selection in bounds when item count changes
  useEffect(() => {
    if (selectedIndex >= itemCount && itemCount > 0) {
      setSelectedIndexState(Math.max(0, itemCount - 1))
    }
  }, [itemCount, selectedIndex])

  // Keep viewport following selection
  useEffect(() => {
    if (itemCount === 0) return // No items, no viewport adjustment needed
    if (selectedIndex < viewportStart) {
      setViewportStart(selectedIndex)
    } else if (selectedIndex >= viewportStart + effectiveViewportSize) {
      setViewportStart(Math.max(0, selectedIndex - effectiveViewportSize + 1))
    }
  }, [selectedIndex, viewportStart, effectiveViewportSize, itemCount])

  const setSelectedIndex = useCallback(
    (indexOrFn: number | ((prev: number) => number)) => {
      setSelectedIndexState((prev) => {
        const newIndex = typeof indexOrFn === 'function' ? indexOrFn(prev) : indexOrFn
        const bounded = Math.max(0, Math.min(newIndex, itemCount - 1))
        if (onSelect && bounded !== prev) {
          onSelect(bounded)
        }
        return bounded
      })
    },
    [itemCount, onSelect]
  )

  const jumpToStart = useCallback(() => {
    setSelectedIndex(0)
    setViewportStart(0)
  }, [setSelectedIndex])

  const jumpToEnd = useCallback(() => {
    const lastIndex = Math.max(0, itemCount - 1)
    setSelectedIndex(lastIndex)
    setViewportStart(Math.max(0, itemCount - effectiveViewportSize))
  }, [setSelectedIndex, itemCount, effectiveViewportSize])

  useInput(
    (input, key) => {
      if (!enabled) return

      // Handle gg command (two g presses)
      if (waitingForG) {
        setWaitingForG(false)
        if (input === 'g') {
          jumpToStart()
          return
        }
      }

      // Vim: G = go to end
      if (vimKeys && input === 'G') {
        jumpToEnd()
        return
      }

      // Vim: g = start gg sequence
      if (vimKeys && input === 'g') {
        setWaitingForG(true)
        return
      }

      // Basic navigation
      if (input === 'j' || key.downArrow) {
        setSelectedIndex((i) => i + 1)
        return
      }
      if (input === 'k' || key.upArrow) {
        setSelectedIndex((i) => i - 1)
        return
      }

      // Page navigation
      if (key.pageDown) {
        setSelectedIndex((i) => i + effectiveViewportSize)
        return
      }
      if (key.pageUp) {
        setSelectedIndex((i) => i - effectiveViewportSize)
        return
      }

      // Vim: Ctrl+d = half page down
      if (vimKeys && key.ctrl && input === 'd') {
        setSelectedIndex((i) => i + halfPage)
        return
      }
      // Vim: Ctrl+u = half page up
      if (vimKeys && key.ctrl && input === 'u') {
        setSelectedIndex((i) => i - halfPage)
        return
      }
    },
    { isActive: enabled }
  )

  const visibleRange = {
    start: viewportStart,
    end: Math.min(viewportStart + effectiveViewportSize, itemCount),
  }

  const positionDisplay = itemCount > 0 ? `${selectedIndex + 1}/${itemCount}` : '0/0'

  const isSelected = useCallback(
    (index: number) => index === selectedIndex,
    [selectedIndex]
  )

  const toActualIndex = useCallback(
    (viewportIndex: number) => viewportStart + viewportIndex,
    [viewportStart]
  )

  return {
    selectedIndex,
    viewportStart,
    setSelectedIndex,
    visibleRange,
    positionDisplay,
    isSelected,
    toActualIndex,
  }
}
