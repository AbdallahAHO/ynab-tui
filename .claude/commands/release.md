---
description: Prepare and create a release PR from develop to main
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
argument-hint: [major|minor|patch|sync] or leave empty for auto-detection
---

# Release Workflow

You are helping prepare a release for ynab-tui. This command automates the release process.

## Arguments

- Empty or auto: Auto-detect version bump from conventional commits
- `major`: Force a major version bump
- `minor`: Force a minor version bump
- `patch`: Force a patch version bump
- `sync`: After a release PR is merged, sync main back to develop

Argument provided: $ARGUMENTS

---

## If argument is "sync"

Run post-release sync to merge main back to develop:

```bash
git fetch origin main develop
git checkout main
git pull origin main
git checkout develop
git merge main --no-edit
git push origin develop
```

Then report success and exit.

---

## Pre-flight Checks

1. **Verify on develop branch:**
```bash
git branch --show-current
```
If not on develop, warn and stop.

2. **Check for uncommitted changes:**
```bash
git status --porcelain
```
If there are changes, warn and stop.

3. **Ensure develop is up to date:**
```bash
git fetch origin develop
git status -uno
```

4. **Run tests:**
```bash
npm test -- --run
```
If tests fail, stop.

---

## Analyze Commits

Get commits since last tag:
```bash
git log $(git describe --tags --abbrev=0 2>/dev/null || echo "HEAD~50")..HEAD --oneline --no-merges
```

**Version bump rules:**
- `BREAKING CHANGE:` or `!:` in any commit → major
- Any `feat:` commit → minor
- Only `fix:`, `perf:`, `refactor:` commits → patch

If user provided major/minor/patch argument, use that instead.

Read current version from package.json and calculate next version.

---

## Generate Changelog Preview

Show grouped changes:

**Features** (feat:)
**Bug Fixes** (fix:)
**Performance** (perf:)

Ask user to confirm:
- Next version number is correct
- Changelog entries look good

---

## Create Release

1. **Create release branch:**
```bash
git checkout -b release/vX.Y.Z
```

2. **Update package.json version** using Edit tool

3. **Update CHANGELOG.md** using Edit tool:
   - Add new version section at top (after the header)
   - Include today's date in YYYY-MM-DD format
   - Group entries by type (Features, Bug Fixes, etc.)
   - Add compare link at bottom

4. **Commit changes:**
```bash
git add package.json CHANGELOG.md .release-please-manifest.json
git commit -m "chore(release): vX.Y.Z"
```

5. **Push and create PR:**
```bash
git push -u origin release/vX.Y.Z
```

Then create PR with gh:
```bash
gh pr create --base main --title "chore(release): vX.Y.Z" --body "## Release vX.Y.Z

### Changes
[Include changelog entries here]

---

**After merging this PR:**
1. GitHub Actions will create a GitHub Release
2. Package will be published to npm automatically
3. Run \`/release sync\` to merge main back to develop"
```

---

## Post-Release Instructions

After creating the PR, tell the user:

1. Review the PR at [PR URL]
2. Once CI passes, merge the PR
3. After merge, run `/release sync` to update develop
