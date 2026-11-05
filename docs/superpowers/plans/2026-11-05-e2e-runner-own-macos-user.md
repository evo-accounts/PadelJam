# Mobile E2E runner on its own macOS user

Task: PAD-92 (route 4). Goal: launch in January 2027.
Status: **approved (CTO, 2026-11-05), not started.** Only the founder can do it: it needs an admin login and the
`joaopaulos4` account. **Not yet tried**, so expect to adjust the setup steps on the first attempt.

## Problem

`e2e-mobile.yml` runs on the self-hosted runner `padeljam-mac`, as the founder's macOS account `joaopaulos4`. It runs
for any non-draft PR touching `apps/mobile`, `packages`, `infra` or `scripts/e2e`, before any review. So code on an
agent's branch can read whatever that account holds: files, and any Supabase or `gh` login. It doesn't get the
GitHub secrets, which `hosted-migrations` keeps to `main`.

Fork PRs need the founder's approval to run (founder's report on PAD-94), so today this route is open to agents with a
push token, and to a fork PR the founder approves.

Home folders are part of the same problem. `/Users/joaopaulos4` and `/Users/agents` are both `drwxr-x---`, group
`staff`. Every standard macOS user is in `staff`, so a new user could read both unless they're tightened first.

## Approach

A new standard (not admin) macOS user, `padeljam-runner`, holds the runner and nothing else: no Supabase or `gh` login,
no Apple ID, no copied dotfiles. A PR's code then reaches only that empty account.

The workflow doesn't change. It selects `[self-hosted, macOS, ARM64]`, and the scripts have no path tied to
`joaopaulos4`. What the account needs, from `e2e-runner-session` and the workflow:

| Need | In the new account |
|---|---|
| A logged-in GUI session (simulator, runner as a LaunchAgent) | Stay logged in with fast user switching; never Log Out |
| Docker | Its own OrbStack, with Start at login on |
| Xcode | Shared `/Applications/Xcode.app`; open it once as this user to accept first-launch prompts |
| idb | `pip3 install --user fb-idb`; `run.mjs` looks in `~/Library/Python/3.9/bin/idb` (`E2E_IDB_PATH` overrides it) |
| Node and pnpm | Set up by the workflow's actions |
| Ports | Already separate: the CI stack is `padeljam_ci` on 5632x (PAD-11) |

## Steps (founder)

1. **Tighten the homes**, from an admin account:
   `chmod 700 /Users/joaopaulos4 /Users/agents`
   Check as `agents`: `ls /Users/joaopaulos4` says `Permission denied`.
2. **Create the user:** System Settings → Users & Groups → Add User, type Standard, name `padeljam-runner`.
3. **Set up the account** per the table above.
4. **Stop the old runner**, as `joaopaulos4`: `cd ~/actions-runner && ./svc.sh stop`. Keep the folder for rollback.
5. **Register the new one:** GitHub → repo Settings → Actions → Runners → New self-hosted runner, macOS ARM64. Follow
   its commands as `padeljam-runner`, with the name `padeljam-mac-runner`, then `./svc.sh install && ./svc.sh start`.
6. **Prove it:** Actions → E2E (mobile) → Run workflow, on `main`, suite `04`. It should go green.
7. **Prove the isolation**, as `padeljam-runner`: `ls /Users/joaopaulos4 /Users/agents` says `Permission denied` for
   both, and `gh auth status` and `ls ~/.supabase` find nothing.
8. **Remove the old runner:** after a green full run, in the runner settings on GitHub, then delete
   `~/actions-runner` in `joaopaulos4`.

**Rollback:** until step 8, `cd ~/actions-runner && ./svc.sh start` as `joaopaulos4` brings the old runner back. Stop
the new one first, so that a job can't land on it.

## What this doesn't fix

- **PR code still runs on this Mac.** It can reach anything listening locally, including Paperclip on 3100, and it can
  read the new account's runner registration. Only a separate machine would change that.
- **A third logged-in session uses memory.** Compare `~/mac-metrics/memory.csv` before and after; E2E timeouts from a
  crowded Mac look like `idb` or `simctl` failures. If that's what happens, the founder can leave `joaopaulos4`
  logged out, which this change makes safe for the first time.
- **Agents lose direct access to runner files.** They can read runner screenshots in the founder's home today; after step 1 they use the
  `e2e-artifacts` upload on the run instead. The founder's account can also no longer browse `/Users/agents` without admin rights.
- **Timing:** steps 4-6 leave no working runner for a while. Do them when no PR is waiting on `e2e`.
