import { describe, it, expect } from 'vitest'
import { normalizePayeeName, createEmptyPayeeRule } from '../payee-types.js'

describe('normalizePayeeName', () => {
  it('converts to lowercase', () => {
    expect(normalizePayeeName('AMAZON')).toBe('amazon')
    expect(normalizePayeeName('Amazon')).toBe('amazon')
    expect(normalizePayeeName('AmaZoN')).toBe('amazon')
  })

  it('removes special characters', () => {
    expect(normalizePayeeName('Amazon.com')).toBe('amazoncom')
    expect(normalizePayeeName('Best-Buy')).toBe('bestbuy')
    expect(normalizePayeeName('7-Eleven')).toBe('7eleven')
    expect(normalizePayeeName('AT&T')).toBe('att')
  })

  it('removes spaces', () => {
    expect(normalizePayeeName('Best Buy')).toBe('bestbuy')
    expect(normalizePayeeName('Whole Foods')).toBe('wholefoods')
    expect(normalizePayeeName('  spaced  out  ')).toBe('spacedout')
  })

  it('handles empty string', () => {
    expect(normalizePayeeName('')).toBe('')
  })

  it('handles string with only special chars', () => {
    expect(normalizePayeeName('!@#$%^&*()')).toBe('')
    expect(normalizePayeeName('...')).toBe('')
    expect(normalizePayeeName('---')).toBe('')
  })

  it('handles unicode characters', () => {
    // Unicode letters are removed (only a-z0-9 kept)
    expect(normalizePayeeName('Café')).toBe('caf')
    expect(normalizePayeeName('Müller')).toBe('mller')
    expect(normalizePayeeName('日本')).toBe('')
  })

  it('handles emoji', () => {
    expect(normalizePayeeName('Store 🏪')).toBe('store')
    expect(normalizePayeeName('🍕 Pizza')).toBe('pizza')
  })

  it('handles numbers', () => {
    expect(normalizePayeeName('7-Eleven')).toBe('7eleven')
    expect(normalizePayeeName('24 Hour Fitness')).toBe('24hourfitness')
    expect(normalizePayeeName('123')).toBe('123')
  })

  it('handles mixed content', () => {
    expect(normalizePayeeName('AMAZON.COM*AMZN MKTP US')).toBe('amazoncomamznmktpus')
    expect(normalizePayeeName('SQ *COFFEE SHOP')).toBe('sqcoffeeshop')
    expect(normalizePayeeName('PAYPAL *SPOTIFY')).toBe('paypalspotify')
  })

  it('handles real-world payee names', () => {
    expect(normalizePayeeName('LIDL SAGT DANKE')).toBe('lidlsagtdanke')
    expect(normalizePayeeName('ALDI SUED SAGT DANKE')).toBe('aldisuedsagtdanke')
    expect(normalizePayeeName('REWE MARKT GMBH')).toBe('rewemarktgmbh')
  })
})

describe('createEmptyPayeeRule', () => {
  it('creates rule with provided payeeId and payeeName', () => {
    const rule = createEmptyPayeeRule('id-123', 'Amazon')

    expect(rule.payeeId).toBe('id-123')
    expect(rule.payeeName).toBe('Amazon')
  })

  it('sets displayName to payeeName by default', () => {
    const rule = createEmptyPayeeRule('id-123', 'Amazon')

    expect(rule.displayName).toBe('Amazon')
  })

  it('normalizes payee name correctly', () => {
    const rule = createEmptyPayeeRule('id-123', 'AMAZON.COM')

    expect(rule.normalizedName).toBe('amazoncom')
  })

  it('sets isNew to true', () => {
    const rule = createEmptyPayeeRule('id-123', 'Amazon')

    expect(rule.isNew).toBe(true)
  })

  it('sets syncedToYnab to false', () => {
    const rule = createEmptyPayeeRule('id-123', 'Amazon')

    expect(rule.syncedToYnab).toBe(false)
  })

  it('sets default null values', () => {
    const rule = createEmptyPayeeRule('id-123', 'Amazon')

    expect(rule.defaultCategoryId).toBeNull()
    expect(rule.defaultCategoryName).toBeNull()
  })

  it('sets empty arrays and strings', () => {
    const rule = createEmptyPayeeRule('id-123', 'Amazon')

    expect(rule.context).toBe('')
    expect(rule.aiTags).toEqual([])
  })

  it('sets transactionCount to 0', () => {
    const rule = createEmptyPayeeRule('id-123', 'Amazon')

    expect(rule.transactionCount).toBe(0)
  })

  it('sets lastSeen to today in ISO format', () => {
    const rule = createEmptyPayeeRule('id-123', 'Amazon')
    const today = new Date().toISOString().split('T')[0]

    expect(rule.lastSeen).toBe(today)
  })

  it('handles empty payee name', () => {
    const rule = createEmptyPayeeRule('id-123', '')

    expect(rule.payeeName).toBe('')
    expect(rule.displayName).toBe('')
    expect(rule.normalizedName).toBe('')
  })

  it('handles special characters in payee name', () => {
    const rule = createEmptyPayeeRule('id-123', 'AMAZON.COM*AMZN')

    expect(rule.payeeName).toBe('AMAZON.COM*AMZN')
    expect(rule.displayName).toBe('AMAZON.COM*AMZN')
    expect(rule.normalizedName).toBe('amazoncomamzn')
  })
})
