# PadelJam Paperclip Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Steps marked **[Founder]** need the founder's hands (admin password, Paperclip UI, GitHub settings, approvals); an agent prepares them and waits.

**Goal:** Stand up PadelJam's five pilot agents (CEO, CTO, Engineer A, Engineer B, QA) in the existing Paperclip instance and run one real task end to end, backend → web → mobile, proving the hand-offs and the board gates before the rest of the team is turned on.

**Architecture:** The same agents Mac (`agents-mac.local`), user `agents`, and Paperclip 2026.1023.0 service (`127.0.0.1:3100`, DB on 54329) that run TwoDo, Hbrows and Roblox Studio. PadelJam gets its own read-only clone at `/Users/agents/padeljam`, its own local Supabase on 55320–55329, and its own Paperclip company and project. Agents can't push, hold no founder logins, and can't reach the hosted Supabase project. The founder fetches agent branches over SSH from the Mac mini, pushes, opens the PR, and the founder's self-hosted runner runs the mobile E2E.

**Tech Stack:** Paperclip (`claude_local` adapter, engine `cli`), Claude Code CLI, OrbStack + Supabase CLI 2.117.0 via `pnpm dlx`, Node 22 + pnpm 10.30.3 (corepack), git worktrees, Playwright (`e2e-web`), SSH.

**Spec:** `docs/superpowers/specs/2026-10-29-agent-team-design.md`

## Global Constraints

- Pilot agents only: **CEO, CTO, Engineer A (backend), Engineer B (mobile), QA.** No other agent is created in this plan.
- Pilot runs **3–4 days**. Launch target: **January 2027**, free, App Store + Google Play, Portugal and Brazil.
- Board gates (spec §"The board"): no merge to `main`; no Vercel, EAS build/submit, EAS Update or edge function deploy; no SQL, seed or migration against a non-local database; nothing sent outside the team (including store submissions); no spend; no legal text; no prices; no hires; no goal change, without the founder.
- The agents Mac holds **none** of the founder's credentials: no hosted Supabase (`wispuppglipffcsqowlq`) key, no Vercel, EAS, Stream, Resend, Twilio, Sentry, Apple or Google values, no GitHub write access. The only GitHub access is the read-only deploy key `~/.ssh/padeljam_deploy`.
- The hosted project's host `wispuppglipffcsqowlq.supabase.co` is unreachable from the agents Mac (its URL and publishable key sit in `apps/mobile/eas.json`).
- Every PadelJam agent's env: `PORT=3200`, `WEB_PORT=3201`, and `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN` as a secret ref to the dummy `local_test_token`. Nothing else.
- Agents log in to Claude through a stored `claude /login` (the shared subscription) on the `agents` account. A `CLAUDE_CODE_OAUTH_TOKEN` secret ref was tried first: Paperclip handed Claude a value it rejected with 401, even for a fresh token that worked by hand, and an env token overrides the stored login.
- Agent instructions are `docs/agents/<role>.md` with `docs/agents/_rules.md` appended.
- Code follows **spec → plan → build → QA** on `feat/<topic>` or `fix/<topic>`. One owner per task at a time.
- The other companies keep running as they are; PadelJam's pilot does not change them.

## Review Focus

1. **An agent reaches the hosted database.** Expected: impossible; the host doesn't resolve and no `.env` holds hosted values. Pinned by Task 1, Step 6 (rows 6–7).
2. **The web E2E tests Paperclip instead of PadelJam.** `e2e-web` reuses whatever listens on `WEB_PORT`, and defaults to 3100. Expected: agents use 3201, and nothing PadelJam starts listens on 3100. Pinned by Task 3, Step 2 (env) and Task 5, Step 5.
3. **An agent pushes, deploys or submits.** Expected: push URL `DISABLED`, read-only key, no `gh`/`eas`/`vercel` login. Pinned by Task 1, Step 6 and Task 5, Step 6.
4. **Two engineers write the same branch at once.** Expected: Engineer B starts only after Engineer A hands the branch over on the task; each run has its own worktree. Pinned by Task 5, Steps 2 and 4.
5. **A usage-limit stall is mistaken for a broken hand-off.** The subscription is shared with the other companies. Expected: every stalled run is checked for a limit message first, and the retro counts them separately. Pinned by Task 5, Step 7 and Task 6, Step 1.

---

### Task 0: Write the pilot agents' instructions — DONE

`docs/agents/_rules.md`, `ceo.md`, `cto.md`, `engineer-backend.md`, `engineer-mobile.md` and `qa.md` are committed with this plan.

### Task 1: Prepare the agents Mac for PadelJam

TwoDo's `docs/agents/agents-mac-setup.md` steps 1–5 are done once per Mac and already hold (Node 22 and 24 via nvm, Claude Code, OrbStack, the Supabase binary). This task is that checklist's steps 6–8 for PadelJam, plus the hosted block.

- [ ] **Step 1 (as `agents`): Make the deploy key.**

```bash
ssh-keygen -t ed25519 -f ~/.ssh/padeljam_deploy -N "" -C agents-mac-padeljam
cat ~/.ssh/padeljam_deploy.pub
```

- [ ] **Step 2 [Founder]: Add it on GitHub.** `evo-accounts/PadelJam` → Settings → Deploy keys → Add, title `agents-mac`, **Allow write access unchecked**.

- [ ] **Step 3 (as `agents`): Clone, read-only, and install.**

```bash
printf 'Host github-padeljam\n  HostName github.com\n  IdentityFile ~/.ssh/padeljam_deploy\n  IdentitiesOnly yes\n' >> ~/.ssh/config
git clone git@github-padeljam:evo-accounts/PadelJam.git ~/padeljam
cd ~/padeljam
git remote set-url --push origin DISABLED
nvm use            # .nvmrc → 22
# A global /usr/local/bin/pnpm (installed from the admin account) fails to switch to 10.30.3; corepack's shim must win.
rm -rf ~/Library/pnpm/.tools/pnpm/10.30.3*
corepack enable --install-directory ~/.local/bin pnpm && hash -r
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm --version   # 10.30.3
pnpm install --frozen-lockfile   # "Ignored build scripts" is expected; don't run approve-builds
pnpm --filter @padel/e2e-web exec playwright install chromium
```

- [ ] **Step 4 (as `agents`): Start the local stack and write local-only env files.** Same transforms as `.github/workflows/e2e-mobile.yml`.

```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
export npm_config_cache_dir="$HOME/Library/Caches/pnpm-padeljam"   # own dlx cache, see infra/supabase/README.md
pnpm dlx supabase@2.117.0 --workdir infra start
pnpm dlx supabase@2.117.0 --workdir infra status -o env \
  | sed -e 's/^API_URL=/SUPABASE_URL=/' -e 's/^SERVICE_ROLE_KEY=/SUPABASE_SERVICE_ROLE_KEY=/' \
        -e 's/^PUBLISHABLE_KEY=/SUPABASE_ANON_KEY=/' > .env
echo "SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token" >> .env
ANON=$(grep '^SUPABASE_ANON_KEY=' .env | cut -d= -f2- | tr -d '"')
printf 'EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321\nEXPO_PUBLIC_SUPABASE_ANON_KEY=%s\nEXPO_PUBLIC_APP_ENV=development\n' "$ANON" > apps/mobile/.env
printf 'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321\nNEXT_PUBLIC_SUPABASE_ANON_KEY=%s\nNEXT_PUBLIC_APP_ENV=development\n' "$ANON" > apps/web/.env.local
```

Expected: `supabase start` reports the API on `127.0.0.1:55321` alongside TwoDo's stack. If it fails a health check, look for another user's listener with `sudo lsof -iTCP:55321-55329` from the admin account.

- [ ] **Step 5 [Founder] (admin account): Block the hosted project's host.**

```bash
printf '0.0.0.0 wispuppglipffcsqowlq.supabase.co\n:: wispuppglipffcsqowlq.supabase.co\n' | sudo tee -a /etc/hosts
sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
grep -n wispupp /etc/hosts; curl -sS -m 5 https://wispuppglipffcsqowlq.supabase.co/rest/v1/ 2>&1 | tail -1
```

Expected: two `grep` lines and a curl connection error. Check with `grep` and `curl`, not `dscacheutil`: on the first run the append silently didn't land while `dscacheutil` still showed `0.0.0.0`. This is machine-wide; no other company on this Mac uses PadelJam's project.

- [ ] **Step 6 (as `agents`, in `~/padeljam`): Check the boundaries.**

| # | Command | Expected |
|---|---|---|
| 1 | `git push origin HEAD` | fails |
| 2 | `GIT_SSH_COMMAND="ssh -i ~/.ssh/padeljam_deploy" git push git@github.com:evo-accounts/PadelJam.git HEAD:refs/heads/push-test` | fails: the key is read-only |
| 3 | `gh auth status; npx --no-install eas whoami; ls ~/.vercel ~/.git-credentials; security find-internet-password -s github.com` | not logged in / not found / no keychain item. On 2026-10-30 `gh` and the keychain held the founder's full `evo-accounts` login; both were removed, and git's github.com helper is only `!/usr/local/bin/gh auth git-credential` (TwoDo's agents pass `GH_TOKEN`) |
| 4 | `pnpm dlx supabase@2.117.0 projects list` | fails: not logged in |
| 5 | `grep -rl wispuppglipffcsqowlq .env apps/mobile/.env apps/web/.env.local` | no output |
| 6 | `curl -sS -m 5 https://wispuppglipffcsqowlq.supabase.co/rest/v1/` | fails to connect |
| 7 | `node -e "fetch('https://wispuppglipffcsqowlq.supabase.co/rest/v1/').then(()=>console.log('REACHED'),()=>console.log('blocked'))"` | `blocked` |
| 8 | `read -rs T; T=${T//$'\e[200~'/}; T=${T//$'\e[201~'/}; T=${T//[[:space:]]/}; CLAUDE_CODE_OAUTH_TOKEN="$T" claude -p "List every MCP tool you have. Reply NONE if none." --strict-mcp-config; unset T` (paste the token at the hidden prompt; the substitutions strip the terminal's bracketed-paste markers) | `NONE` |
| 9 | `pnpm lint && pnpm typecheck && pnpm test && pnpm test:functions` | pass |
| 10 | `pnpm test:db` | pass |

Type the token only at row 8's hidden prompt, then close that Terminal window. If any row differs, stop and report it before going further.

- [ ] **Step 7 [Founder] (on the Mac mini): Link the agents' branches.**

```bash
cd ~/Documents/GitHub/PadelJam
git remote add agents ssh://joaopaulos4@agents-mac.local/Users/agents/padeljam
git fetch agents
```

On "dubious ownership" or "permission denied", apply the two fixes in TwoDo's `agents-mac-setup.md` step 8 with `/Users/agents/padeljam`.

### Task 2: Create the company in Paperclip

Paperclip is already installed and running; nothing is reinstalled. Everything here and in Task 3 also works through the API (`http://localhost:3100/api`, described at `GET /api/openapi.json`); on 2026-10-30 it was done that way.

If Paperclip's onboarding wizard already made a `PadelJam` company, reuse it: cancel its onboarding issue, terminate its "Chief of Staff" agent before anything wakes it, and archive its "Onboarding" project.

- [ ] **Step 1 [Founder]: Open Paperclip from the Mac mini.** `ssh -N -L 3100:127.0.0.1:3100 joaopaulos4@agents-mac.local`, then `http://localhost:3100`.
- [ ] **Step 2 [Founder]: Create the company `PadelJam`** and set its goal, verbatim from the spec:

> Launch PadelJam, free, on the App Store and Google Play in Portugal and Brazil in January 2027, with every launched area working in pt-PT, pt-BR and en, a reviewed privacy policy and terms, and Jammer+, community plans and the club dashboard following after launch.

- [ ] **Step 3 [Founder]: Turn on board approval for hires.**
- [ ] **Step 4: Create the project `PadelJam app`** with a workspace at `/Users/agents/padeljam`: isolated checkouts, base ref `origin/main`, worktree parent `/Users/agents/padeljam-worktrees`. Every PadelJam task is attached to this project.
- [ ] **Step 5: Record the company and project ids** in the CEO's first status note (not in chat).

### Task 3: Create the five pilot agents

Create in this order; the CEO is first.

Paperclip gotchas found on 2026-10-30:
- With board approval on, agents are filed as hires (`POST /api/companies/<id>/agent-hires`) and the founder approves them. A pending hire's `adapterConfig` is frozen, so put the whole config, env included, in the hire request.
- A hire request blanks plain env values whose name contains `TOKEN`, and approving it then fails ("Refusing to persist redacted placeholder"). That's why the Twilio dummy is a secret ref.
- Instructions can be set while a hire is pending: `PUT /api/agents/<id>/instructions-bundle/file` with `path: AGENTS.md`, the content, and the current entry's `revision.id` as `baseRevisionId`.
- After approval each agent goes through a "verifying" step (Paperclip's Claude hello probe). It fails, and leaves the agent paused, if the agent's env has a `CLAUDE_CODE_OAUTH_TOKEN` secret ref, or if the `agents` account has no stored Claude login. With the stored login in place and no token in env, `POST /api/agents/<id>/lifecycle/retry` brings it to "ready".
- Every run gets Paperclip's own MCP servers, "Paperclip projects" and "Paperclip connections", even with `--strict-mcp-config`. Row 8 of Task 1, Step 6 checks the CLI alone; check in Task 5, Step 6 that no run filed a connection request.

- [ ] **Step 1 [Founder]: Agents → New Agent**, adapter **Claude Code (`claude_local`)**:

| Name | Title | Reports to | `model` | Heartbeat | `maxTurnsPerRun` |
|---|---|---|---|---|---|
| CEO | Chief Executive Officer | founder | `claude-opus-5-5` | on, `14400` s | 150 |
| CTO | Chief Technology Officer | CEO | `claude-opus-5-5` | on, `14400` s | 150 |
| Engineer A | Backend Engineer | CTO | `claude-sonnet-5-5` | off (wakes on assignment) | 300 |
| Engineer B | Mobile Engineer | CTO | `claude-sonnet-5-5` | off (wakes on assignment) | 300 |
| QA | QA Engineer | CTO | `claude-sonnet-5-5` | off (wakes on assignment) | 300 |

- [ ] **Step 2: Set the API-only adapter fields on all five** with `PATCH http://localhost:3100/api/agents/<id>` (it merges `adapterConfig`, but send the whole `env` object):
  - `cwd`: `/Users/agents/padeljam`
  - `workspaceStrategy`: `git_worktree`
  - `engine`: `cli`, `command`: `/Users/agents/.local/bin/claude`
  - `extraArgs`: `["--strict-mcp-config", "--disallowedTools", "RemoteTrigger,CronCreate,CronDelete,CronList,PushNotification,DesignSync"]`
  - `env`: `PORT=3200`, `WEB_PORT=3201`, and `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN` as a **secret ref** to a PadelJam secret holding `local_test_token`. No `CLAUDE_CODE_OAUTH_TOKEN`.

Expected: `GET /api/agents/<id>` shows those values for each (plain values read back as `***REDACTED***`, so always send real values). No Paperclip skill (agentmail, slack) is attached; the CEO gets Paperclip's five default skills, like TwoDo's CEO.

- [ ] **Step 3 [Founder]: Log Claude in on the `agents` account, then check each agent.** As `agents`: `claude`, `/login` with the subscription account, `/exit`, then `claude -p "Reply OK"` prints `OK`. Expected: the environment test passes and every agent is "ready" (see the gotchas above for "verifying").
- [ ] **Step 4: Paste the instructions.** On each agent's **Instructions** page, replace `AGENTS.md` with `docs/agents/<file>.md` + `_rules.md` appended: `ceo.md`, `cto.md`, `engineer-backend.md`, `engineer-mobile.md`, `qa.md`. **Save changes.**
- [ ] **Step 5: Set the budgets.** Audit → Budgets: each agent **$10**, warning at 80%, unpriced usage **`allow`**, hard stop **off**. (A cancelled subscription run with no receipt keeps a hard stop tripped until month end.)

### Task 4: Seed the pilot task

- [ ] **Step 1 [Founder]: Create an issue** in project `PadelJam app`, linked to the company goal, assigned to the **CEO**:

> **Title:** `create_event` invitees are scoped like `invite_to_event`
>
> **Why:** open item in `docs/audit/2026-09-29-ux-manage-event-plan.md`: on a group event, `create_event` accepts any live user as an invitee, while `invite_to_event` (0122) accepts group members only and refuses blocked players.
>
> **Acceptance:**
> 1. Migration `0146` makes `create_event` refuse, before writing anything, an invitee that `invite_to_event` would refuse, with the same codes: `user_not_found`, `blocked`, `not_group_member`. A standalone (no-group) event still accepts any live user, but refuses `user_not_found` and `blocked`.
> 2. A DB test in `infra/supabase/tests/` covers: a member invitee succeeds; a non-member, a blocked player and a deleted profile each refuse with their code and leave no event row.
> 3. Web and mobile Create Event show each code as translated copy (pt-PT, pt-BR, en) in their existing failure banner, not the generic error.
> 4. The CTO's hand-off includes the exact SQL to paste in the hosted dashboard and its `supabase_migrations.schema_migrations` row.
> 5. Branch `fix/create-event-invitee-scope`. No change outside `infra/`, `packages/`, `apps/web/`, `apps/mobile/` and one plan in `docs/superpowers/plans/`.

- [ ] **Step 2: Expected flow** (nobody steps in unless a gate is hit): CEO → CTO → CTO plan → Engineer A (migration, test, `packages/api` if needed, web copy) → Engineer B (mobile copy and unit test, on the same branch) → QA → CTO → founder: `Ready to merge: fix/create-event-invitee-scope`.

### Task 5: Run the pilot and check the gates

- [ ] **Step 1: Click Run now on the CEO.** Let heartbeats and assignments drive it for up to 4 days.
- [ ] **Step 2: Verify the hand-offs.** Expected in Paperclip: CEO → CTO → Engineer A → Engineer B → QA → CTO → founder, a comment at each step, and Engineer B's first run starting only after Engineer A's hand-off comment.
- [ ] **Step 3: Verify the work** from the Mac mini:

```bash
git fetch agents
git log --oneline main..agents/fix/create-event-invitee-scope
git diff main...agents/fix/create-event-invitee-scope --stat
```

Expected: one new migration `0146_*.sql`, a test under `infra/supabase/tests/`, i18n and failure-banner changes in `apps/web/` and `apps/mobile/`, a plan in `docs/superpowers/plans/`. Nothing else.

- [ ] **Step 4: Verify isolation.** On the agents Mac, `git worktree list` in `~/padeljam`. Expected: the work ran in worktrees under `/Users/agents/padeljam-worktrees`, not the main clone.
- [ ] **Step 5: Verify the web E2E ran on PadelJam.** QA's comment shows `e2e-web` output from `http://localhost:3201`. On the agents Mac, `lsof -iTCP:3100 -sTCP:LISTEN` shows only Paperclip.
- [ ] **Step 6: Check gate attempts.** Search the runs' transcripts for `git push`, `supabase link`, `db push`, `functions deploy`, `eas `, `vercel` and `wispuppglipffcsqowlq`. Expected: none, or attempted and failed.
- [ ] **Step 7: Check limit stalls.** For every run that stopped without a hand-off, record whether its log shows a subscription usage-limit message.
- [ ] **Step 8 [Founder]: Ship it.** On the Mac mini, run the eight CI checks on the branch, push it, open the PR **ready for review** (so `e2e-mobile` runs on your runner), merge when CI and the mobile E2E pass, then paste the CTO's hosted SQL in the dashboard and verify it on the objects, not the version table (`docs/audit/2026-09-20-state-and-next-steps.md`).

### Task 6: Pilot retro and go/no-go

**Files:** Create `docs/company/2026-11-XX-pilot-retro.md` (date of the retro).

- [ ] **Step 1: Write the retro.** What worked; where it got stuck and at which hand-off; usage-limit stalls counted separately; spend per agent from Audit → Budgets; whether the mobile E2E caught anything the agents missed; changes needed to the instructions; go/no-go for the rest of the team; whether to install Xcode on the agents Mac.
- [ ] **Step 2: Fold the fixes into `docs/agents/*.md`** and re-paste them in Paperclip.
- [ ] **Step 3: Set the CEO and CTO heartbeats to `86400`.**
- [ ] **Step 4: Commit** on a branch for the founder to push:

```bash
git add docs/company docs/agents
git commit -m "docs(company): pilot retro and instruction fixes"
```

- [ ] **Step 5:** On "go", write the next plan, **week 2: the full team on**: instructions for PM, Designer, Release & Ops, Head of Business, Growth and Legal; the CEO's launch-plan initiative; real budget caps from Step 1's spend.
