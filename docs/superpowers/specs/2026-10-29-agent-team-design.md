# PadelJam Agent Team — Design

**Date:** 2026-10-29
**Status:** Draft, founder answers folded in; pending approval
**Platform:** [Paperclip](https://github.com/paperclipai/paperclip) 2026.1023.0, the same self-hosted instance that runs TwoDo, Hbrows and Roblox Studio
**Template:** TwoDo's `docs/superpowers/specs/2026-10-27-agent-team-design.md`, adapted to PadelJam

## Intent

PadelJam is built by a team of AI agents in Paperclip, with the founder as the only human, acting as the board. The team covers building the product (product, design, engineering, QA, release) and the business around the launch (marketing, store listings, legal and privacy).

PadelJam is **pre-launch but far along**: an Expo app (iOS on TestFlight, build 18), a Next.js web app, Supabase (145 migrations, tenant RLS), Stream Chat, push and email. The team's job is to **launch it, free, in both app stores**, not to build new product lines. Paid plans and the club dashboard come after launch.

## Goals, non-goals, anti-goals

**Goals**
- Every piece of work has one owner, and you can see who asked for it and why (goal → task → agent).
- The repo's own workflow is how code gets made: **spec → plan → build → QA**, in `docs/superpowers/specs/`, `docs/superpowers/plans/` and `docs/audit/`.
- The founder spends time on decisions, not on managing agents one at a time.
- Spend stays predictable, and PadelJam doesn't starve the founder's other companies of the shared subscription.

**Non-goals**
- Billing (Jammer+, community plans, RevenueCat, Stripe) and the club-owner dashboard (`Structure Files/` specs 05, 06, 09, 10). They come after launch.
- Agents running the iOS or Android app. Mobile end-to-end tests run on the founder's self-hosted runner, not on the agents Mac (see "How mobile gets tested").
- Full autonomy, or building our own orchestration.

**Anti-goals** (failures even if everything "works")
- An agent emails, posts, publishes or submits anything to the outside world, including an App Store or Play submission, without approval.
- Code, a migration, an edge function or an over-the-air update reaches production without the founder.
- Data leaks across tenants, or the two-check rule (entitlement + permission, enforced on the server) is weakened. See `Structure Files/CLAUDE.md`.
- Agents produce work nobody asked for, burning the shared subscription on activity rather than progress.

## Approaches considered

1. **A full, adapted copy of TwoDo's docs in the PadelJam repo.** Every rule is rewritten for PadelJam's stack. Agents only have read access to their own repo, so the rules they follow have to live in it. The cost is that a fix to the shared rules has to be made in each repo.
2. **Shared generic rules plus a short PadelJam addendum.** Less to maintain, but agents read two files that can disagree, and PadelJam's differences (mobile-first, monorepo, tenancy) are too large for a short addendum.
3. **Export TwoDo's company from Paperclip and import it as PadelJam.** Fastest to create, but every agent would start with TwoDo's instructions and adapter config (`master`, `npm`, `/Users/agents/twodo`, household RLS) until each was fixed by hand.

**Chosen: 1** (founder's decision). Agents are created fresh in Paperclip, and their instructions are pasted from `docs/agents/`.

## Org chart

```
Founder (Board)
└── CEO
    ├── CTO
    │   ├── Product Manager
    │   ├── Product Designer
    │   ├── Engineer A (backend: Supabase, edge functions, packages/)
    │   ├── Engineer B (mobile: Expo app)
    │   ├── Engineer C (web: Next.js)                 off until after the pilot
    │   ├── QA Engineer
    │   └── Release & Ops
    └── Head of Business
        ├── Growth & Marketing
        ├── Legal & Privacy
        ├── Finance & Pricing                         off: free launch
        └── Customer Support                          off until launch
```

## The board: what always comes to the founder

No agent may do any of the following without the founder's explicit approval in Paperclip:

1. Merging to `main`, or deploying anything to production: Vercel, an EAS build or submit, an **EAS Update** (over-the-air JavaScript to installed apps), or an edge function deploy.
2. Running a migration, a seed or any SQL against a non-local database (the hosted project is administered through the Supabase dashboard; agents write the SQL, the founder pastes it).
3. Sending anything to people outside the team: email, social posts, waitlist messages, **App Store Connect or Play Console submissions, listings and review replies**.
4. Spending money or signing up for paid services; raising any agent's budget.
5. Publishing or changing legal text (privacy policy, terms of service, the stores' privacy labels and data-safety forms).
6. Setting or changing prices, including turning on any paid tier.
7. Adding or removing an agent, or changing someone's reporting line.
8. Changing the company goal or the quarter's priorities.

Everything else, agents decide within their role.

## Company goal

> Launch PadelJam, free, on the App Store and Google Play in Portugal and Brazil in January 2027, with every launched area working in pt-PT, pt-BR and en, a reviewed privacy policy and terms, and Jammer+, community plans and the club dashboard following after launch.

## Roles

Each role lists: **mission**, **responsibilities**, **owns** (where it may write), **hands off to**, **heartbeat**, **budget share** (percent of the company's monthly agent budget) and **status now**.

All agents use the Claude Code adapter (`claude_local`) pointed at the PadelJam repo. Business agents use the same repo and write under `docs/business/`.

### CEO
- **Mission:** turn the founder's goal into a prioritised plan and keep PadelJam moving toward the January launch.
- **Responsibilities:** break the goal into initiatives for the CTO and Head of Business; decide trade-offs (cut scope before slipping the date); write a status report (daily in the pilot, weekly after): done, in progress, blocked, decisions needed with a recommendation, spend; bring board-level decisions to the founder rather than making them.
- **Owns:** `docs/company/` (goals, roadmap, reports).
- **Hands off to:** CTO, Head of Business. Reports to the founder.
- **Heartbeat:** every 4 h in the pilot, then daily. **Budget:** 8%. **Status now:** pilot.

### CTO
- **Mission:** ship a reliable, secure PadelJam, and protect the architecture.
- **Responsibilities:** turn initiatives into tasks with acceptance criteria; decide the technical approach and approve every plan before an engineer builds; review every branch after QA and before it goes to the founder; guard the rules in `Structure Files/CLAUDE.md` (tenant scoping, the two-check rule, chat only through `packages/chat`, shared logic in `packages/`, New-Architecture-only native deps); write the hosted hand-off for every change that needs one (until Release & Ops is on).
- **Owns:** `docs/superpowers/plans/`, `Structure Files/CLAUDE.md` (keeping it true), code review.
- **Hands off to:** PM, Designer, Engineers, QA, Release & Ops.
- **Heartbeat:** every 4 h in the pilot, then daily. **Budget:** 10%. **Status now:** pilot.

### Product Manager
- **Mission:** the team builds the right things, in the right order, for padel players and community organisers in Portugal and Brazil.
- **Responsibilities:** keep the backlog; write specs in `docs/superpowers/specs/`; keep `Requirements/*.md` in step with decisions (the `.docx` originals are the founder's; amend the `.md` and note it); define **launch-ready** per area and cut or hide what won't be; turn QA findings and audit open items into backlog items.
- **Owns:** `docs/superpowers/specs/`, `Requirements/*.md`, the backlog in Paperclip.
- **Hands off to:** Designer, CTO.
- **Heartbeat:** daily. **Budget:** 7%. **Status now:** after the pilot.

### Product Designer
- **Mission:** PadelJam feels simple and consistent on a phone, in three locales, light and dark.
- **Responsibilities:** UX for specs; the design tokens in `packages/ui` and Storybook (both apps); copy in the i18n catalogues (pt-PT formal register, pt-BR, en); accessibility (VoiceOver labels, contrast); open design calls such as the dark-mode primary button token.
- **Owns:** `packages/ui/src/tokens/`, Storybook stories, design notes inside specs, copy wording.
- **Hands off to:** Engineer B, Engineer C, PM.
- **Heartbeat:** when assigned. **Budget:** 6%. **Status now:** after the pilot.

### Engineer A — backend
- **Mission:** correct, secure data and server logic.
- **Responsibilities:** migrations in `infra/supabase/migrations/` (next number, grants, RLS, `search_path` pinned on definer functions, no EXECUTE for roles that don't need it, following migrations 0133–0145); DB tests in `infra/supabase/tests/`; edge functions in `infra/supabase/functions/` with their node tests; shared logic in `packages/` (`api`, `db`, `authz`, `permissions`, `features`, `utils`); seeds in `infra/seed/`.
- **Owns:** `infra/`, `packages/` except `packages/ui`, `scripts/`.
- **Hands off to:** Engineer B or C (when the task has a client part), QA, CTO.
- **Heartbeat:** off; wakes on assignment. **Budget:** 14%. **Status now:** pilot.

### Engineer B — mobile
- **Mission:** the app that launches: fast, accessible and solid on real phones.
- **Responsibilities:** screens and components in `apps/mobile/`; i18n wiring in three locales; testIDs and accessibility labels that the founder's E2E harness (`apps/mobile/e2e`) reads; unit tests (Vitest); Android readiness (never tested on hardware or in E2E). It cannot run the app; it proves changes with unit tests, typecheck and the i18n and size checks, and says on hand-off what the E2E suite should cover.
- **Owns:** `apps/mobile/` (including `apps/mobile/e2e/suites` for new E2E cases).
- **Hands off to:** QA, CTO.
- **Heartbeat:** off; wakes on assignment. **Budget:** 14%. **Status now:** pilot.

### Engineer C — web
- **Mission:** the web app keeps parity for what launches, without slowing the store launch.
- **Responsibilities:** `apps/web/` pages and components; web i18n; the open web items (Vitest in `apps/web`, extending `i18n:check` to web).
- **Owns:** `apps/web/`.
- **Hands off to:** QA, CTO.
- **Heartbeat:** off; wakes on assignment. **Budget:** 0% now; 8% when switched on (from the reserve and Engineer A/B, decided at the post-pilot review). **Status now:** off until the pilot proves A and B. The CTO routes urgent web work to Engineer A in the meantime.

### QA Engineer
- **Mission:** nothing broken reaches the founder's merge button.
- **Responsibilities:** test every branch against its acceptance criteria; run CI's checks locally (see "Checks"); run `pnpm test:db` against the local stack for any change under `infra/`; run the web E2E (`e2e-web`) for web changes; review mobile changes by reading the diff and the unit tests, and name the E2E suites the founder's runner must pass; check tenant isolation and the two-check rule on every data change; after the pilot, a weekly bug hunt in the style of `docs/audit/`.
- **Owns:** `e2e-web/`, `docs/qa/`.
- **Hands off to:** Engineers (bugs), CTO (sign-off).
- **Heartbeat:** off; wakes on assignment, plus weekly after the pilot. **Budget:** 10%. **Status now:** pilot.

### Release & Ops
- **Mission:** get approved code to production and the stores safely.
- **Responsibilities:** for each release, a hand-off in `docs/handoff/`: migrations to paste (with the `schema_migrations` row), edge functions to redeploy, secrets the founder must set, the EAS build and submit commands, and the checks (`schema:check`, `verify-production-env`) to run after; the store submission drafts (listings and screenshots list in pt-PT, pt-BR, en; review notes; the seeded reviewer account) for the founder to submit; keep `docs/handoff/padeljam-remaining-setup.*` current. It never runs any of it.
- **Owns:** `docs/handoff/`, `.github/workflows/` (proposals only; the founder merges), release notes.
- **Hands off to:** the founder (every deploy and submission), CTO.
- **Heartbeat:** when assigned; daily after launch. **Budget:** 9% (TwoDo's 5% plus Finance's 4%). **Status now:** after the pilot.

### Head of Business
- **Mission:** PadelJam has a market, a store presence and a legal footing in Portugal and Brazil by launch.
- **Responsibilities:** turn CEO initiatives into business tasks; own the **launch plan** (date, checklist, who does what); consolidate business decisions for the founder.
- **Owns:** `docs/business/` (launch plan).
- **Hands off to:** Growth, Legal, Support.
- **Heartbeat:** weekly. **Budget:** 5%. **Status now:** after the pilot.

### Growth & Marketing
- **Mission:** find the first players and community organisers in Portugal and Brazil and get them playing on PadelJam.
- **Responsibilities:** positioning and competitor scan (Playtomic and the local club and WhatsApp-group ways people organise jams today); store listing copy and keywords (ASO) in pt-PT, pt-BR and en; launch content drafts; a seeding plan for the first communities.
- **Owns:** `docs/business/marketing/`.
- **Hands off to:** Head of Business; listing copy to Release & Ops. **Every outbound message goes to the founder.**
- **Heartbeat:** twice a week. **Budget:** 8%. **Status now:** after the pilot.

### Legal & Privacy
- **Mission:** players can trust PadelJam with their location, contacts, photos and chats.
- **Responsibilities:** drafts of the privacy policy and terms (the web app already has `/privacy` and `/terms`), flagged for human legal review; **GDPR** (Portugal) and **LGPD** (Brazil); the App Store privacy label and Play data-safety answers; a data inventory covering the third parties (Supabase, Stream, Resend, Expo, Sentry, Twilio, Nominatim); account deletion and retention requirements fed to the PM.
- **Owns:** `docs/business/legal/`.
- **Hands off to:** Head of Business; requirements to PM.
- **Heartbeat:** weekly. **Budget:** 6%. **Status now:** after the pilot.
- **Note:** it drafts and flags; it is not a lawyer.

### Finance & Pricing
- Off: the launch is free. Switched on before paid plans (a board decision). **Budget:** 0%.

### Customer Support
- Off until launch; then the support tickets (`support_tickets` table) and help articles in three locales. **Budget:** 0% now.

**Budget total:** 97% of the company budget, with 3% held in reserve.

## How mobile gets tested

The agents Mac has no Xcode, and the iOS E2E harness drives a simulator, so agents never run the phone app (founder's decision). Instead:

- Engineer B proves a mobile change with unit tests, typecheck, lint, `i18n:check` and `size:check`, and names the E2E suites that cover it.
- QA reviews the diff against the acceptance criteria and checks those suites cover it.
- The founder pushes the branch and marks the PR ready; the self-hosted runner on the founder's Mac runs `e2e-mobile` (about 90 minutes). A red run goes back to Engineer B as a bug with the log.

**Review after the pilot:** if mobile bugs keep getting past QA, install Xcode on the agents Mac (about 40 GB, a simulator per run).

## Checks

CI's `check` job runs eight commands. Agents run seven of them before every hand-off:

```bash
pnpm lint && pnpm typecheck && pnpm tokens:check && pnpm i18n:check \
  && pnpm size:check && pnpm test && pnpm test:functions
```

`pnpm schema:check` is left to CI: it probes the production project, and agents touch nothing hosted. `pnpm test:db` (needs the local stack) runs for any change under `infra/`.

## How work flows

### A product change
1. Founder or CEO sets a goal → CEO creates an initiative for the CTO.
2. PM writes the spec (CTO in the pilot) → Designer adds UX → CTO approves.
3. CTO writes or approves the plan in `docs/superpowers/plans/`.
4. Engineers build on their **own branch** (`feat/<topic>` or `fix/<topic>`), in their own worktree, with tests. When a task has a backend and a client part, Engineer A goes first on the branch and hands it to Engineer B or C, who build on top of it. Agents can't push.
5. QA tests → CTO reviews and writes the hosted hand-off → the task comes to the founder as `Ready to merge: <branch>`.
6. The founder pushes, opens the PR, lets CI and the mobile E2E run, merges, then applies the hosted hand-off.

### A business deliverable
1. CEO sets an initiative for the Head of Business.
2. The owning agent drafts it in `docs/business/…`.
3. Head of Business reviews → anything public, legal or store-related goes to the founder.

### Rules that keep agents from colliding
- One owner per task. Only the owner writes; others comment.
- Engineers never commit to `main`. Two engineers share a branch only in sequence, handed over on the task.
- Agents write only inside the areas their role owns; they open a task for the owner to change anything else.
- Every task links back to the goal. No goal, no work.

## Pilot

**Agents:** CEO, CTO, Engineer A, Engineer B, QA. **Length:** 3–4 days.

**Task:** an open item from `docs/audit/2026-09-29-ux-manage-event-plan.md`:

> `create_event` invitees are not scoped like `invite_to_event` (any live user on a group event).

Engineer A writes migration 0146 so `create_event` applies the same invitee rule as `invite_to_event` (members only, blocks respected) and refuses with a named error, plus a DB test. Both apps call it through `packages/api` (`events/mutations.ts`), so Engineer A also makes the **web** Create Event flow show that error in three locales (founder's decision; Engineer C is off). Engineer B then makes the mobile Create Event flow show it in three locales, with a unit test. QA runs the checks, `test:db` and the web E2E (`e2e-web` on `WEB_PORT=3201`). The CTO reviews and writes the hosted hand-off (the SQL to paste and its `schema_migrations` row). The founder's runner runs the mobile E2E on the PR.

It proves: the backend → web → mobile hand-off on one branch, the web E2E on the agents Mac away from Paperclip's port, a mobile change caught by the founder's runner rather than the agents, and board gate 2 (agents prepare a hosted migration; the founder applies it).

## Rollout

- **Week 1 (from approval): pilot.** The five agents above, one task end to end. Retro and go/no-go.
- **Week 2: everyone else on.** PM, Designer, Release & Ops, Head of Business, Growth, Legal. The CEO's first output is the launch plan with a target date in January; the PM's is a launch-ready checklist per area (auth, onboarding, home, explore, communities, groups, events, live event, chat, profile, notifications), with anything that won't be ready cut or hidden; Release & Ops's is the store-readiness gap list (Android especially).
- **Weeks 3–8: build and prepare.** Launch blockers, a hardware pass on both platforms (founder), Android store build, listings, privacy label, legal drafts to human review.
- **Weeks 9–10: freeze and submit.** Fixes only; Support on to write help articles; the founder submits to both stores with time for review before the launch date.
- **After launch:** Support handles tickets, Release & Ops goes daily, and Finance & Pricing comes on for paid plans.

**Risk:** store review and human legal review both sit outside the team's control. If either isn't done, launch as a TestFlight / Play closed-testing beta rather than slipping the public date silently.

## Budget and the shared subscription

- Agents run on the founder's Claude subscription through the same `CLAUDE_CODE_OAUTH_TOKEN` secret as every other company (founder's decision). PadelJam's agents draw on the **same usage limits** as TwoDo, Hbrows and Roblox Studio; if one company exhausts them, all stop until they reset.
- So the pilot runs with five agents only, CEO and CTO heartbeats every 4 hours, and no other company's pilot at the same time. The other companies keep running as they are (founder's decision). When a PadelJam run stalls, check first whether it hit the subscription's usage limit (the run's log says so) before treating it as a hand-off failure; the retro reports limit hits separately.
- Paperclip budgets are a warning, not a stop: on subscription billing a cancelled run with no receipt stays "awaiting accounting" and keeps a hard stop tripped until month end (seen in TwoDo). Each pilot agent gets a $10 cap with a warning at 80%, unpriced usage set to `allow` and the hard stop off.
- Models: Opus 5.5 for CEO and CTO, Sonnet 5.5 for everyone else.

## Runtime differences from TwoDo (for the builder)

- Repo at `/Users/agents/padeljam`, deploy key `~/.ssh/padeljam_deploy`, alias `Host github-padeljam`, push URL `DISABLED`; base ref `origin/main`; worktrees under `/Users/agents/padeljam-worktrees`.
- Node **22** (`.nvmrc`), pnpm 10.30.3 through corepack; `pnpm install --frozen-lockfile`.
- Supabase CLI through `pnpm dlx supabase@2.117.0 --workdir infra`; local ports 55320–55329 (clear of TwoDo's 543xx and Paperclip's 54329). Agents run `start`, `db reset` and `migration up` locally only.
- **Port 3100 is Paperclip's.** The web E2E config defaults to `WEB_PORT=3100` and reuses a server already listening there, so it would test against Paperclip. Every PadelJam agent gets `WEB_PORT=3201` and `PORT=3200` in its env.
- The agents' `.env` holds only the local stack's keys. No hosted Supabase key, no Stream, Resend, Twilio, Sentry, Apple or Google values; chat and email can't be exercised locally, and that's expected.
- No `eas`, `vercel` or `gh` login on the agents Mac.
- `apps/mobile/eas.json` holds the hosted project's URL and publishable key, so the repo itself lets an agent reach production as a public user. The hosted project's host is blocked on the agents Mac, and the boundary check proves it (my call; detail in the pilot plan).

## Left to the builder

- Exact Paperclip configuration (adapter fields set through `PATCH /api/agents/<id>`, heartbeat syntax, the project workspace), checked against the installed version as in TwoDo's pilot plan.
- The written instructions for each agent, derived from its role section above and `docs/agents/_rules.md`.
