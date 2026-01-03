import { z } from 'zod'

export const userContextSchema = z.object({
  location: z.object({ country: z.string(), city: z.string() }).optional(),
  language: z.string().optional(),
  partner: z.object({ name: z.string(), context: z.string() }).optional(),
  accountContexts: z.record(z.string(), z.string()).optional(),
  transactionSources: z.string().optional(),
  customNotes: z.string().optional(),
})

export type UserContext = z.infer<typeof userContextSchema>

export const appConfigSchema = z.object({
  ynab: z.object({
    accessToken: z.string().min(1),
    defaultBudgetId: z.string().min(1),
    defaultBudgetName: z.string().optional(),
  }),
  ai: z.object({
    openRouterApiKey: z.string().min(1),
    model: z.string().default('openai/gpt-4.1-nano'),
    confidenceThreshold: z.number().min(0).max(1).default(0.8),
    yoloThreshold: z.number().min(0).max(1).default(0.8),
    historicalTransactionCount: z.number().min(50).max(500).default(200),
  }),
  display: z.object({
    pageSize: z.number().min(10).max(100).default(30),
  }),
  userContext: userContextSchema.optional(),
})

export type AppConfig = z.infer<typeof appConfigSchema>

export const AI_MODELS = [
  {
    value: 'openai/gpt-4.1-nano',
    label: 'GPT-4.1 Nano',
    description: 'Fastest & cheapest. Best for high-volume categorization.',
    pricing: '$0.10/$0.40 per 1M',
  },
  {
    value: 'mistralai/mistral-small-3.2-24b-instruct',
    label: 'Mistral Small 3.2',
    description: 'Ultra cheap, good quality. Great budget option.',
    pricing: '$0.06/$0.18 per 1M',
  },
  {
    value: 'deepseek/deepseek-v3.2',
    label: 'DeepSeek V3.2',
    description: 'Dec 2025 release. Excellent value, strong reasoning.',
    pricing: '$0.25/$0.38 per 1M',
  },
  {
    value: 'google/gemini-3-flash-preview',
    label: 'Gemini 3 Flash',
    description: 'Dec 2025 newest. Configurable thinking depth.',
    pricing: '$0.50/$3.00 per 1M',
  },
  {
    value: 'anthropic/claude-haiku-4.5',
    label: 'Claude Haiku 4.5',
    description: 'Oct 2025. Premium quality, best accuracy.',
    pricing: '$1.00/$5.00 per 1M',
  },
] as const
