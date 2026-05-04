# mongoose-translation-plugin — Agent Context

Auto-translation plugin for Mongoose models. Stores per-locale translation overrides inside each document, integrates with any translation provider, and tracks freshness via a `sourceUpdatedAt` timestamp.

## Tech stack

| Layer | Tool |
|---|---|
| Language | TypeScript 5, strict mode, `es2022` target |
| Runtime | Node.js ≥ 24 |
| Package manager | **pnpm** (lockfile is `pnpm-lock.yaml`; never commit `package-lock.json`) |
| ODM peer dep | Mongoose ^8 |
| Test runner | Jest 29 + ts-jest + mongodb-memory-server |
| Linter / formatter | Biome 2 (`biome.json`) |
| Commit convention | Conventional Commits enforced by commitlint |
| Release | semantic-release (triggers on `main` and `beta` branches) |
| CI | GitHub Actions — `.github/workflows/checks.yml` (PRs), `.github/workflows/release.yml` (merges) |
| Build | tsup (CJS + ESM dual output, `dist/`) |

## Source layout

```
src/
  index.ts            — public re-exports
  plugin.ts           — core translationPlugin() function
  schema.ts           — buildTranslationSchema(), getTranslatablePaths()
  tools.ts            — pure helpers (mapEntityPathValues, applyTranslation, …)
  mongoose.types.ts   — all exported TypeScript types / interfaces
  __tests__/
    plugin.test.ts    — integration tests (spins up MongoDB in-memory)
    schema.test.ts
    tools.test.ts
  examples/           — Google Translate & DeepL provider implementations
docs/
  api.md              — full API reference
dist/                 — compiled output (committed; published to npm)
```

## Branch strategy

```
feature/* ──PR──▶ beta ──PR──▶ main
                              ↑
                       releases cut here (and beta pre-releases)
```

- **Feature branches** must target `beta`, never `main`.
- **Only `beta`** may be merged into `main`.
- `main` is always releasable; `beta` carries the next-version staging work.

## Key commands

```bash
pnpm install          # install deps
npm run biome         # lint (read-only)
npm run biome:fix     # lint + auto-fix
npm run test          # jest (with coverage)
npm run type-check    # tsc --noEmit
npm run build         # tsup — writes dist/
npm run check-exports # @arethetypeswrong/cli pack check
```

## Commit format (enforced by commitlint)

```
<type>(<scope>): <short description>     ← max 72 chars
                                          ← blank line
[optional body, max 100 chars per line]

[BREAKING CHANGE: <explanation>]         ← triggers major release
```

Common types: `feat`, `fix`, `refactor`, `chore`, `docs`, `ci`, `test`.  
Append `!` after the type (e.g. `feat!:`) as shorthand for a breaking change.

## Coding practices

- No comments unless the **why** is non-obvious (hidden constraint, workaround, invariant).
- No `package-lock.json` — this project uses pnpm exclusively.
- Do not add features, refactors, or abstractions beyond what the task requires.
- All public API types live in `mongoose.types.ts`; keep them accurate and exported via `index.ts`.
- Biome 2 is the single tool for formatting and linting — run `npm run biome:fix` before committing.
- Tests use `mongodb-memory-server`; never mock the database.
- `dist/` is committed and published. Run `npm run build` after any source change that should be reflected in a release.

## Release process

semantic-release runs automatically on push to `main` (stable) or `beta` (prerelease).  
It reads conventional commits since the last tag, bumps the version, updates `CHANGELOG.md`, publishes to npm, and commits back the version bump.  
Do **not** manually edit `package.json` version or `CHANGELOG.md`.

## Documentation

- `README.md` — overview, quick-start, options, output shape
- `docs/api.md` — full attribute and method reference
- `CONTRIBUTING.md` — contribution workflow and branch rules
