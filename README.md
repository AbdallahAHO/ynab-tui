# ynab-tui

[![npm version](https://img.shields.io/npm/v/ynab-tui.svg)](https://www.npmjs.com/package/ynab-tui)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A beautiful terminal interface for [YNAB](https://ynab.com) with AI-powered transaction categorization.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ynab-tui                                              My Budget        │
├─────────────────────────────────────────────────────────────────────────┤
│  Uncategorized Transactions [3/47]                    Filter: All       │
│─────────────────────────────────────────────────────────────────────────│
│  Date       Payee                    Amount      Account                │
│  ─────────────────────────────────────────────────────────────────────  │
│▶ Jan 03     Whole Foods             -$142.50    Checking                │
│  Jan 02     Netflix                  -$15.99    Credit Card             │
│  Jan 02     Transfer                +$500.00    Savings                 │
│                                                                         │
│  [j/k] nav  [Enter] categorize  [Space] select  [y] YOLO mode  [?] help │
└─────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
npx ynab-tui
```

The setup wizard will guide you through configuration on first run.

### Requirements

- **YNAB API Token** - Get from [YNAB Developer Settings](https://app.ynab.com/settings/developer)
- **OpenRouter API Key** - Sign up at [openrouter.ai](https://openrouter.ai) for AI features

## Features

### AI-Powered Categorization

- **Interactive Mode** - Review AI suggestions one-by-one with confidence scores
- **YOLO Mode** - Auto-apply high-confidence categories in bulk
- **Smart Memos** - AI suggests memos for transactions without notes
- **Historical Learning** - Uses your past categorization patterns

### Payee Management

- **Auto-Tagging** - AI generates tags for payees (grocery, subscription, etc.)
- **Display Name Cleanup** - Transform `WHOLEFDS MKT #1234` → `Whole Foods`
- **Duplicate Detection** - Find and merge similar payees
- **Default Categories** - Set rules to auto-categorize by payee
- **YNAB Sync** - Push improved names back to YNAB

### Smart Caching

- **30-Day Cache** - AI responses cached to save API costs
- **Pattern Matching** - Same payee = instant cached result
- **Zero Re-computation** - Re-categorizing is free after first run

### Terminal-Native

- **Vim Keybindings** - `j/k` navigation, familiar shortcuts
- **Multi-Select** - Batch operations with `Space` to toggle
- **Fast & Responsive** - Built with React Ink for smooth TUI

## CLI Automation

Run ynab-tui as a non-interactive CLI for cron jobs, scripts, and AI agent automation.

### Commands

| Command | Description |
|---------|-------------|
| `ynab-tui categorize` | Auto-categorize uncategorized transactions |
| `ynab-tui list` | List transactions (JSON or text output) |
| `ynab-tui memo` | Generate memos for transactions |
| `ynab-tui payees` | Manage payee rules |

### Environment Variables

Configure via environment variables for headless operation:

| Variable | Description |
|----------|-------------|
| `YNAB_TOKEN` | YNAB Personal Access Token |
| `YNAB_BUDGET_ID` | Budget ID to use |
| `OPENROUTER_KEY` | OpenRouter API key for AI features |
| `YNAB_MODEL` | AI model (optional, defaults to gpt-4.1-nano) |

Environment variables take priority over the config file.

### Examples

```bash
# Auto-categorize with 90% confidence threshold
YNAB_TOKEN=xxx OPENROUTER_KEY=yyy YNAB_BUDGET_ID=zzz \
  ynab-tui categorize --threshold=0.9

# List uncategorized transactions as JSON
ynab-tui list --uncategorized --format=json

# Dry run - see what would be categorized without saving
ynab-tui categorize --dry-run --format=text

# Generate memos for all transactions missing them
ynab-tui memo --all-missing

# Set a default category for a payee
ynab-tui payees --set-category="Whole Foods:Groceries"

# Cron job: daily auto-categorization
0 9 * * * ynab-tui categorize --threshold=0.85 --format=json >> ~/ynab.log 2>&1
```

### Output Formats

- `--format=json` (default) - Machine-readable JSON for scripts and agents
- `--format=text` - Human-readable tables and summaries

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (missing config, API failure) |
| 2 | Partial success (some items failed) |

## Setup

On first run, you'll be guided through:

1. **YNAB API Token** - Paste your token from YNAB settings
2. **Budget Selection** - Choose which budget to manage
3. **OpenRouter API Key** - For AI-powered features
4. **AI Model** - Pick from GPT-4.1 Nano to Claude Haiku
5. **User Context** (optional) - Location, language, and other context to improve AI accuracy

Configuration is stored at `~/.config/ynab-tui/`

## Keyboard Shortcuts

### Transaction List
| Key | Action |
|-----|--------|
| `j/k` or `↑/↓` | Navigate up/down |
| `Enter` | Categorize selected transaction |
| `Space` | Toggle selection for batch operations |
| `c` | Categorize all checked transactions |
| `y` | YOLO mode - auto-categorize high-confidence |
| `a` | Toggle: Show all / uncategorized only |
| `r` | Refresh from YNAB |
| `P` | Open Payee Manager |
| `S` | Open Settings |
| `?` | Show help |
| `q` | Quit |

### Categorization Review
| Key | Action |
|-----|--------|
| `Enter` | Accept AI suggestion |
| `1-3` | Choose alternative category |
| `c` | Open category picker |
| `s` | Skip this transaction |
| `m` | Edit memo |
| `Esc` | Exit review |

### Payee Manager
| Key | Action |
|-----|--------|
| `j/k` | Navigate payees |
| `Enter` | Edit payee details |
| `Space` | Toggle selection |
| `t` | AI tag selected payees |
| `T` | AI tag all untagged |
| `d` | Find duplicate payees |
| `R` | Review AI category suggestions |
| `c` | Set default category |
| `/` | Search payees |
| `Esc` | Go back |

## Categorization Modes

### Interactive Review

Press `Enter` on a transaction to review the AI suggestion:

```
┌─────────────────────────────────────────────────────────────────┐
│  Categorize Transaction                                         │
├─────────────────────────────────────────────────────────────────┤
│  Whole Foods Market          -$142.50                           │
│                                                                 │
│  AI Suggestion: Groceries (92% confidence)                      │
│  "Weekly grocery shopping at organic market"                    │
│                                                                 │
│  Alternatives:                                                  │
│    [1] Food & Dining (78%)                                      │
│    [2] Household (45%)                                          │
│                                                                 │
│  [Enter] Accept  [1-3] Alt  [c] Pick  [s] Skip  [Esc] Cancel   │
└─────────────────────────────────────────────────────────────────┘
```

### YOLO Mode

Press `y` to auto-categorize all transactions above your confidence threshold:

```
YOLO Mode: Categorizing 23 transactions...
████████████████████░░░░░░░░░░ 67% (15/23)

Applied: Groceries → 8 transactions
Applied: Entertainment → 4 transactions
Applied: Dining Out → 3 transactions
Skipped: 2 (low confidence)
```

## AI Models

| Model | Speed | Cost | Best For |
|-------|-------|------|----------|
| GPT-4.1 Nano | ⚡⚡⚡ | $ | High-volume, simple transactions |
| Mistral Small 3.2 | ⚡⚡⚡ | $ | Budget-conscious users |
| DeepSeek V3.2 | ⚡⚡ | $$ | Best value, strong reasoning |
| Gemini 3 Flash | ⚡⚡ | $$ | Newest, configurable depth |
| Claude Haiku 4.5 | ⚡ | $$$ | Premium accuracy |

## User Context

Improve AI accuracy by providing context during setup:

- **Location** - Country/city helps identify local merchants
- **Language** - For transactions in non-English
- **Partner Info** - For shared expenses ("Split groceries 50/50 with Sarah")
- **Account Context** - Describe each account's purpose

## Data Storage

All data is stored locally:

| File | Purpose |
|------|---------|
| `~/.config/ynab-tui/config.json` | App configuration |
| `~/.config/ynab-tui/payees.json` | Payee rules & tags |
| `~/.config/ynab-tui/ai-cache.json` | Cached AI responses (30-day TTL) |

## Global Installation

```bash
npm install -g ynab-tui
ynab-tui
```

## Development

```bash
git clone https://github.com/AbdallahAHO/ynab-tui.git
cd ynab-tui
npm install
npm run dev
```

## Tech Stack

- [React](https://react.dev) + [Ink](https://github.com/vadimdemedes/ink) - Terminal UI
- [Jotai](https://jotai.org) - State management
- [Vercel AI SDK](https://sdk.vercel.ai) + [OpenRouter](https://openrouter.ai) - AI integration
- [YNAB API](https://api.ynab.com) - Budget data

## License

MIT - See [LICENSE](LICENSE) for details.

---

Built by [Abdallah Othman](https://abdallahaho.com) (@AbdallahAHO)
