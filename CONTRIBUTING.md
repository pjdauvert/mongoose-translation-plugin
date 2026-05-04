# Contributing to mongoose-translation-plugin

Thank you for your interest in contributing! Please read this guide before opening a PR.

## Code of Conduct

All interactions are governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Branch model

```
feature/* ──PR──▶ beta ──PR──▶ main
```

| Branch | Purpose |
|---|---|
| `main` | Production releases. **Never push directly.** |
| `beta` | Staging / pre-release integration branch. |
| `feature/*`, `fix/*`, `chore/*`, … | Your work branch. |

**Rules:**
- All feature, fix, and chore branches must target **`beta`** in their pull request — never `main`.
- Only the `beta` branch itself may be merged into `main`.
- Release workflows run automatically on push to `main` (stable semver) and `beta` (prerelease).

### Enforcing the model with GitHub branch protection

Go to **Settings → Rules → Rulesets** (or the classic **Settings → Branches**) and configure:

**`main` branch ruleset**
- ✅ Require a pull request before merging
- ✅ Require status checks to pass (`Biome and Jest checks`)
- ✅ Block force pushes
- ✅ Restrict deletions
- Under *Restrict pushes* → add `beta` as the only permitted source ref (GitHub Rulesets "require linear history from these branches" or a merge-queue policy).

> **Note:** GitHub's branch protection rules do not natively restrict *which branch* a PR's head must come from. The most reliable enforcement is a short GitHub Actions workflow that fails if the PR's `base` branch is `main` and the `head` branch is not `beta`:
>
> ```yaml
> # .github/workflows/enforce-branch-model.yml
> on:
>   pull_request:
>     branches: [main]
> jobs:
>   check:
>     runs-on: ubuntu-latest
>     steps:
>       - if: github.head_ref != 'beta'
>         run: |
>           echo "PRs to main must come from the beta branch."
>           exit 1
> ```

**`beta` branch ruleset**
- ✅ Require a pull request before merging
- ✅ Require status checks to pass (`Biome and Jest checks`)
- ✅ Block force pushes
- ✅ Restrict deletions

## Commit messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint.

```
<type>(<scope>): <short description>    ← 72 chars max
                                         ← blank line
[optional body — 100 chars per line max]

[BREAKING CHANGE: <explanation>]        ← triggers a major release
```

Common types: `feat`, `fix`, `refactor`, `chore`, `docs`, `ci`, `test`.  
Append `!` after the type (e.g. `feat!:`) as a shorthand for a breaking change.

## Development setup

```bash
# prerequisites: Node.js ≥ 24, pnpm
pnpm install
```

### Useful commands

```bash
npm run biome         # lint (read-only)
npm run biome:fix     # lint + auto-fix
npm run test          # jest with coverage
npm run type-check    # tsc --noEmit
npm run build         # compile to dist/
npm run check-exports # verify dual CJS/ESM exports
```

Always run `npm run biome:fix && npm run type-check && npm test` before pushing.

## Pull request checklist

- [ ] Branch targets `beta` (not `main`)
- [ ] Commit messages follow the conventional commits format
- [ ] `npm run biome:fix` produces no errors
- [ ] `npm run type-check` passes
- [ ] `npm test` passes (all suites green)
- [ ] New behaviour is covered by tests
- [ ] Public API changes are reflected in `docs/api.md`

## Testing

Tests use `mongodb-memory-server` to spin up a real MongoDB instance. Do not mock the database — integration tests catch real-world edge cases that mocks miss.

Test files live in `src/__tests__/`. Add tests for any new behaviour or bug fix.

## Coding style

- Biome 2 handles all formatting and linting. Do not add ESLint or Prettier.
- Comments only when the *why* is non-obvious (hidden constraint, workaround, invariant). Never describe what the code does.
- All TypeScript types for the public API belong in `src/mongoose.types.ts` and must be re-exported from `src/index.ts`.
- Do not commit `package-lock.json`. This project uses pnpm exclusively.

## Release

Releases are fully automated via semantic-release. You do not need to edit `package.json` version or `CHANGELOG.md` manually:
- Merging `beta` → `main` triggers a stable release.
- Merging a feature branch into `beta` triggers a prerelease.
