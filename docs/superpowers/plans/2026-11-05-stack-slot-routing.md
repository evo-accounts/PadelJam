# Route local stack starts through the shared slot script (PAD-219)

## Problem

Only two local database stacks may run at once across all companies on this Mac, enforced by
`/Users/Shared/paperclip-ops/stack-slot`. The block on typed `supabase start` commands doesn't see a
start inside a repo script.

## What starts a stack in this repo

| Where | Runs on | Change |
|---|---|---|
| `scripts/e2e/ci-stack.mjs` | runner (GitHub job), or by hand | By hand on this Mac: through the slot, exit 75 passed on. GitHub job: direct. |
| `pnpm test:db` (`scripts/run-db-tests.mjs`) | anywhere | None. It needs a running stack and never starts one. |
| `padNNN` stacks | typed by agents, from `docs/agents/_rules.md` | Rules give the slot command and the lean set. |
| Hints in `run.mjs`, `global-setup.ts`, `e2e-web`, READMEs | people and agents | Print the slot command. |
| `seed-demo.yml` | GitHub-hosted | None. |
| `e2e-mobile.yml` | runner, own OrbStack under `joaopaulos4` | None. Slots can't see that Docker and that user can't write the slot state. |

Historical plans and specs stay as written.

## Exit 75

Only `stack-slot` and `ci-stack.mjs` can return it, and `ci-stack.mjs` never queues in a GitHub job, so
it can't turn a PR red.

## Lean start

Tested against `pnpm test:db`, 47 files, on 6 Nov:

| Start | Result |
|---|---|
| `-x studio,edge-runtime,logflare,vector,supavisor,imgproxy` | 44/47. `account-deletion-lockdown`, `blast-recipients-privacy` and `complete-account-consent` fail with 503: they call edge functions. |
| `-x studio,logflare,vector,supavisor,imgproxy`, after `db reset` | 47/47. |

So agents keep the edge runtime. A second run on the same data failed only `internal-rpc-privileges`,
the reused-database fragility described in `scripts/run-db-tests.mjs`.

The mobile E2E isn't tested on the lean set and keeps its full start.

## Verify

`pnpm test:functions` for `slotted()`, plus `ci-stack.mjs` run for real with a test `STACK_SLOT_DIR`
holding both slots, to see exit 75, no start and no `.env`.
