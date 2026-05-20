# Contributing to Lorca

Thanks for your interest in contributing. This guide covers setup, testing, and conventions.

---

## Setup

**Prerequisites:** Node.js ≥ 24 and npm.

```bash
git clone https://github.com/ctrl-escp/lorca.git
cd lorca
npm install          # installs all workspace packages from the root — never run npm install inside a sub-package
npm run dev          # Vite dev server at http://localhost:5173
```

All workspace packages are resolved via npm workspaces. Do not run `npm install` inside individual packages; always run it at the repo root.

---

## Running tests

### Unit tests

```bash
npm test                            # run all unit tests once
npm run test:watch                  # vitest watch mode
```

To run a single workspace's tests:

```bash
npx vitest run packages/core
npx vitest run packages/pipeline
```

### End-to-end tests

Playwright tests require a local Ollama instance with CORS enabled.

```bash
# Install the Playwright browser (one-time)
npx playwright install chromium

# Start Ollama with CORS for the dev server
OLLAMA_ORIGINS=http://localhost:5173 ollama serve

# Run E2E tests (starts the dev server automatically)
npm run test:e2e
```

### Full validation gate

```bash
npm run validate     # lint + build (type-check) + unit tests
```

CI runs `validate` on every push. All three must pass before a PR is merged.

---

## Monorepo layout

```
lorca/
├── apps/web/           # Vue 3 SPA — the only runnable application
├── packages/
│   ├── core/           # TypeScript types only — no runtime deps
│   ├── prompt/         # Prompt rendering helpers
│   ├── endpoints/      # Ollama adapter
│   ├── pipeline/       # Step-chain execution engine
│   ├── capsules/       # Capsule validate/execute/examples
│   ├── storage/        # Dexie IndexedDB + import/export
│   └── ui-kit/         # Shared Vue components (FieldLabel, dialogs)
└── docs/               # Design documents
```

Packages export TypeScript sources directly via `"main": "./src/index.ts"`. There is no transpile step for package consumers; the web app's Vite build handles compilation.

---

## Adding a package

1. Create `packages/<name>/` with `package.json`, `tsconfig.json`, and `src/index.ts`.
2. Set `"main": "./src/index.ts"` and `"type": "module"`.
3. Extend `../../tsconfig.base.json` in the package tsconfig.
4. Add the package to the `workspaces` array in the root `package.json` if not already covered by the glob.
5. Add `"build": "tsc --noEmit"` (or `vue-tsc --noEmit` for Vue packages) to the package `scripts`.
6. Reference it from `apps/web/package.json` as `"@lorca/<name>": "*"`.

---

## Linting

```bash
npm run lint          # ESLint across the full repo
npm run lint:fix      # auto-fix where possible
```

The ESLint config is `eslint.config.mjs` at the root. TypeScript ESLint and `eslint-plugin-vue` are both enabled.

---

## Commit conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]
```

Common types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.

Scope is the package or area affected, e.g. `pipeline`, `capsules`, `ui`, `storage`.

Examples:
- `feat(pipeline): add loop-group step execution`
- `fix(capsules): guard against undefined nodes in validateCapsule`
- `docs: add CONTRIBUTING guide`

---

## PR checklist

Before opening a pull request:

- [ ] `npm run validate` passes with no errors.
- [ ] New behaviour is covered by a unit test or Playwright spec.
- [ ] No `window.prompt`, `window.confirm`, or `window.alert` added (use `ConfirmDialog` / `PromptDialog` from `@lorca/ui-kit`).
- [ ] TypeScript strict mode satisfied (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`).
- [ ] PR description explains _why_ the change is needed, not just what it does.
