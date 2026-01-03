# ynab-tui

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

## Features

### AI-Powered Categorization

- **Interactive Mode** - Review AI suggestions one-by-one with confidence scores
- **YOLO Mode** - Auto-apply high-confidence categories in bulk
- **Smart Memos** - AI suggests memos for transactions without notes
- **Historical Learning** - Uses your past categorization patterns

### Payee Management

- **Auto-Tagging** - AI generates tags for payees (grocery, subscription, etc.)
- **Display Name Cleanup** - Transform `WHOLEFDS MKT #1234` → `Whole Foods`
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

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/ynab-tui.git
cd ynab-tui

# Install dependencies
npm install

# Run the app
npm run dev
```

## Setup

On first run, you'll be guided through setup:

1. **YNAB API Token** - Get from [YNAB Developer Settings](https://app.ynab.com/settings/developer)
2. **Budget Selection** - Choose which budget to manage
3. **AI Model** - Pick from GPT-4.1 Nano to Claude Haiku
4. **User Context** - Optional info to improve AI accuracy (location, language, etc.)

Configuration is stored at `~/.config/ynab-tui/config.json`

## Usage

### Keyboard Shortcuts

#### Transaction List
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

#### Categorization Review
| Key | Action |
|-----|--------|
| `Enter` | Accept AI suggestion |
| `1-3` | Choose alternative category |
| `c` | Open category picker |
| `s` | Skip this transaction |
| `m` | Edit memo |
| `Esc` | Exit review |

#### Payee Manager
| Key | Action |
|-----|--------|
| `j/k` | Navigate payees |
| `Enter` | Edit payee details |
| `Space` | Toggle selection |
| `t` | AI tag selected payees |
| `T` | AI tag all untagged |
| `c` | Set default category |
| `/` | Search payees |
| `Esc` | Go back |

### Categorization Modes

#### Interactive Review
```bash
# Press Enter on a transaction, then review the AI suggestion:

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

#### YOLO Mode
Press `y` to auto-categorize all transactions with confidence above your threshold (default 80%):

```
YOLO Mode: Categorizing 23 transactions...
████████████████████░░░░░░░░░░ 67% (15/23)

Applied: Groceries → 8 transactions
Applied: Entertainment → 4 transactions
Applied: Dining Out → 3 transactions
Skipped: 2 (low confidence)
```

## Configuration

### AI Models

| Model | Speed | Cost | Best For |
|-------|-------|------|----------|
| GPT-4.1 Nano | ⚡⚡⚡ | $ | High-volume, simple transactions |
| Mistral Small 3.2 | ⚡⚡⚡ | $ | Budget-conscious users |
| DeepSeek V3.2 | ⚡⚡ | $$ | Best value, strong reasoning |
| Gemini 3 Flash | ⚡⚡ | $$ | Newest, configurable depth |
| Claude Haiku 4.5 | ⚡ | $$$ | Premium accuracy |

### Thresholds

- **Confidence Threshold** (0.8) - Minimum confidence to show as primary suggestion
- **YOLO Threshold** (0.8) - Minimum confidence for auto-apply in YOLO mode

### User Context

Improve AI accuracy by providing context:

```json
{
  "userContext": {
    "location": { "country": "Germany", "city": "Hamburg" },
    "language": "German, English",
    "partner": { "name": "Sarah", "context": "Split groceries 50/50" }
  }
}
```

## Data Storage

| File | Purpose |
|------|---------|
| `~/.config/ynab-tui/config.json` | App configuration |
| `~/.config/ynab-tui/payees.json` | Payee rules & tags |
| `~/.config/ynab-tui/ai-cache.json` | Cached AI responses (30-day TTL) |

## Development

```bash
# Development mode with hot reload
npm run dev

# Type checking
npm run typecheck

# Build for production
npm run build

# Run tests
npm test
```

### Project Structure

```
src/
├── app.tsx                 # Main app component & routing
├── cli.tsx                 # Entry point, setup flow
├── categorization/         # AI categorization engine
├── categories/             # Category picker UI
├── config/                 # Configuration & setup wizard
├── navigation/             # Screen navigation state
├── payees/                 # Payee management system
├── settings/               # Settings screen
├── shared/                 # Shared utilities & components
│   ├── ai-cache.ts         # AI response caching
│   ├── ynab-client.ts      # YNAB API wrapper
│   └── components/         # Reusable UI components
└── transactions/           # Transaction list & editing
```

## Tech Stack

- **[React](https://react.dev)** - UI components
- **[Ink](https://github.com/vadimdemedes/ink)** - React for terminal
- **[Jotai](https://jotai.org)** - Atomic state management
- **[Vercel AI SDK](https://sdk.vercel.ai)** - AI integration
- **[OpenRouter](https://openrouter.ai)** - Multi-model AI gateway
- **[YNAB API](https://api.ynab.com)** - Budget data
- **[Zod](https://zod.dev)** - Schema validation

## Requirements

- Node.js 18+
- YNAB account with API access
- OpenRouter API key

## License

MIT

---

<p align="center">
  Built with terminal love by developers who budget
</p>
