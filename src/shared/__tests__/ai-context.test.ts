import { describe, it, expect } from 'vitest'
import { buildAIContext, formatContextForPrompt, getPayeeEnrichment } from '../ai-context.js'
import type { PayeeRule } from '../../payees/payee-types.js'

const createPayeeRule = (overrides: Partial<PayeeRule>): PayeeRule => ({
  payeeId: '1',
  payeeName: 'TEST PAYEE',
  normalizedName: 'testpayee',
  displayName: 'Test Payee',
  defaultCategoryId: null,
  defaultCategoryName: null,
  aiTags: [],
  context: '',
  isNew: false,
  transactionCount: 1,
  lastSeen: new Date().toISOString(),
  syncedToYnab: false,
  ...overrides,
})

describe('buildAIContext', () => {
  it('includes all payee fields in context', () => {
    const ctx = buildAIContext({
      payeeRules: [
        createPayeeRule({
          payeeName: 'LIDL BERLIN',
          normalizedName: 'lidlberlin',
          displayName: 'Lidl',
          aiTags: ['grocery', 'discount'],
          aiContext: 'German discount supermarket',
          context: 'Weekly shopping',
        }),
      ],
    })

    expect(ctx.payees.rules[0].aiContext).toBe('German discount supermarket')
    expect(ctx.payees.rules[0].context).toBe('Weekly shopping')
    expect(ctx.payees.rules[0].aiTags).toEqual(['grocery', 'discount'])
  })
})

describe('formatContextForPrompt', () => {
  it('includes aiContext in payee section', () => {
    const ctx = buildAIContext({
      payeeRules: [
        createPayeeRule({
          displayName: 'Lidl',
          aiTags: ['grocery'],
          aiContext: 'German discount supermarket',
          context: '',
        }),
      ],
    })

    const prompt = formatContextForPrompt(ctx, { includePayees: true })

    expect(prompt).toContain('German discount supermarket')
    expect(prompt).toContain('[grocery]')
    expect(prompt).toContain('Lidl')
  })

  it('includes both aiContext and user context when present', () => {
    const ctx = buildAIContext({
      payeeRules: [
        createPayeeRule({
          displayName: 'Lidl',
          aiTags: [],
          aiContext: 'Discount supermarket',
          context: 'Weekly groceries',
        }),
      ],
    })

    const prompt = formatContextForPrompt(ctx, { includePayees: true })

    expect(prompt).toContain('Discount supermarket')
    expect(prompt).toContain('Weekly groceries')
    // Both should be joined with semicolon
    expect(prompt).toContain('Discount supermarket; Weekly groceries')
  })

  it('includes payee with only aiContext (no tags)', () => {
    const ctx = buildAIContext({
      payeeRules: [
        createPayeeRule({
          displayName: 'Aldi',
          aiTags: [],
          aiContext: 'Budget supermarket chain',
          context: '',
        }),
      ],
    })

    const prompt = formatContextForPrompt(ctx, { includePayees: true })

    expect(prompt).toContain('Aldi')
    expect(prompt).toContain('Budget supermarket chain')
  })

  it('filters payees without any context or tags', () => {
    const ctx = buildAIContext({
      payeeRules: [
        createPayeeRule({
          displayName: 'Random Payee',
          aiTags: [],
          aiContext: undefined,
          context: '',
          isNew: true,
        }),
      ],
    })

    const prompt = formatContextForPrompt(ctx, { includePayees: true })

    expect(prompt).not.toContain('Random Payee')
  })

  it('limits payees to 30 to avoid prompt bloat', () => {
    const payeeRules = Array.from({ length: 50 }, (_, i) =>
      createPayeeRule({
        payeeId: `${i}`,
        payeeName: `PAYEE ${i}`,
        normalizedName: `payee${i}`,
        displayName: `Payee ${i}`,
        aiTags: ['tag'],
      })
    )

    const ctx = buildAIContext({ payeeRules })
    const prompt = formatContextForPrompt(ctx, { includePayees: true })

    // Count occurrences of "Payee" in prompt
    const matches = prompt.match(/Payee \d+/g) || []
    expect(matches.length).toBe(30)
  })
})

describe('getPayeeEnrichment', () => {
  it('returns aiContext along with tags and userContext', () => {
    const ctx = buildAIContext({
      payeeRules: [
        createPayeeRule({
          payeeName: 'LIDL BERLIN 123',
          normalizedName: 'lidlberlin123',
          displayName: 'Lidl',
          aiTags: ['grocery'],
          aiContext: 'German discount supermarket',
          context: 'Weekly shop',
        }),
      ],
    })

    const enrichment = getPayeeEnrichment('LIDL BERLIN 123', ctx)

    expect(enrichment).toEqual({
      tags: ['grocery'],
      userContext: 'Weekly shop',
      aiContext: 'German discount supermarket',
    })
  })

  it('returns null for unknown payee', () => {
    const ctx = buildAIContext({ payeeRules: [] })

    const enrichment = getPayeeEnrichment('UNKNOWN PAYEE', ctx)

    expect(enrichment).toBeNull()
  })

  it('normalizes payee name for lookup', () => {
    const ctx = buildAIContext({
      payeeRules: [
        createPayeeRule({
          payeeName: 'AMAZON.COM*AMZN',
          normalizedName: 'amazoncomamzn',
          displayName: 'Amazon',
          aiTags: ['shopping'],
          aiContext: 'Online marketplace',
        }),
      ],
    })

    // Should match with different formatting
    const enrichment = getPayeeEnrichment('AMAZON.COM*AMZN', ctx)

    expect(enrichment).not.toBeNull()
    expect(enrichment?.aiContext).toBe('Online marketplace')
  })
})
