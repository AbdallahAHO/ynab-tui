# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1](https://github.com/AbdallahAHO/ynab-tui/compare/v0.2.0...v0.2.1) (2026-01-04)


### Features

* add AI-powered memo generation and payee context notes ([#3](https://github.com/AbdallahAHO/ynab-tui/issues/3)) ([3a68903](https://github.com/AbdallahAHO/ynab-tui/commit/3a6890360da717016f07f13e656af01841aadba9))
* add automatic transfer detection between accounts ([30eece0](https://github.com/AbdallahAHO/ynab-tui/commit/30eece077a97559c839b8a924b8d66c776080feb))
* automatic transfer detection between accounts ([5e58c19](https://github.com/AbdallahAHO/ynab-tui/commit/5e58c190407f62b4e21519cef8360e15c75cfa83))
* CLI automation for cron jobs and agent integration ([a264f4b](https://github.com/AbdallahAHO/ynab-tui/commit/a264f4b720709917f4cab6fb2d5170da1fa64467))
* **cli:** add argument parsing and output formatting ([c5e1ea7](https://github.com/AbdallahAHO/ynab-tui/commit/c5e1ea7da359a19b4636c64edae21c2a8077e539))
* **cli:** add dual-mode entry point ([9d6941b](https://github.com/AbdallahAHO/ynab-tui/commit/9d6941ba284d9ede4aede0200ba9cc82d3c0ef01))


### Bug Fixes

* **ci:** trigger npm publish on manual releases ([9a438f0](https://github.com/AbdallahAHO/ynab-tui/commit/9a438f010269386684c65db1113e95e7dd666a73))
* **ci:** trigger npm publish on manual releases ([37b3a66](https://github.com/AbdallahAHO/ynab-tui/commit/37b3a6692548497e638e3580dcc46cbc7034f57b))
* include aiContext in AI prompts and add unit tests ([#1](https://github.com/AbdallahAHO/ynab-tui/issues/1)) ([94005c7](https://github.com/AbdallahAHO/ynab-tui/commit/94005c7228d73557863fef761b37b2b6f83cbc28))
* resolve TUI not launching when no subcommand provided ([04346fa](https://github.com/AbdallahAHO/ynab-tui/commit/04346fac4f53efdfc972a43c0270e19659e803d6))

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
