# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Run app with hot reload (tsx src/cli.tsx)
npm run build     # Production build (tsup)
npm run typecheck # Type checking only (tsc --noEmit)
npm test          # Run tests (vitest)
npm test -- --run # Run tests once without watch mode
```

Run with `--setup` flag to force reconfiguration: `npm run dev -- --setup`

## Architecture

**Terminal UI built with React Ink + Jotai for state management**

### Entry Flow
1. `cli.tsx` - Entry point, runs setup wizard if unconfigured, renders `<App>`
2. `app.tsx` - Main router, creates YNAB client, switches screens based on `currentScreenAtom`
3. Jotai Provider wraps all state - atoms are the single source of truth

### Navigation Pattern
Screen navigation uses `navigation/navigation-atoms.ts`:
- `currentScreenAtom` - Current screen name (`'transactions'`, `'review'`, `'yolo'`, etc.)
- `screenParamsAtom` - Screen-specific params (transactionId, transactionIds)
- `navigateAtom` / `goBackAtom` - Navigation actions

### Domain Structure
```
src/
├── categorization/   # AI categorization engine
│   ├── categorizer.ts          # createCategorizer() - AI client with caching
│   ├── history-analyzer.ts     # Learns from past categorizations
│   ├── CategorizationReview.tsx # Interactive review UI
│   └── YoloProgress.tsx        # Batch auto-categorization
├── payees/           # Payee management
│   ├── payee-service.ts        # AI-powered tagging & name cleanup
│   └── PayeeManager.tsx        # Payee list with tag/category management
├── transactions/     # Transaction list & editing
├── config/           # Setup wizard & config persistence
└── shared/           # Cross-cutting concerns
    ├── ynab-client.ts          # YNAB API wrapper with delta sync
    └── ai-cache.ts             # 30-day cache for AI responses
```

### AI Integration
- Uses Vercel AI SDK with OpenRouter as the provider
- `createCategorizer()` returns `{ categorize, categorizeBatch }` functions
- Cache key is generated from (payee name + expense/income + model) - memos skip cache
- Payee rules bypass AI entirely for instant categorization

### State Atoms Pattern
Each domain has its own atoms file (`transaction-atoms.ts`, `payee-atoms.ts`, etc.):
- Data atoms hold server state (transactions, categories, accounts)
- UI atoms hold local state (selectedIndex, checkedIds, isLoading)
- Derived atoms compute filtered/sorted views

### YNAB Client
`createYnabClient()` provides:
- Delta requests via `server_knowledge` tracking
- In-memory caching for categories, accounts, payees
- Batch `updateTransactions()` for single API call updates

## Config Storage
All user data stored in `~/.config/ynab-tui/`:
- `config.json` - API keys, model selection, user context
- `payees.json` - Payee rules with tags and default categories
- `ai-cache.json` - Cached AI responses (30-day TTL)

## Git Workflow (Gitflow)

This repo uses gitflow branching model.

### Branches
- `main` - Production releases only, tagged with versions (v0.1.0, v0.1.1, etc.)
- `develop` - Integration branch for features, base for new work

### New Feature
```bash
git checkout develop
git checkout -b feature/your-feature-name
# ... work ...
git checkout develop && git merge feature/your-feature-name
git branch -d feature/your-feature-name
```

### Bug Fix
```bash
git checkout develop
git checkout -b fix/bug-description
# ... fix ...
git checkout develop && git merge fix/bug-description
git branch -d fix/bug-description
```

### Hotfix (production bug)
```bash
git checkout main
git checkout -b hotfix/critical-fix
# ... fix ...
git checkout main && git merge hotfix/critical-fix
git tag -a vX.Y.Z -m "vX.Y.Z - Hotfix description"
git checkout develop && git merge hotfix/critical-fix
git branch -d hotfix/critical-fix
```

### Release
```bash
git checkout develop
git checkout -b release/vX.Y.Z
# bump version in package.json, final testing
git checkout main && git merge release/vX.Y.Z
git tag -a vX.Y.Z -m "vX.Y.Z - Release description"
npm publish
git checkout develop && git merge release/vX.Y.Z
git branch -d release/vX.Y.Z
```

### Commit Messages
- No AI tool references in commits
- Format: `<type>: <description>` (e.g., `feat: add payee search`, `fix: resolve freeze bug`)
- Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`
