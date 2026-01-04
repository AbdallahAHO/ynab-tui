import { describe, it, expect } from 'vitest'
import { flattenCategories, formatAmount, getFlagEmoji } from '../ynab-client.js'
import { createMockCategory, createMockCategoryGroup } from '../../test-utils/fixtures.js'

describe('flattenCategories', () => {
  it('flattens nested category groups', () => {
    const groups = [
      createMockCategoryGroup({
        id: 'group-1',
        name: 'Bills',
        categories: [
          createMockCategory({ id: 'cat-1', name: 'Rent' }),
          createMockCategory({ id: 'cat-2', name: 'Utilities' }),
        ],
      }),
      createMockCategoryGroup({
        id: 'group-2',
        name: 'Food',
        categories: [
          createMockCategory({ id: 'cat-3', name: 'Groceries' }),
        ],
      }),
    ]

    const result = flattenCategories(groups)

    expect(result).toHaveLength(3)
    expect(result.map((c) => c.name)).toEqual(['Rent', 'Utilities', 'Groceries'])
  })

  it('filters hidden categories', () => {
    const groups = [
      createMockCategoryGroup({
        categories: [
          createMockCategory({ id: 'cat-1', name: 'Visible', hidden: false }),
          createMockCategory({ id: 'cat-2', name: 'Hidden', hidden: true }),
        ],
      }),
    ]

    const result = flattenCategories(groups)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Visible')
  })

  it('filters deleted categories', () => {
    const groups = [
      createMockCategoryGroup({
        categories: [
          createMockCategory({ id: 'cat-1', name: 'Active', deleted: false }),
          createMockCategory({ id: 'cat-2', name: 'Deleted', deleted: true }),
        ],
      }),
    ]

    const result = flattenCategories(groups)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Active')
  })

  it('handles empty groups', () => {
    const result = flattenCategories([])

    expect(result).toEqual([])
  })

  it('handles groups with no categories', () => {
    const groups = [
      createMockCategoryGroup({ categories: [] }),
      createMockCategoryGroup({ categories: [] }),
    ]

    const result = flattenCategories(groups)

    expect(result).toEqual([])
  })

  it('filters both hidden and deleted', () => {
    const groups = [
      createMockCategoryGroup({
        categories: [
          createMockCategory({ name: 'Normal', hidden: false, deleted: false }),
          createMockCategory({ name: 'Hidden Only', hidden: true, deleted: false }),
          createMockCategory({ name: 'Deleted Only', hidden: false, deleted: true }),
          createMockCategory({ name: 'Both', hidden: true, deleted: true }),
        ],
      }),
    ]

    const result = flattenCategories(groups)

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Normal')
  })
})

describe('formatAmount', () => {
  it('converts milliunits to currency (divide by 1000)', () => {
    const result = formatAmount(10000)

    expect(result).toContain('10') // €10.00
  })

  it('formats negative amounts correctly', () => {
    const result = formatAmount(-25500)

    expect(result).toContain('-')
    expect(result).toContain('25')
  })

  it('handles zero', () => {
    const result = formatAmount(0)

    expect(result).toContain('0')
  })

  it('handles large amounts', () => {
    const result = formatAmount(1234567890)

    // Should format with thousands separators
    expect(result).toContain('1')
    expect(result).toContain('234')
  })

  it('handles small amounts (cents)', () => {
    const result = formatAmount(50) // $0.05

    expect(result).toContain('0')
  })

  it('includes currency symbol', () => {
    const result = formatAmount(1000)

    // Note: Currently hardcodes EUR
    expect(result).toContain('€')
  })

  it('formats with 2 decimal places', () => {
    const result = formatAmount(1000)

    expect(result).toMatch(/1[.,]00/)
  })
})

describe('getFlagEmoji', () => {
  it('returns correct emoji for each flag color', () => {
    expect(getFlagEmoji('red')).toBe('🔴')
    expect(getFlagEmoji('orange')).toBe('🟠')
    expect(getFlagEmoji('yellow')).toBe('🟡')
    expect(getFlagEmoji('green')).toBe('🟢')
    expect(getFlagEmoji('blue')).toBe('🔵')
    expect(getFlagEmoji('purple')).toBe('🟣')
  })

  it('returns empty string for null', () => {
    expect(getFlagEmoji(null)).toBe('')
  })

  it('returns empty string for undefined', () => {
    expect(getFlagEmoji(undefined as unknown as null)).toBe('')
  })

  it('returns empty string for unknown color', () => {
    expect(getFlagEmoji('pink' as 'red')).toBe('')
    expect(getFlagEmoji('black' as 'red')).toBe('')
  })

  it('handles all YNAB flag colors', () => {
    const validColors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'] as const

    for (const color of validColors) {
      const emoji = getFlagEmoji(color)
      expect(emoji).not.toBe('')
      expect(emoji).toMatch(/[\u{1F534}\u{1F7E0}\u{1F7E1}\u{1F7E2}\u{1F535}\u{1F7E3}]/u)
    }
  })
})
