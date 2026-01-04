# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0](https://github.com/AbdallahAHO/ynab-tui/compare/v0.4.0...v0.5.0) (2026-01-04)

### Features

- Add monthly spending report CLI command (`ynab-tui report`)
  - Category breakdown with budget comparison
  - Top payees analysis with transaction counts
  - Month-over-month comparison with `--compare` flag
  - Account filtering with `--account` flag
  - JSON and text output formats
- Add TUI spending summary panel
  - Shows spent/income/net/top category at a glance
  - Toggle visibility with `s` key
- Add PM subagent for GitHub project management

### Bug Fixes

- Fix refresh losing all transactions (delta sync returning empty data)
- Fix timezone bug in date filtering for reports
- Fix null vs undefined bug in transfer detection

## [0.4.0](https://github.com/AbdallahAHO/ynab-tui/compare/v0.3.5...v0.4.0) (2026-01-04)

### Features

- Add automatic transfer detection between accounts
  - Matches transactions with same amount, opposite signs, within 3 days
  - Visual ↔ indicator in transaction list for detected pairs
  - Quick confirmation flow during categorization review
  - Confidence scoring based on date proximity

### Bug Fixes

- Resolve TUI not launching when no subcommand provided

## [0.3.5](https://github.com/AbdallahAHO/ynab-tui/compare/v0.3.4...v0.3.5) (2026-01-04)

### Bug Fixes

- Remove registry-url, update npm for OIDC

## [0.3.4](https://github.com/AbdallahAHO/ynab-tui/compare/v0.3.3...v0.3.4) (2026-01-04)

### Bug Fixes

- Clear NODE_AUTH_TOKEN for OIDC, upgrade setup-node to v6

## [0.3.3](https://github.com/AbdallahAHO/ynab-tui/compare/v0.3.2...v0.3.3) (2026-01-04)

### Bug Fixes

- Add --provenance flag for npm OIDC authentication

## [0.3.2](https://github.com/AbdallahAHO/ynab-tui/compare/v0.3.1...v0.3.2) (2026-01-04)

### Bug Fixes

- Migrate to npm OIDC trusted publishing (no more token management)

## [0.3.1](https://github.com/AbdallahAHO/ynab-tui/compare/v0.3.0...v0.3.1) (2026-01-04)

### Bug Fixes

- Fix CI to trigger npm publish on manual releases

## [0.3.0](https://github.com/AbdallahAHO/ynab-tui/compare/v0.2.0...v0.3.0) (2026-01-04)

### Features

- Add CLI automation for cron jobs and agent integration
- Add `categorize` command for headless auto-categorization
- Add `list` command for listing transactions with filters
- Add `memo` command for batch memo generation
- Add `payees` command for managing payee rules
- Support environment variables (YNAB_TOKEN, OPENROUTER_KEY, YNAB_BUDGET_ID)
- Add JSON and text output formats for scripting
- Add dry-run mode for previewing categorizations

### Documentation

- Add CLI automation section to README
- Add CLI architecture section to ARCHITECTURE.md

## [0.2.0](https://github.com/AbdallahAHO/ynab-tui/compare/v0.1.1...v0.2.0) (2026-01-04)

### Features

- Add AI-powered memo generation for transactions
- Add payee context notes for better categorization
- Add "Generate Memo" action in transaction edit screen
- Add YOLO mode for batch memo generation

### Bug Fixes

- Include aiContext in AI prompts for better categorization accuracy

### Other

- Add comprehensive test suite (174 tests)
- Add CI/CD with GitHub Actions
- Add conventional commits enforcement
- Add automated release workflow

## [0.1.1](https://github.com/AbdallahAHO/ynab-tui/compare/v0.1.0...v0.1.1) (2024-01-04)

### Bug Fixes

- Fix duplicate shebang in build output

## [0.1.0](https://github.com/AbdallahAHO/ynab-tui/releases/tag/v0.1.0) (2024-01-03)

### Features

- Initial release
- Interactive TUI for YNAB transaction management
- AI-powered transaction categorization with OpenRouter
- YOLO mode for batch auto-categorization
- Payee management with AI tagging
- Duplicate payee detection
- 30-day AI response caching
