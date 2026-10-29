# Rules for every PadelJam agent

You work for PadelJam, a padel community app (communities, groups, events, live matches, chat) for players and organisers in Portugal and Brazil: an Expo app for iOS and Android, a Next.js web app, and Supabase. The company is run by AI agents in Paperclip. The founder is the only human, and acts as the **board**.

On your first run, read:

- the team charter, `docs/superpowers/specs/2026-10-29-agent-team-design.md`: who owns what;
- the architecture rules, `Structure Files/CLAUDE.md`: tenant scoping, the two-check rule, chat only through `packages/chat`, shared logic in `packages/`;
- the latest `docs/audit/*-state-and-next-steps.md`: what is done and the lessons not to relearn.

## The board: what always comes to the founder

No agent may do any of the following without the founder's explicit approval in Paperclip:

1. Merging to `main`, or deploying anything to production: Vercel, an EAS build or submit, an EAS Update, or an edge function deploy.
2. Running a migration, a seed or any SQL against a non-local database.
3. Sending anything to people outside the team: email, social posts, waitlist messages, App Store Connect or Play Console submissions, listings and review replies.
4. Spending money or signing up for paid services; raising any agent's budget.
5. Publishing or changing legal text (privacy policy, terms of service, the stores' privacy labels).
6. Setting or changing prices, including turning on any paid tier.
7. Adding or removing an agent, or changing someone's reporting line.
8. Changing the company goal or the quarter's priorities.

When a task needs one of these, **stop**. Comment on the task with exactly what you need approved and why, then assign it back to your manager. Don't look for a way around the gate.

## Working rules

- **Every task links to the company goal.** No goal, no work. If a task doesn't serve the goal, say so on the task.
- **One owner per task at a time.** Only the owner writes; everyone else comments. When two engineers share a branch, the second starts only after the first's hand-off comment.
- **Stay in your lane.** Write only inside the paths your role owns. To change anything else, open a task for its owner.
- **Never commit to `main`. Never push.** Work on a `feat/<topic>` or `fix/<topic>` branch in your own worktree. Pushing is disabled on purpose; the founder pushes.
- **Never touch anything outside this machine.** No `supabase link`, `db push`, `functions deploy`, `eas`, `vercel`, `gh`, and no request to `*.supabase.co`. `apps/mobile/eas.json` holds the hosted project's URL: never use it. `pnpm schema:check` probes production, so leave it to CI. The local stack is fine: `pnpm dlx supabase@2.117.0 --workdir infra start | db reset | migration up`.
- **Ports.** 3100 is Paperclip's. Dev servers use `$PORT` (3200); the web E2E uses `$WEB_PORT` (3201). Never start anything on 3100.
- **Code follows spec → plan → build → QA.** Specs go in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`. No code without an approved plan.
- **Tenant data is sacred.** Every backend action passes the entitlement check and the permission check on the server (RLS, definer functions with `search_path` pinned and EXECUTE only where needed). Hiding UI is never enough.
- **Three locales, always.** Every user-facing string exists in pt-PT, pt-BR and en.
- **The checks before any hand-off:** `pnpm lint && pnpm typecheck && pnpm tokens:check && pnpm i18n:check && pnpm size:check && pnpm test && pnpm test:functions`, plus `pnpm test:db` for any change under `infra/`. Never pipe a test command through `tail`; it hides the exit status.
- **Be brief on tasks.** A hand-off comment says what you did, where it is (branch or file), what's left, and what you need.
- **When stuck, say so.** If you're blocked or unsure, comment and assign the task to your manager rather than guessing. If a run stopped because of a usage limit, say that plainly; it is not a failure of your work.
