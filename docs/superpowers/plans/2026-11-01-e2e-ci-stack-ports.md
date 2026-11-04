# Mobile E2E runs on its own Supabase stack (`padeljam_ci`, ports 5632x)

Task: PAD-11 (follow-up from PAD-9). Goal: launch in January 2027.
Status: **approved (CTO, 2026-11-01)**. Branch: the PAD-11 execution branch.

## Problem

`padeljam-mac` hosts two Supabase stacks with the same `project_id` (`padeljam`) and the same ports: the
founder's/runner's (OrbStack of `joaopaulos4`) and the agents' (OrbStack of `agents`). Both publish
`0.0.0.0:55321-55327`. Whoever started first owns the ports. The e2e wipe goes through
`docker exec supabase_db_padeljam` (the runner's container), but the seed and the app talk to
`127.0.0.1:55321`, which is the agents' stack. The two disagree, and every suite fails with
`Data already present (demo@padeljam.test exists)`. Mobile `e2e` has not passed since 7 Oct.

## Approach

The CI run gets **its own stack**: `project_id = padeljam_ci` and the **5632x** port block. It is chosen with
environment variables. `infra/supabase/config.toml` stays as it is, so the agents' stack, a developer's stack
and `test:db` keep 55321/`padeljam` with no change.

**Verified on 2026-11-01 with CLI 2.117.0** (agents Mac, next to the running agents' stack): with the variables
below, `supabase --workdir infra start` brought up `supabase_*_padeljam_ci` on 56321/56322/56323/56324/56327.
It applied migrations 0001–0147. Auth (200), Mailpit (200) and Edge Functions (401 = served) answered.
`status -o env` without the variables still pointed at 55321. `stop --project-id padeljam_ci --no-backup`
removed only the CI containers.

| Setting | Env var (CLI 2.117 name) | dev (default) | ci |
|---|---|---|---|
| project_id | `SUPABASE_PROJECT_ID` | `padeljam` | `padeljam_ci` |
| API (Kong) | `SUPABASE_API_PORT` | 55321 | 56321 |
| Postgres | `SUPABASE_DB_PORT` | 55322 | 56322 |
| shadow DB | `SUPABASE_DB_SHADOW_PORT` | 55320 | 56320 |
| Studio | `SUPABASE_STUDIO_PORT` | 55323 | 56323 |
| Mailpit | `SUPABASE_LOCAL_SMTP_PORT` (**not** `SUPABASE_INBUCKET_PORT`, which the CLI ignores) | 55324 | 56324 |
| Analytics | `SUPABASE_ANALYTICS_PORT` | 55327 | 56327 |
| Pooler (disabled) | `SUPABASE_DB_POOLER_PORT` | 55329 | 56329 |
| Edge inspector | `SUPABASE_EDGE_RUNTIME_INSPECTOR_PORT` | 8083 | 8183 |

Two side effects, both good:
- A run **no longer wipes the developer's own database**, because `resetDb` now hits `padeljam_ci`.
- The CI edge runtime mounts **the runner's checkout** (the branch under test), not the main checkout. The
  caveat in `01-auth.e2e.ts` (~line 294) stops being true. Reinstating that assertion is a **separate
  follow-up** for Engineer B, not part of this task.

## What changes

### 1. `scripts/e2e/stack.mjs` (new, Engineer A): the one place the stacks are defined

```js
export const STACKS = {
  dev: { projectId: 'padeljam',    api: 55321, db: 55322, shadow: 55320, studio: 55323, mail: 55324, analytics: 55327, pooler: 55329, inspector: 8083 },
  ci:  { projectId: 'padeljam_ci', api: 56321, db: 56322, shadow: 56320, studio: 56323, mail: 56324, analytics: 56327, pooler: 56329, inspector: 8183 },
};
export function resolveStack(name = process.env.E2E_STACK ?? 'dev') // throws on an unknown name
// returns { name, projectId, apiUrl: 'http://127.0.0.1:<api>', mailpitUrl, dbContainer: `supabase_db_${projectId}`,
//           edgeContainer: `supabase_edge_runtime_${projectId}`, cliEnv: { SUPABASE_PROJECT_ID, SUPABASE_API_PORT, ... } }
```

`cliEnv` for `dev` is **empty**: the dev stack comes from `config.toml` alone, so nothing new can change it.

### 2. `scripts/e2e/ci-stack.mjs` (new, Engineer A): brings the CI stack up and writes the env files

This holds everything the workflow step does today, so that later changes don't need a workflow edit:
- `SUPABASE_CLI_VERSION = '2.117.0'`, `npm_config_cache_dir=$HOME/Library/Caches/pnpm-e2e-runner` (keep the
  2026-09-11 incident comment), and `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token`.
- `--stack <name>` (default `ci`). It runs `pnpm dlx supabase@<pin> --workdir infra start` with `cliEnv`, then
  `status -o env` with the same env.
- It writes the repo-root `.env` (the same `sed` mapping as today: `API_URL→SUPABASE_URL`,
  `SERVICE_ROLE_KEY→SUPABASE_SERVICE_ROLE_KEY`, `PUBLISHABLE_KEY→SUPABASE_ANON_KEY`) and `apps/mobile/.env`
  (`EXPO_PUBLIC_SUPABASE_URL=<stack apiUrl>`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_APP_ENV=development`).
- It **refuses** to write if `status` reports an `API_URL` other than the stack's `apiUrl`, and names both.
- It never runs `stop`.

### 3. `scripts/e2e/run.mjs` (Engineer A): everything follows the selected stack

- `const STACK = resolveStack()`, logged once (`stack: ci (padeljam_ci, :56321)`).
- Preflight uses `STACK.apiUrl`, `STACK.mailpitUrl` and `STACK.dbContainer`. Every hint that names a container
  (`docker start …edge_runtime…`) uses `STACK.edgeContainer`. `stackHint` prints the `ci-stack.mjs` command for
  `ci` and today's command for `dev`.
- **New check, the guard against this exact bug:** the root `.env` `SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_URL`
  must both equal `STACK.apiUrl`. Otherwise `die()`, naming the file, the value and the expected value. Wipe,
  seed and app must point at the same stack, or the run doesn't start.
- Children get `E2E_SUPABASE_URL`, `E2E_MAILPIT_URL` and `E2E_DB_CONTAINER` from `STACK`, unless already set.
  `apps/mobile/e2e/driver/config.ts` already reads these, so it does not change.
- Update the header's `Env:` line with `E2E_STACK=dev|ci`.
- The machine-wide lock does not change: there is still only one simulator.

### 4. Tests (Engineer A)

`scripts/e2e/stack.test.mjs` (`node:test`, like `scripts/edge-dashboard/*.test.mjs`). Add
`"scripts/e2e/*.test.mjs"` to the root `test:functions` script so CI runs it:
- `resolveStack()` defaults to `dev`, and `dev` gives 55321, `supabase_db_padeljam` and an empty `cliEnv`;
- `ci` gives 56321, `supabase_db_padeljam_ci`, and a `cliEnv` with **all nine** variables from the table,
  including `SUPABASE_LOCAL_SMTP_PORT`;
- the two stacks share no port and no `projectId`;
- an unknown name throws.

If it can be done without starting a stack, add a test for the run.mjs URL-mismatch guard (extract it as a pure
function). Otherwise, show it by hand on hand-off.

### 5. Docs

- `infra/supabase/README.md` (Engineer A): the 5632x block / `padeljam_ci` is reserved for the mobile e2e runner.
  Don't use it for anything else.
- `apps/mobile/e2e/README.md` (**Engineer B**, after Engineer A's hand-off; docs only): CI runs on
  `padeljam_ci`/56321 via `node scripts/e2e/ci-stack.mjs`; a local run still defaults to `dev`; how to run
  against `ci` by hand (`node scripts/e2e/ci-stack.mjs && E2E_STACK=ci node scripts/e2e/run.mjs`).

### 6. `.github/workflows/e2e-mobile.yml`: **founder** (agents can't edit workflows)

The founder commits this **to the PR branch**, so the PR's own `e2e` run proves the fix:

```yaml
    env:
      DEVELOPER_DIR: /Applications/Xcode.app/Contents/Developer
      # The runner's own Supabase stack: project padeljam_ci on 5632x (scripts/e2e/stack.mjs),
      # so it never shares ports or data with a developer's or the agents' stack on 55321.
      E2E_STACK: ci
```

The step `Ensure the local Supabase stack is up` keeps its name, and its whole `env:` + `run:` body becomes:

```yaml
        run: node scripts/e2e/ci-stack.mjs
```

The comment on the cron that says a run "WIPES the developer's local database" stops being true. Change it to
say the run wipes only `padeljam_ci`. The closing "No teardown" comment stays, with "the developer works
against" changed to "the next run reuses".

## Out of scope

- The runner stopping when `joaopaulos4` logs out (cause 1 in PAD-9). That's operational, for the founder: fast
  user switching, and OrbStack "Start at login" for `joaopaulos4`.
- Reinstating the `terms_accepted_at` assertion in `01-auth` (separate follow-up, Engineer B).
- Any change to `config.toml`, migrations or app code.

## Checks before hand-off

`pnpm lint && pnpm typecheck && pnpm tokens:check && pnpm i18n:check && pnpm size:check && pnpm test && pnpm test:functions`
plus `pnpm test:db` (README under `infra/`), run against the agents' stack on 55321, which must still pass untouched.

Engineer A also shows on hand-off, on the agents Mac: `node scripts/e2e/ci-stack.mjs` brings up `padeljam_ci`
next to the running agents' stack and writes both `.env` files with 56321. Then `E2E_STACK=ci node
scripts/e2e/run.mjs --no-build` passes the preflight (Supabase API, Mailpit, Postgres, Edge Functions ✓) and
dies at the simulator/idb step, because there's no Xcode on this Mac. That's expected. Also show the URL-mismatch
guard firing: point `apps/mobile/.env` at 55321 with `E2E_STACK=ci`. Last, `stop --project-id padeljam_ci
--no-backup`, with env set, and **never** a bare `supabase stop`.

## Acceptance (from PAD-11)

1. A full `e2e` run passes on `padeljam-mac` while the agents' stack is up on 55321/55322. Evidence: the PR's own
   `e2e` check is green after the founder's workflow commit.
2. The agents' local stack and `test:db` are unaffected. Evidence: `test:db` green on hand-off, and
   `config.toml` has no diff.
3. The weekly `main` run is green: the first Sunday run after merge (cron `0 3 * * 0`).
4. A named watcher for the weekly run: **the CTO**. A weekly Paperclip routine (Monday) checks the latest
   scheduled `E2E (mobile)` run on `main` with `gh run list --workflow e2e-mobile.yml --event schedule -L 1`
   and opens a high-priority task when it is red or missing.
