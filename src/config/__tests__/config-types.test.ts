import { describe, it, expect } from 'vitest'
import { appConfigSchema, userContextSchema, AI_MODELS } from '../config-types.js'

describe('userContextSchema', () => {
  it('validates location with country and city', () => {
    const result = userContextSchema.safeParse({
      location: { country: 'Germany', city: 'Berlin' },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.location?.country).toBe('Germany')
      expect(result.data.location?.city).toBe('Berlin')
    }
  })

  it('validates partner with name and context', () => {
    const result = userContextSchema.safeParse({
      partner: { name: 'Jane', context: 'Wife' },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.partner?.name).toBe('Jane')
    }
  })

  it('accepts empty object', () => {
    const result = userContextSchema.safeParse({})

    expect(result.success).toBe(true)
  })

  it('validates account contexts as string record', () => {
    const result = userContextSchema.safeParse({
      accountContexts: {
        'account-1': 'Personal checking',
        'account-2': 'Joint account with partner',
      },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.accountContexts?.['account-1']).toBe('Personal checking')
    }
  })

  it('validates language as string', () => {
    const result = userContextSchema.safeParse({
      language: 'German',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.language).toBe('German')
    }
  })

  it('validates transactionSources', () => {
    const result = userContextSchema.safeParse({
      transactionSources: 'Bank imports from N26 and PayPal',
    })

    expect(result.success).toBe(true)
  })

  it('validates customNotes', () => {
    const result = userContextSchema.safeParse({
      customNotes: 'I use YNAB for personal budgeting',
    })

    expect(result.success).toBe(true)
  })

  it('validates complete user context', () => {
    const result = userContextSchema.safeParse({
      location: { country: 'Germany', city: 'Munich' },
      language: 'German',
      partner: { name: 'Jane', context: 'Wife' },
      accountContexts: { 'acc-1': 'Personal' },
      transactionSources: 'N26',
      customNotes: 'Notes',
    })

    expect(result.success).toBe(true)
  })

  it('rejects invalid location (missing city)', () => {
    const result = userContextSchema.safeParse({
      location: { country: 'Germany' },
    })

    expect(result.success).toBe(false)
  })

  it('rejects invalid partner (missing context)', () => {
    const result = userContextSchema.safeParse({
      partner: { name: 'Jane' },
    })

    expect(result.success).toBe(false)
  })
})

describe('appConfigSchema', () => {
  const validConfig = {
    ynab: {
      accessToken: 'valid-token',
      defaultBudgetId: 'budget-123',
    },
    ai: {
      openRouterApiKey: 'openrouter-key',
    },
    display: {},
  }

  it('validates complete valid config', () => {
    const result = appConfigSchema.safeParse(validConfig)

    expect(result.success).toBe(true)
  })

  it('rejects missing ynab.accessToken', () => {
    const result = appConfigSchema.safeParse({
      ynab: {
        defaultBudgetId: 'budget-123',
      },
      ai: {
        openRouterApiKey: 'key',
      },
    })

    expect(result.success).toBe(false)
  })

  it('rejects empty ynab.accessToken', () => {
    const result = appConfigSchema.safeParse({
      ynab: {
        accessToken: '',
        defaultBudgetId: 'budget-123',
      },
      ai: {
        openRouterApiKey: 'key',
      },
    })

    expect(result.success).toBe(false)
  })

  it('rejects missing ai.openRouterApiKey', () => {
    const result = appConfigSchema.safeParse({
      ynab: {
        accessToken: 'token',
        defaultBudgetId: 'budget-123',
      },
      ai: {},
    })

    expect(result.success).toBe(false)
  })

  it('applies default for ai.model', () => {
    const result = appConfigSchema.safeParse(validConfig)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.ai.model).toBe('openai/gpt-4.1-nano')
    }
  })

  it('applies default for ai.confidenceThreshold', () => {
    const result = appConfigSchema.safeParse(validConfig)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.ai.confidenceThreshold).toBe(0.8)
    }
  })

  it('applies default for ai.yoloThreshold', () => {
    const result = appConfigSchema.safeParse(validConfig)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.ai.yoloThreshold).toBe(0.8)
    }
  })

  it('applies default for display.pageSize', () => {
    const result = appConfigSchema.safeParse(validConfig)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.display.pageSize).toBe(30)
    }
  })

  it('rejects confidenceThreshold out of range', () => {
    const result = appConfigSchema.safeParse({
      ...validConfig,
      ai: {
        ...validConfig.ai,
        confidenceThreshold: 1.5, // > 1
      },
    })

    expect(result.success).toBe(false)
  })

  it('rejects negative confidenceThreshold', () => {
    const result = appConfigSchema.safeParse({
      ...validConfig,
      ai: {
        ...validConfig.ai,
        confidenceThreshold: -0.5,
      },
    })

    expect(result.success).toBe(false)
  })

  it('rejects pageSize below minimum (10)', () => {
    const result = appConfigSchema.safeParse({
      ...validConfig,
      display: {
        pageSize: 5,
      },
    })

    expect(result.success).toBe(false)
  })

  it('rejects pageSize above maximum (100)', () => {
    const result = appConfigSchema.safeParse({
      ...validConfig,
      display: {
        pageSize: 150,
      },
    })

    expect(result.success).toBe(false)
  })

  it('accepts custom values within range', () => {
    const result = appConfigSchema.safeParse({
      ynab: {
        accessToken: 'token',
        defaultBudgetId: 'budget',
        defaultBudgetName: 'My Budget',
      },
      ai: {
        openRouterApiKey: 'key',
        model: 'anthropic/claude-haiku-4.5',
        confidenceThreshold: 0.9,
        yoloThreshold: 0.85,
        historicalTransactionCount: 300,
      },
      display: {
        pageSize: 50,
      },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.ai.model).toBe('anthropic/claude-haiku-4.5')
      expect(result.data.ai.confidenceThreshold).toBe(0.9)
    }
  })

  it('includes userContext when provided', () => {
    const result = appConfigSchema.safeParse({
      ...validConfig,
      userContext: {
        location: { country: 'Germany', city: 'Berlin' },
      },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.userContext?.location?.city).toBe('Berlin')
    }
  })
})

describe('AI_MODELS', () => {
  it('contains expected models', () => {
    const modelValues = AI_MODELS.map((m) => m.value)

    expect(modelValues).toContain('openai/gpt-4.1-nano')
    expect(modelValues).toContain('anthropic/claude-haiku-4.5')
  })

  it('each model has required fields', () => {
    for (const model of AI_MODELS) {
      expect(model.value).toBeDefined()
      expect(model.label).toBeDefined()
      expect(model.description).toBeDefined()
      expect(model.pricing).toBeDefined()
    }
  })

  it('default model is first in list', () => {
    expect(AI_MODELS[0].value).toBe('openai/gpt-4.1-nano')
  })
})
