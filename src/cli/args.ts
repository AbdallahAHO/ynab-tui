import { Command } from 'commander'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const getVersion = (): string => {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url))
    const pkgPath = join(__dirname, '..', '..', 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    return pkg.version
  } catch {
    return '0.0.0'
  }
}

export type OutputFormat = 'json' | 'text'

export interface GlobalOptions {
  format: OutputFormat
  quiet: boolean
  config?: string
}

export interface ListOptions extends GlobalOptions {
  uncategorized: boolean
  account?: string
  since?: string
  limit: number
}

export interface CategorizeOptions extends GlobalOptions {
  threshold: number
  applyMemos: boolean
  dryRun: boolean
  since?: string
  account?: string
}

export interface MemoOptions extends GlobalOptions {
  ids?: string
  allMissing: boolean
  forceReplace: boolean
}

export interface PayeesOptions extends GlobalOptions {
  list: boolean
  setCategory?: string
  noCategory: boolean
}

export interface ReportOptions extends GlobalOptions {
  month?: string
  account?: string
  compare: number
}

export type CommandAction =
  | { command: 'list'; options: ListOptions }
  | { command: 'categorize'; options: CategorizeOptions }
  | { command: 'memo'; options: MemoOptions }
  | { command: 'payees'; options: PayeesOptions }
  | { command: 'report'; options: ReportOptions }
  | { command: 'tui'; forceSetup: boolean }

/**
 * Parse CLI arguments and return the command to execute
 * Returns null if --help or --version was displayed
 */
export const parseArgs = (argv: string[]): CommandAction | null => {
  let result: CommandAction | null = null

  const program = new Command()
    .name('ynab-tui')
    .description('AI-powered YNAB transaction categorization')
    .version(getVersion())
    .action(() => {
      // Default action when no subcommand is provided - run TUI
      const forceSetup = argv.includes('--setup')
      result = { command: 'tui', forceSetup }
    })

  // Global options available to all subcommands
  const addGlobalOptions = (cmd: Command) => {
    return cmd
      .option('-f, --format <format>', 'Output format: json or text', 'json')
      .option('-q, --quiet', 'Suppress progress messages', false)
      .option('--config <path>', 'Path to config file')
  }

  // List command
  addGlobalOptions(
    program
      .command('list')
      .description('List transactions')
      .option('-u, --uncategorized', 'Only show uncategorized transactions', false)
      .option('-a, --account <name>', 'Filter by account name')
      .option('-s, --since <date>', 'Only transactions after this date (YYYY-MM-DD)')
      .option('-l, --limit <number>', 'Maximum number of transactions', '50')
  ).action((options) => {
    result = {
      command: 'list',
      options: {
        ...options,
        limit: parseInt(options.limit, 10),
      },
    }
  })

  // Categorize command
  addGlobalOptions(
    program
      .command('categorize')
      .description('Auto-categorize uncategorized transactions')
      .option('-t, --threshold <number>', 'Minimum confidence threshold (0-1)', '0.8')
      .option('-m, --apply-memos', 'Also apply AI-suggested memos', false)
      .option('-n, --dry-run', 'Show what would happen without saving', false)
      .option('-s, --since <date>', 'Only transactions after this date (YYYY-MM-DD)')
      .option('-a, --account <name>', 'Filter by account name')
  ).action((options) => {
    result = {
      command: 'categorize',
      options: {
        ...options,
        threshold: parseFloat(options.threshold),
      },
    }
  })

  // Memo command
  addGlobalOptions(
    program
      .command('memo')
      .description('Generate memos for transactions')
      .option('-i, --ids <ids>', 'Comma-separated transaction IDs')
      .option('--all-missing', 'Generate for all transactions without memos', false)
      .option('--force-replace', 'Replace existing memos', false)
  ).action((options) => {
    result = { command: 'memo', options }
  })

  // Payees command
  addGlobalOptions(
    program
      .command('payees')
      .description('Manage payee rules')
      .option('-l, --list', 'List all payee rules', false)
      .option('--set-category <mapping>', 'Set default category (format: "Payee Name:Category Name")')
      .option('--no-category', 'Only show payees without default category', false)
  ).action((options) => {
    result = { command: 'payees', options }
  })

  // Report command
  addGlobalOptions(
    program
      .command('report')
      .description('Generate monthly spending report')
      .option('-m, --month <month>', 'Target month in YYYY-MM format (default: current month)')
      .option('-a, --account <name>', 'Filter by account name (case-insensitive)')
      .option('-c, --compare <months>', 'Number of previous months to compare', '0')
  ).action((options) => {
    result = {
      command: 'report',
      options: {
        ...options,
        compare: parseInt(options.compare, 10),
      },
    }
  })

  // Parse with exitOverride to prevent process.exit
  program.exitOverride()

  try {
    program.parse(argv)
  } catch (err: unknown) {
    // Commander throws on --help and --version, which is expected
    if (err && typeof err === 'object' && 'code' in err) {
      const code = (err as { code: string }).code
      if (code === 'commander.helpDisplayed' || code === 'commander.version') {
        return null
      }
    }
    throw err
  }

  return result
}
