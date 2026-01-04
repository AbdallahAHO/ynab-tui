import type { PayeeRule } from '../payees/payee-types.js'
import type { TransactionDetail, Category, CategoryGroupWithCategories } from '../shared/ynab-client.js'

/**
 * Creates a mock PayeeRule with sensible defaults
 */
export const createMockPayeeRule = (overrides: Partial<PayeeRule> = {}): PayeeRule => ({
  payeeId: `payee-${Math.random().toString(36).slice(2, 8)}`,
  payeeName: 'TEST PAYEE',
  normalizedName: 'testpayee',
  displayName: 'Test Payee',
  defaultCategoryId: null,
  defaultCategoryName: null,
  aiTags: [],
  context: '',
  isNew: false,
  transactionCount: 1,
  lastSeen: new Date().toISOString().split('T')[0],
  syncedToYnab: false,
  ...overrides,
})

/**
 * Creates a mock TransactionDetail
 */
export const createMockTransaction = (
  overrides: Partial<TransactionDetail> = {}
): TransactionDetail => ({
  id: `tx-${Math.random().toString(36).slice(2, 8)}`,
  date: new Date().toISOString().split('T')[0],
  amount: -10000, // -$10.00 in milliunits
  memo: null,
  cleared: 'cleared',
  approved: true,
  flag_color: null,
  flag_name: null,
  account_id: 'account-1',
  account_name: 'Test Account',
  payee_id: 'payee-1',
  payee_name: 'Test Payee',
  category_id: null,
  category_name: null,
  transfer_account_id: null,
  transfer_transaction_id: null,
  matched_transaction_id: null,
  import_id: null,
  import_payee_name: null,
  import_payee_name_original: null,
  debt_transaction_type: null,
  deleted: false,
  subtransactions: [],
  ...overrides,
})

/**
 * Creates a mock Category
 */
export const createMockCategory = (overrides: Partial<Category> = {}): Category => ({
  id: `cat-${Math.random().toString(36).slice(2, 8)}`,
  category_group_id: 'group-1',
  category_group_name: 'Test Group',
  name: 'Test Category',
  hidden: false,
  deleted: false,
  original_category_group_id: null,
  note: null,
  budgeted: 0,
  activity: 0,
  balance: 0,
  goal_type: null,
  goal_day: null,
  goal_cadence: null,
  goal_cadence_frequency: null,
  goal_creation_month: null,
  goal_target: null,
  goal_target_month: null,
  goal_percentage_complete: null,
  goal_months_to_budget: null,
  goal_under_funded: null,
  goal_overall_funded: null,
  goal_overall_left: null,
  ...overrides,
})

/**
 * Creates a mock CategoryGroupWithCategories
 */
export const createMockCategoryGroup = (
  overrides: Partial<CategoryGroupWithCategories> = {}
): CategoryGroupWithCategories => ({
  id: `group-${Math.random().toString(36).slice(2, 8)}`,
  name: 'Test Group',
  hidden: false,
  deleted: false,
  categories: [],
  ...overrides,
})
