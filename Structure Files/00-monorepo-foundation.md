# Spec 00 — Monorepo foundation

**Goal:** A working pnpm + Turborepo monorepo with empty-but-wired apps and packages,
shared TypeScript config, and a green `turbo run typecheck`.

**Depends on:** nothing.

## Tasks

1. Initialise the repo with pnpm workspaces. Create `pnpm-workspace.yaml` covering
   `apps/*` and `packages/*`.
2. Add Turborepo. Create `turbo.json` with pipelines for `build`, `dev`, `lint`,
   `typecheck`. `typecheck` and `lint` have no dependencies; `build` depends on
   `^build`.
3. Create `tsconfig.base.json` at the root with strict mode on (`strict: true`,
   `noUncheckedIndexedAccess: true`, `moduleResolution: "bundler"`). Every package and
   app extends it.
4. Scaffold the apps:
   - `apps/web` — Next.js (App Router, TypeScript, Tailwind). Create the four route
     groups as empty segments: `(public)`, `(app)`, `(dashboard)`, `(super-admin)`.
   - `apps/mobile` — Expo (TypeScript, Expo Router). Enable the New Architecture.
5. Scaffold the packages, each with `package.json`, `tsconfig.json`, `src/index.ts`
   exporting a placeholder: `ui`, `api`, `auth`, `db`, `features`, `permissions`,
   `chat`, `i18n`, `config`, `utils`.
6. Wire workspace dependencies so apps can import packages by name
   (e.g. `@padel/utils`). Use a consistent scope, e.g. `@padel/*`.
7. Add root tooling: ESLint (flat config), Prettier, and a shared eslint package or
   config. Add `.editorconfig` and `.gitignore`.
8. Add `packages/config` first-class: it reads and validates environment variables with
   Zod and exposes a typed `env` object. Nothing else reads `process.env` directly.

## Constraints

- Use the `@padel/` scope for all internal packages.
- No app may import another app. Apps import packages only.
- `packages/config` is the only place that touches `process.env`.

## Definition of done

- [ ] `pnpm install` succeeds from a clean checkout.
- [ ] `turbo run typecheck` passes across all workspaces.
- [ ] `apps/web` runs with `pnpm dev` and serves a placeholder page for each route group.
- [ ] `apps/mobile` boots in Expo Go / simulator with New Architecture enabled.
- [ ] Importing `@padel/utils` from both apps type-checks and runs.
- [ ] `packages/config` throws a clear error at startup if a required env var is missing.
