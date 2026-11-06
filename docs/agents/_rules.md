# Rules for every PadelJam agent

You work for PadelJam, a padel community app (communities, groups, events, live matches, chat) for players and organisers in Portugal and Brazil: an Expo app for iOS and Android, a Next.js web app, and Supabase. The company is run by AI agents in Paperclip. The founder is the only human, and acts as the **board**.

On your first run, read:

- the team charter, `docs/superpowers/specs/2026-10-29-agent-team-design.md`: who owns what;
- the architecture rules, `Structure Files/CLAUDE.md`: tenant scoping, the two-check rule, chat only through `packages/chat`, shared logic in `packages/`;
- the latest `docs/audit/*-state-and-next-steps.md`: what is done and the lessons not to relearn.

## The board: what always comes to the founder

No agent may do any of the following without the founder's explicit approval in Paperclip:

1. Merging to `main`, except by the CTO as described in the CTO role (the Vercel deploy a merge triggers is covered). Deploying anything else to production still needs approval: an EAS build or submit, an EAS Update, or an edge function deploy.
2. Running a migration, a seed or any SQL against a non-local database yourself. Once `.github/workflows/supabase-migrations.yml` is on `main`, migrations reach the hosted database only through it, when their PR merges. A migration it holds (one that drops, truncates or deletes data, or a hosted history out of sync) still goes to the founder, and so does any seed or one-off SQL.
3. Sending anything to people outside the team: email, social posts, waitlist messages, App Store Connect or Play Console submissions, listings and review replies.
4. Spending money or signing up for paid services; raising any agent's budget.
5. Publishing or changing legal text (privacy policy, terms of service, the stores' privacy labels).
6. Setting or changing prices, including turning on any paid tier.
7. Adding or removing an agent, or changing someone's reporting line.
8. Changing the company goal or the quarter's priorities.

When a task needs one of these, **stop**. Don't look for a way around the gate.

## Anything you need from the founder becomes a task for them

Whenever you need the founder for anything (a gate above, a decision, a merge or push, a Composio or other approval, a step on their Mac or the runner, a hosted step), create a task for them. A comment, a confirmation card or an approval on its own isn't enough; the founder works from their task list.

1. **Create the task.** Assign it to the founder (`assigneeUserId: "local-board"`), link it to the company goal, and make your blocked task its parent. Title it `Founder: <what you need, in a few words>`. Don't open a second one while one for the same thing is still open; add to it instead.
2. **Write it as a step-by-step guide** the founder can follow cold, without reading your task:
   - **Why:** one or two lines on what is blocked and what happens once it's done.
   - **Decision** (only if you need one): the options, and your recommendation with the reason.
   - **Steps:** a numbered list. One action per step: where to click, or the exact command in a code block with the folder to run it in. After each step, say what they should see when it worked and what to do if it didn't.
   - **When you're done:** exactly how to hand back, e.g. "mark this task done" or "comment with your choice, then mark it done".
3. **Link any approval or card.** If the step also needs a formal approval or a confirmation card (every Composio tool call does), link them in the steps and say the order: approve the formal approval first, then accept the card, both within the hour, because the connection's token refreshes about hourly and a stale card fails.
4. **Block your own task on it.** Set your task to `blocked` with the founder task in `blockedByIssueIds`, comment with the link, and exit. Paperclip wakes you when the founder marks their task done. If they comment instead, read the comment and carry on.

## Working rules

- **Every task links to the company goal.** No goal, no work. If a task doesn't serve the goal, say so on the task.
- **One owner per task at a time.** Only the owner writes; everyone else comments. When two engineers share a branch, the second starts only after the first's hand-off task reaches them.
- **Stay in your lane.** Write only inside the paths your role owns. To change anything else, open a task for its owner.
- **Never commit or push to `main`.** Work on a `feat/<topic>` or `fix/<topic>` branch in your own worktree, push that branch, and open a pull request with `gh pr create`. `gh` is at `/usr/local/bin/gh`. Never force-push, and never edit `.github/workflows/`. Only the CTO merges.
- **Never touch anything outside this machine, except GitHub** (`git push` of your branch, `gh pr`). No `supabase link`, `db push`, `functions deploy`, `eas`, `vercel`, no `gh` beyond PRs and checks, and no request to `*.supabase.co`. `apps/mobile/eas.json` holds the hosted project's URL: never use it. `pnpm schema:check` probes production, so leave it to CI.
- **Ports.** 3100 is Paperclip's. Dev servers use `$PORT` (3200); the web E2E uses `$WEB_PORT` (3201). Never start anything on 3100.
- **Local database stacks: your own, two at most across all companies on this Mac, stopped when the task ends.** Founder's rule, 5 Nov: out of memory and load past 700 cut off agents in every company. Run bare, `supabase` uses project `padeljam` on 5532x, and another product holds those ports, so a bare `db reset` removes the `padeljam` database container and then fails on the port.
  - `/Users/Shared/paperclip-ops/stack-slot status` shows what's up. PadelJam's stacks are `padeljam` and `pad<number>`. `padeljam_ci` is the e2e runner's, and any other name belongs to another company: never touch those.
  - If a PadelJam stack is idle, free its slot: check that no live run uses it (its database's `pg_stat_activity`, and live run logs for its name, since the name may not be the user's task), then `docker stop $(docker ps -q --filter label=com.supabase.cli.project=pad<number>)` and `stack-slot release pad<number>`. Its data is kept.
  - Before any `supabase` command, export `SUPABASE_PROJECT_ID=pad<task number>`, `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token` and your own `SUPABASE_API_PORT`, `SUPABASE_DB_PORT`, `SUPABASE_DB_SHADOW_PORT`, `SUPABASE_STUDIO_PORT`, `SUPABASE_LOCAL_SMTP_PORT`, `SUPABASE_ANALYTICS_PORT` and `SUPABASE_DB_POOLER_PORT` from an unused range such as 57xxx or 58xxx (check `docker ps`), plus `SUPABASE_EDGE_RUNTIME_INSPECTOR_PORT` (not 8083 or 8183). Then use `pnpm dlx supabase@2.117.0 --workdir infra db reset | migration up`.
  - Start a stack only through the slot script, with the lean set: `/Users/Shared/paperclip-ops/stack-slot start pad<number> --wait 540 -- pnpm dlx supabase@2.117.0 --workdir infra start -x studio,logflare,vector,supavisor,imgproxy`. A direct `supabase start` is refused. The script waits for a free slot and reuses yours if your stack is up. Keep `--wait` under your shell tool's timeout (10 minutes at most). Keep the edge runtime: three `pnpm test:db` files call edge functions and fail with 503 without it. The mobile E2E uses `scripts/e2e/ci-stack.mjs`, which starts the full stack.
  - **Exit 75 means no slot came free and nothing started. That's "not run", not a test failure:** don't run the tests, don't report a red, and don't go around the script. Say so on the task and wait with a monitor (see **Waiting**). Chain with `&&` so `pnpm test:db` can't run against nothing.
  - Never use 543xx, 553xx or 563xx: they belong to other products and the e2e runner, even when they look free. A stack on 5632x fails the e2e job before any suite runs.
  - Before `pnpm test:db`, set `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` from `status -o env` (`API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`). Left unset, the tests can run against 55321, which is another product's stack.
  - Before you hand off, block or finish your task, stop your stack with the same exports, `pnpm dlx supabase@2.117.0 --workdir infra stop`, adding `--no-backup` to delete its data if no later step needs it. Then run `stack-slot release pad<number>`.
  - If a stack you didn't start breaks, never restore it: open a task for the CTO.
- **Never leave a background task running when you end your turn.** Paperclip kills anything still running when the run ends and marks the run failed (`adapter_failed`, exit 143). To wait on something, see **Waiting** below.
- **Code follows spec → plan → build → QA.** Specs go in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`. No code without an approved plan.
- **Tenant data is sacred.** Every backend action passes the entitlement check and the permission check on the server (RLS, definer functions with `search_path` pinned and EXECUTE only where needed). Hiding UI is never enough.
- **Three locales, always.** Every user-facing string exists in pt-PT, pt-BR and en.
- **The checks before any hand-off:** `pnpm lint && pnpm typecheck && pnpm tokens:check && pnpm i18n:check && pnpm size:check && pnpm test && pnpm test:functions`, plus `pnpm test:db` for any change under `infra/`. Never pipe a test command through `tail`; it hides the exit status.
- **Be brief on tasks.** A hand-off comment says what you did, where it is (branch or file), what's left, and what you need.
- **When stuck, say so.** If you're blocked or unsure, create a task for your manager (see **Hand-offs**) rather than guessing. If a run stopped because of a usage limit, say that plainly; it is not a failure of your work.

## Hand-offs

**Don't reassign a task your run is working on.** Paperclip cancels your run first, so you can't check anything afterwards, and the wake to the new owner was lost 25 times out of 36. A task created with an owner woke that owner every time (27 of 27). So a hand-off is a new task:

1. **Create a child task for the next owner:** `POST /api/companies/{companyId}/issues` with `parentId` (your task), `goalId`, `assigneeAgentId` and `status: "todo"`. Title it `<Role>: <what>`, e.g. `QA: test #304`. The description is the whole hand-off, written so they can start without reading your task: the branch or file, what you did, the commands you ran and their results, what you need from them, and how to finish.
2. **Check it landed:** `GET /api/issues/{childId}/runs` should show a run with their `agentId` within seconds (your own run is listed too). If it's empty, look again once. If it's still empty, comment on the child, because a comment from anyone but the owner wakes them. Say so in step 3.
3. **Block your task on it:** set your task to `blocked` with the child in `blockedByIssueIds`, comment with the link, and exit. Paperclip wakes you when the child is `done`.

**When you get a hand-off:** do the work on the task you were given, put the result in a comment there, and mark it `done`. A failed review or QA run is still `done`: the verdict is the deliverable. Don't reassign it, and don't write on the parent. Marking it done wakes the sender, who decides what's next.

**So one PR goes:** the engineer creates a QA task. QA passes it and marks it done. The engineer wakes and creates a CTO review task. The CTO merges, comments `Shipped:` and marks it done. The engineer wakes and marks their own task done. On a fail, the engineer fixes it and creates a new task. **A task with a PR stays open until the PR merges.**

**Handing over a task for good** (you're the wrong owner, and it isn't coming back): put the full hand-off comment and the new assignee in one `PATCH`, as the last action of your run. Nothing after it runs, and you can't check it. The CTO's hand-off check catches it if it doesn't land.

**If you need another agent's decision,** that's a task for them too. A card or a mention on a task someone else holds doesn't reach them.

**The check:** the CTO runs `scripts/ops/handoff-check.mjs` every hour. A `Hand-off check:` comment on your task means a hand-off to you was stranded, so pick the task up.

## Waiting

**To wait on CI or anything else outside Paperclip, set an issue monitor.** It's the only thing that survives your run. This is for waiting on something outside Paperclip; to wait on another task, block on it as in **Hand-offs**. Keep the task `in_progress` and `PATCH` it:

```json
{ "executionPolicy": { "monitor": { "kind": "external_service", "serviceName": "github-actions", "externalRef": "<run URL>", "nextCheckAt": "<ISO time>", "timeoutAt": "<ISO time>", "maxAttempts": 6, "notes": "What to do on green and on red" } } }
```

Check that the response has a non-null `monitorNextCheckAt`, then exit. When it wakes you, check once, then set the next one or move on. A monitor needs the task assigned to you and `in_progress` or `in_review`: it never fires on a `blocked` task.

- **These don't work:** a background command, Claude Code's own `Monitor` or `ScheduleWakeup`, or `sleep`. They all end with your run.
- **Don't write "I'll check on my next heartbeat".** The engineers and QA have no timer, and the CEO's and CTO's are hours apart. The next run only comes from a monitor, a comment or a blocker.
- **A long queue isn't a fault.** One runner runs one job at a time, at 70-90 minutes each. Don't open a task about it.

## Stopping processes

Every agent runs under one Mac account, along with the Paperclip server. A broad kill can stop Paperclip and other agents' work, as happened on 3 Nov 2026.

- Stop only what you started. Save the PID when you start a process (`cmd & echo $! > /tmp/<task>.pid`), then `kill` that PID.
- Never use `killall`, `kill -1`, or `pkill` with `-u` or a short, broad pattern.
- If you do use `pkill` or `pgrep`, put every option before the search text, and check the match first with `pgrep -lf "<search text>"`. On macOS, anything after the search text counts as more search text, so `pkill -f "next dev" -u agents` stops every process with "agents" in its command line.
- Ports 3100 and 54329 belong to Paperclip and its database. Never stop whatever is on them, and don't start your own server on them.
