import type { OutputFormat } from './args.js'

export interface OutputFormatter {
  /** Output successful result to stdout */
  success<T>(data: T): void
  /** Output error to stderr and exit with code 1 */
  error(message: string, details?: unknown): never
  /** Output progress message to stderr (skipped in quiet mode) */
  progress(message: string): void
  /** Output warning to stderr */
  warn(message: string): void
}

/**
 * Create an output formatter based on format and quiet settings
 */
export const createFormatter = (format: OutputFormat, quiet: boolean): OutputFormatter => {
  const progress = (message: string) => {
    if (!quiet) {
      process.stderr.write(`${message}\n`)
    }
  }

  const warn = (message: string) => {
    process.stderr.write(`Warning: ${message}\n`)
  }

  if (format === 'json') {
    return {
      success: <T>(data: T) => {
        console.log(JSON.stringify(data, null, 2))
      },
      error: (message: string, details?: unknown): never => {
        console.error(JSON.stringify({ success: false, error: message, details }, null, 2))
        process.exit(1)
      },
      progress,
      warn,
    }
  }

  // Text format
  return {
    success: <T>(data: T) => {
      // For text mode, we expect data to have a formatted string or we'll stringify it
      if (typeof data === 'string') {
        console.log(data)
      } else if (data && typeof data === 'object' && 'formatted' in data) {
        console.log((data as { formatted: string }).formatted)
      } else {
        console.log(JSON.stringify(data, null, 2))
      }
    },
    error: (message: string, details?: unknown): never => {
      console.error(`Error: ${message}`)
      if (details) {
        console.error(details)
      }
      process.exit(1)
    },
    progress,
    warn,
  }
}

/**
 * Format a number as currency
 */
export const formatAmount = (milliunits: number): string => {
  const amount = milliunits / 1000
  return amount < 0 ? `-$${Math.abs(amount).toFixed(2)}` : `$${amount.toFixed(2)}`
}

/**
 * Format a date string
 */
export const formatDate = (dateStr: string): string => {
  return dateStr // Already in YYYY-MM-DD format from YNAB
}

/**
 * Create a simple text table from data
 */
export const formatTable = (
  headers: string[],
  rows: string[][],
  columnWidths?: number[]
): string => {
  const widths = columnWidths || headers.map((h, i) => {
    const maxRowWidth = Math.max(...rows.map(r => (r[i] || '').length))
    return Math.max(h.length, maxRowWidth)
  })

  const formatRow = (cells: string[]) =>
    cells.map((cell, i) => (cell || '').padEnd(widths[i])).join('  ')

  const headerLine = formatRow(headers)
  const separator = widths.map(w => '-'.repeat(w)).join('  ')
  const dataLines = rows.map(formatRow)

  return [headerLine, separator, ...dataLines].join('\n')
}
