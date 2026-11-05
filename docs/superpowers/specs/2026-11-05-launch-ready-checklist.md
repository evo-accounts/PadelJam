# Launch-ready checklist, per area

**Date:** 2026-11-05 · **Author:** Product Manager ([PAD-120](/PAD/issues/PAD-120)) · **Status:** proposal, for the CTO's review. The cuts and hides below are proposals until the CTO and the founder have read them.
**Goal:** launch PadelJam, free, on the App Store and Google Play in Portugal and Brazil in January 2027, with every launched area working in pt-PT, pt-BR and en. The date holds; scope gives way (`docs/company/roadmap.md`).
**Out of scope:** billing (Jammer+, community plans, RevenueCat, Stripe) and the club dashboard.

## How to read this

**Evidence limits.** I read code, specs, audit docs, git history and the E2E suite list. I did not run anything. There has been **no device pass since #129**; [PAD-32](/PAD/issues/PAD-32) hasn't started. The onboarding redesign is on `main` but no build has it. So nothing below is marked "ready". The status words are:

| Status | Meaning |
|---|---|
| **Built, E2E-covered** | On `main`; a simulator suite in `apps/mobile/e2e/suites/` walks it. Not seen on a device. |
| **Built, not covered** | On `main`; no suite, or only unit/SQL tests. |
| **Unverified** | I couldn't confirm it from the repo. Someone has to check, and I say who. |
| **Not built** | Doesn't exist. |

Every "must be true" line is written so the CTO or QA can check it from the code, a test or the founder's device pass. Lines tagged **[device]** can only be confirmed on hardware, so they go on the founder's device pass ([PAD-32](/PAD/issues/PAD-32)); I'm not asking QA for them.

**Launch criteria that apply to every area** (not repeated below):
- **L1.** Every user-facing string exists in pt-PT, pt-BR and en. `pnpm i18n:check` passes (mobile only: see gap G2).
- **L2.** Every write is checked on the server for entitlement and permission (the two-check rule). Hiding UI is never the check.
- **L3.** `check` and the area's E2E suite are green on the release candidate.
- **L4.** The area works on both iOS and Android **[device]**. No Android pass is on record at all (Release & Ops owns the Android gap list).
- **L5.** No screen shows a price, a purchase button or a promise of one (see decision D1).

---

## 1. Launch-ready, per area

### 1.1 Auth

**Must be true**
1. A new user can sign up and a returning user can sign in with email OTP, with phone OTP, with Apple and with Google; password sign-in and password recovery work (`(auth)/*`, suite 01).
2. **Phone OTP sends a real SMS in Portugal and Brazil.** Hosted needs Twilio credentials, a Messaging Service and a registered Brazil sender (`docs/handoff/sms-production-setup.md`).
3. **Email OTP and recovery emails arrive from the hosted project**, in the user's language.
4. Sign in with Apple is offered wherever Google is (store rule), and works on Android or fails softly.
5. A signed-in user can delete their account from Settings (store rule), including the sole-community-admin refusal message.
6. Terms and Privacy links open the published documents (not a placeholder).
7. Session survives a relaunch, and a user who quits onboarding resumes where they left off.

**Today.** Built, E2E-covered (suite 01, 98; account deletion in suite 12). Social sign-in, password rules, recovery, account deletion and session-loss handling all merged before September.
**Evidence for the gaps:**
- *SMS:* the hand-off doc says "No SMS has ever been sent by this project" and was last touched 2026-09-15. I found nothing since saying the Twilio setup was done. **Unverified.** Twilio is a paid service, so this is a gate-4 decision for the founder, with a Brazil sender registration lead time. This is the biggest auth risk to the January date.
- *Email:* the local edge runtime has no email provider (`email_not_configured`, Manage Event plan, "Blast emails untested"). Hosted delivery of OTP and recovery mail is **unverified** from the repo.
- *Android:* `81be686` made the Android Apple provision non-fatal, which implies Apple sign-in on Android is known to be awkward. **Unverified** on a device.
- *Terms/Privacy:* the URLs are centralised (`lib/externalUrls.ts`); whether the pages they point to carry the reviewed text is Legal's and the founder's call (gate 5).

### 1.2 Onboarding

**Must be true**
1. After sign-up the user passes location, level, hand, court side, notifications and the Jammer+ screen in order, with the skip rules in `docs/superpowers/specs/2026-11-02-onboarding-redesign.md` §2 (level/hand/side required; location and notifications skippable), and lands on Home.
2. A failed save never traps the user (rule 6 of that spec).
3. **Level is only collected once the privacy policy and store labels cover it** ([PAD-65](/PAD/issues/PAD-65), [PAD-64](/PAD/issues/PAD-64), gate 5). `profiles.level` (0148) must be applied to hosted **before** the build that reads it ships, or every launch fails routing (spec §5.3).
4. The Jammer+ screen promises nothing that isn't true: no price, no trial, no reminder (spec §4.7). Decision D1 applies.
5. Three locales; VoiceOver can page the steps.

**Today.** Built, E2E-covered by suites 02 and 02-onboarding-screens (#302, #307), all four PRs on `main` (#294, #304, #303, #295). **No build has it and none of it has run on a device**, so layout, illustrations and the OS permission alerts are **unverified**. The Level step has no Skip by design; whether that suits players who don't know their level is a UX question for the Designer.
**Evidence:** `docs/company/roadmap.md` initiative 3; migration `0148_profiles_level.sql` exists locally and the hosted state is not stated anywhere I could read.

### 1.3 Home

**Must be true**
1. Header has Chat and Notifications only; quick actions, Next Events and My Groups rails render with their empty states ("Find events", "Find groups"); the create-event FAB sits above the tab bar (UX-HOME-01, `home.md` v1.1).
2. A brand-new user with no communities sees a useful Home, not a blank one.
3. Web Home shows the same rails; a not-onboarded web user is sent to "finish in the app" (#270).

**Today.** Built, E2E-covered (suite 03). Web done (W1, #254). Mobile M1 is on `main` but reaches users only with the next TestFlight build.
**Evidence:** `docs/audit/2026-09-29-ux-home-explore-plan.md` status table; #270.

### 1.4 Explore and search

**Must be true**
1. Rails (Players, Events, Communities, Groups) show only what the viewer can see, exclude blocked users in both directions, and each card's action (Follow, Join, Request, Requested, Open) reflects the real state.
2. Search returns the whole set on the server (not loaded pages), is accent-insensitive, and filters work per tab.
3. Anonymous callers cannot read any `explore_*` or `search_*` RPC (0128 closed `anon`).
4. Distance sorting behaves when a profile has no location point (the web disables the control with a hint).

**Today.** Built, E2E-covered (suite 03, updated by #259, #272). Hosted was current through 0130 on 2026-09-30.
**Unverified:** the Filter sheet's scroll on a real device (the plan saw quick flicks fail in the simulator); the geocode edge function is built (`infra/supabase/functions/geocode`) but its deploy is a hosted step I can't see the result of. Without it, web address Search shows an error line. Note: communities created before 0128 have no map point and sort last on Distance.

### 1.5 Communities

**Must be true**
1. A user can create a community, preview one they haven't joined, and join according to its privacy (public: join; request: request and cancel; private: invite only). The rules acceptance is recorded once on the membership row.
2. Two roles (admin, member) and five permissions are enforced on the server; the last admin cannot leave, be demoted or removed (0098, 0099).
3. Posts, reviews (after three completed events), members, requests, invite, leave, archive and unarchive work; archived content is hidden from members at the database layer.
4. Manage screens (settings, permissions, groups, members) work for admins.
5. Plan limits (groups, co-organizers, recurring events) block creation with an upgrade prompt that follows decision D1.

**Today.** Built, E2E-covered (suites 09 and 11). The Community plan is 11 of 11 complete (`2026-09-20-state-and-next-steps.md`).
**Evidence for the gaps:** the same state doc says the community preview, both review surfaces, the two header menus, Manage Groups, the invite rewrite, QR download and the first swipe gestures (`SwipeRow`) have never run on hardware. **[device]**: native share sheet, clipboard, photo-library permission for the QR download, `expo-media-library` writes, keyboard behind pinned footers, swipe gestures.

### 1.6 Groups

**Must be true**
1. Create, settings, join (public), invitation preview/accept/decline (private), leave with the sole-admin check before the confirm sheet, archive/unarchive, and "Your groups" all work (UX-GRP-01..15).
2. Nobody can insert themselves into a private group, or bypass the leave guard, by writing the table (0107).
3. The ranking shows Points / W / L with departed players greyed; "Reset ranking" closes the season and starts a new one; past seasons are viewable.
4. Archiving cancels upcoming events through `cancel_event` (participants are told) and refuses the last active group.

**Today.** Built, E2E-covered (suite 10). Migrations 0107–0110 and mobile #199/#200 and web #202 are merged. The default group now gets a season on creation (B3).
**Unverified:** I found no status table in the Groups plan, so I confirmed "shipped" from the merge history rather than from a record. Group preset thumbnails are upload-only (artwork blocked, decision 11).

### 1.7 Events (create, join, manage)

**Must be true**
1. An organizer can create a one-off or recurring event through the wizard (group or no group; Americano, Mexicano, Up & Down × Classic, Mixed, Team), edit it, duplicate it and cancel it.
2. A player can join, join with a partner (or as a guest's partner), leave before the 12 h cut-off, claim a waiting-list spot, accept or decline an invitation, add to calendar and share.
3. The server enforces the 6 h confirm and 12 h leave cut-offs, capacity, per-gender halves in Mixed events, and no organizer-side direct writes to `events`/`event_invitations` (0111–0113, 0121, 0122).
4. The organizer's dashboard works: confirm/remove, invite, payments, blasts (plan-gated), activity log, pending actions, next occurrences (recurring).
5. Recurring events materialise on their own (`pg_cron` hourly job from 0117; the extension must be on in hosted).
6. A phone number is never readable by other users (0115).

**Today.** Built, E2E-covered (suites 04, 05, 06, 08). All of the Create & Join plan (M1–M5, W1–W5, migrations 0111–0118) and the Manage Event plan (0121–0127, M1–M5, W1–W5) is merged.
**Unverified:**
- *Blast email delivery.* The Manage Event plan says delivery "was only seen failing and retrying" locally; no end-to-end send is on record. Blasts are a paid-plan feature, so (see D1) this is either verified before launch or hidden.
- *Hosted state after 0127.* I can't tell from the repo whether `pg_cron` is enabled and whether 0121–0127 and the `send-push`/`send-blast` redeploys have been applied; the 09-30 notes said hosted was current through 0130.
- *Team drag and drop* has no E2E (the "+" path does). **[device]**
- *Add to calendar* uses `expo-calendar`, a native module: **[device]** on both OSes, including the Android permission prompt (`READ_CALENDAR`/`WRITE_CALENDAR` are in `app.json`, which also touches the store data-safety form).

### 1.8 Live event (in progress and completed)

**Must be true**
1. The organizer can start an event (blockers and warnings per `start_event_check`), see rounds and matches, enter or edit any score; a player can submit their own match score when that is on; the first submission locks it.
2. Rounds follow the format (pairs stay together in Team events, Mixed rounds are one man and one woman, Up & Down rotates the rest).
3. The leaderboard, the timer (time-based events), "Finish event" and the results (share image card, push, group ranking update) work. Finishing needs an in-progress event.
4. A completed event shows results and, for ranked group events, updates the group ranking including W/L.

**Today.** Built, E2E-covered (suite 07, plus 99 for the live scroller). Engine and standings fixes landed with the Manage Event plan (0125, 0126).
**Gap, and it's the most important one in this section: the live screens have had no UX audit.** The UX-LIVE-* section "is not in hand" in every plan since September; `in-progress-event.md` v1.2 was only amended for what the Manage plan touched. So the live event is the area with the most behaviour and the least design review. Also:
- Hosted must have 0126 applied together with a build that calls `event_engine_roster`, in that order (Manage Event plan hand-off). **Unverified.**
- Timer, score entry and keyboard use are **[device]** items; the live screen is where a player is standing on a court in sunlight, so legibility and touch targets matter more here than anywhere.

### 1.9 Chat

**Must be true**
1. Group and community chat open from the group/event/community entries, and from a profile only when the viewer follows the user (UX-PROF-02). All chat goes through `packages/chat` (architecture rule).
2. Channels and members stay in step with group membership (ensure-channel and the member reconcile).
3. If Stream is unreachable or unconfigured the chat list shows its empty state, not a crash (#298).
4. Messages, media and pagination work; the Stream app has production keys and secrets on the edge functions.

**Today.** Built, E2E-covered (suite 15). Stream renders in Outfit with the app's own avatar (#267, #268).
**Unverified:** Stream plan and cost at launch scale (a gate-4 question for the CEO: I haven't seen the plan or limits written down anywhere in the repo); that chat works on Android; the local E2E can't open the organizer chat (local Stream token), so that entry point has no automated check.

### 1.10 Profile and settings

**Must be true**
1. Own profile and another user's profile render with every section even when empty; follow/unfollow, block (with undo in Settings → Blocked users), report (reasons translated in all three locales) and Message-when-following work.
2. Account settings and Game preferences replace the old edit screen; email and phone changes are two-phase rows.
3. Settings tree: Account, Privacy (password, blocked users), Notifications (with descriptions), App preferences (language, icon), Support (help, contact, share; "Rate the app" hidden until the store URL exists), Legal, Delete account, Log out.
4. Badges show locked and unlocked states.
5. Delete account removes the five listed categories and surfaces the sole-admin refusal.

**Today.** Built, E2E-covered (suite 12). The whole Profile & Settings plan (21 PRs) is on `main`: 0102–0106 and #162–#185.
**Evidence for the gaps:**
- "Rate the app" is deliberately hidden: `STORE_URL` is empty in `lib/externalUrls.ts`. It needs the store listing, so it is a post-approval one-line change (Release & Ops).
- Badges: the plan said the work was "blocked on the final catalogue"; #185 merged. I did not check whether the catalogue is final. **Unverified.**
- Web has a dark-mode toggle (`ThemeToggle` in App preferences), but the primary-button token equals the background in dark mode, so Join, Follow and Apply are invisible fills. Flagged in two plans (see triage T-DM).
- Web `PlanSection` and the Settings hub's Subscription group exist (mobile #182). See D1.

### 1.11 Notifications

**Must be true**
1. The in-app list shows every notification type with copy in three locales; tapping routes to the right screen (push-tap routing, suites 13 and 14).
2. Push arrives on iOS **and Android** after the user allows it, and a denied permission never blocks the app. Dead tokens are pruned.
3. Per-channel preferences (push, email, WhatsApp opt-in as it applies) are respected on the server.
4. New notification types from the Manage Event plan (`organizer_confirmed`, `removed_from_event`, `partner_left`) show proper push copy, which needs `send-push` redeployed.

**Today.** Built, E2E-covered (13 deep links, 14 VoiceOver). Per-ticket push outcomes and token pruning exist (`5debdeb`).
**Unverified, and likely the biggest gap in this area:** no push has ever been seen on a real device in the record I have, and Android push needs FCM credentials and a store build, which are Release & Ops' gap list, not mine. Whether `send-push` was redeployed after 0122 is not stated.

---

## 2. What won't be ready, and what I propose

All of these are proposals. "Hide" means feature-flag or remove the entry point, keeping the code; the server side stays enforced.

| # | Item | Why it might not be ready | Proposal |
|---|---|---|---|
| W1 | **Phone OTP sign-in** | Needs paid Twilio and a registered Brazil sender; lead time is outside the team's control. | **Decide by 11-26.** If SMS isn't confirmed by then, launch with email OTP, Apple and Google, and hide the phone choice on the identifier screen. Caveat: `auth-onboarding.md` says every account links an email AND a phone, so hiding phone changes that rule and needs a founder decision. Flagged, not assumed. |
| W2 | **Anything price- or plan-facing** | Billing is out of scope, but the Jammer+ onboarding screen, the Settings → Subscription group, the Plan row, the community `PlanSection` and `UpgradePrompt` exist. `set_community_plan` is self-service by design during the MVP (Manage Event plan, out of scope list). | See D1. Recommended: hide purchase and price language; leave limits enforced. |
| W3 | **Event blasts by email / WhatsApp** | Email delivery never confirmed end to end; plan-gated feature; custom blast images are placeholders. | Keep only if one real blast to a test account on hosted succeeds (gate 3: the founder approves the send). Otherwise hide Send blast. |
| W4 | **Web dark mode** | Primary buttons have no visible fill. | Hide the web `ThemeToggle` until the Designer fixes the token (T-DM). One line. |
| W5 | **Rate the app** | No store ID yet. | Already hidden. Switch on after approval. |
| W6 | **Group and event preset thumbnails; blast artwork** | Artwork is blocked on the product owner/Designer. | Ship upload-only, as built. After launch. |
| W7 | **Live-event polish** | No UX-LIVE audit exists. | Launch the live event as built, with a device-verified floor (see T-LIVE). Do not start a live redesign before January. |
| W8 | **Android parity** | No Android pass on record; Release & Ops is writing the gap list. | Not mine to cut. If the Android pass finds blockers that can't be fixed by freeze (~12-28), the roadmap's fallback is an iOS-first or closed-testing launch; that's the CEO's and founder's call (gate 8). |

---

## 3. Triage of the open items in the UX plans

**Calls:** **Must** = must be done before launch. **Hide** = remove the entry point for launch. **After** = after launch. **Closed** = already done; I checked.
"Check" says how the CTO or QA can confirm.

### Community plan (`2026-09-14-ux-community-plan.md`)
No open items: 11 of 11 PRs merged (state doc 09-20). One carried decision: Jammer+ derivation narrows to the community **creator** (decided). **Closed.** *Check:* `two_check.sql` asserts the creator version (rewritten in 0098's PR).

### Profile & Settings plan (`2026-09-22-ux-profile-settings-plan.md`)
Every PR is merged. Remaining items:

| Item | Call | Reason |
|---|---|---|
| **Rate the app** needs the store URL (PR 16) | **After** (already hidden) | Needs the listing. Release & Ops fills `STORE_URL` after approval. |
| **Badges: final catalogue** (PR 21) | **Must** (verify only) | Confirm with the founder that the shipped catalogue is the final one; if not, ship it as is. QA check: badge screen shows locked and unlocked. |
| **Downgrade guards / three tiers** (PRs 18–19, 0103, 0104) | **Hide** under D1 | Only matters when plans are purchasable. |
| **Web has no app icon row / push / OTP phone flow** (parity gaps) | **After** | Structural; not expected on web. |
| **i18n:check doesn't scan web** (this plan, "Decided") | **Must** (T-I18N below) | A web typo ships a raw key. |

### Groups plan (`2026-09-25-ux-groups-plan.md`)
Shipped (0107–0110, #196–#202). Open:

| Item | Call | Reason |
|---|---|---|
| Preset thumbnails (decision 11) | **After** | Upload-only works. |
| "Season ended" notice is device-local (decision 9) | **After** | Acceptable; reinstall shows it once more. |
| Hosted paste of 0107–0109 | **Closed** (assumed) | Later notes say hosted is current through 0130; **unverified** for 0131+ (T-HOSTED). |

### Create & Join Events plan (`2026-09-25-ux-events-plan.md`)

| Item | Call | Reason |
|---|---|---|
| Web browser pass | **Closed** | Walked 09-27; findings shipped as 0118 (#229). |
| `profiles.email` exposure | **Closed** | #231 (0119, 0120) hides `email` and restricts client writes. |
| Client UPDATE on `phone`/`email` | **Closed** | Same PR (0120). |
| Preset thumbnail artwork | **After** | |
| Organizer "mark interested confirmed" requires a pair | **After** | Edge case; belongs to Manage. |
| `expo-calendar` needs a build | **Must** (device) | Native module; goes on the device pass, both OSes. |
| `pg_cron` enabled on hosted (0117) | **Must** (verify) | Recurring events silently stop otherwise. See T-HOSTED. |

### Manage Event plan (`2026-09-29-ux-manage-event-plan.md`) — "Open items"

| Item | Call | Reason |
|---|---|---|
| Dark-mode primary button | **Hide** the web toggle; fix **After** | See T-DM. |
| Blast emails untested end to end | **Must or Hide** | W3 above. |
| Custom blast images (placeholders) | **After** | Placeholder shows. |
| Team drag and drop has no E2E | **After** (device check) | The "+" path is covered. |
| Completed ranked team events not backfilled | **After** | No real data before launch. |
| `create_event` invitees not scoped | **Closed** | 0146, 0147 (#292). |
| Web has no unit-test runner | **After** | |
| `i18n:check` only scans mobile | **Must** | T-I18N. |
| pt-PT "tu" (web) vs formal register (mobile M3) | **Must** | One register across the app before the pt-PT copy is reviewed. T-COPY. |
| Interested rows lack "partner invitation pending" | **After** | |
| Web has no geocoder | **Closed** | Nominatim edge function; needs its hosted deploy (see T-HOSTED). |
| Dead `activityTeam*` keys | **After** | |
| Web locked-blast path only reviewed, not walked | **Must or Hide** | Follows W3. |
| Hosted: redeploy `send-push` after 0122, `send-blast` after 0124 | **Must** (verify) | T-HOSTED. |
| `set_community_plan`/`set_account_plan` self-service; a paid-tier gate is needed before billing | **After** (billing) | Relevant now only through D1. |
| WhatsApp Business API delivery | **After** | The share-intent path is what ships. |

### Home & Explore plan (`2026-09-29-ux-home-explore-plan.md`) — "Open items"

| Item | Call | Reason |
|---|---|---|
| Dark-mode primary buttons (web) | see T-DM | |
| Web geocoder | **Closed** | Needs deploy (T-HOSTED). |
| omar@ not onboarded, `/app` blank | **Closed** | #270. |
| No unit-test runner in `apps/web` | **After** | |
| E2E `keyboardTop()` ignores the predictive bar | **After** | Test tool only. |
| No community location backfill | **After** | Pre-launch communities are test data. A "set location" nudge is a nice-to-have. |
| Mobile Filter sheet scroll | **Must** (device) | On the founder's pass. |
| Distance filtering unexercised on seed data | **Closed** | Seeds got points (#272). |
| Filter logic duplicated | **Closed** | #271. |
| Confirm #263 (accessibility wedge recovery) in real runs | **After** (CTO, tooling) | Not user-facing. |
| TestFlight: M1–M3 reach users with the next build | **Must** | The new build carries onboarding too (T-BUILD). |

### The audit's known launch risks (`2026-09-20-state-and-next-steps.md`)

| Risk | Area it touches | Call |
|---|---|---|
| **1. Device pass overdue** (nothing since #129) | Everything; the QR download, share sheet, clipboard, media-library, keyboard behind pinned footers and `SwipeRow` in Communities | **Must.** One pass on a new iOS build ([PAD-32](/PAD/issues/PAD-32)), then one on Android. The roadmap already recommends one build with the onboarding redesign. |
| **2. `seed:demo` doesn't complete; nothing in CI runs it** | Demo and store-review data | **After** for the script itself. But App Store/Play review needs a test account with data: the audit seed (`pnpm seed:audit`) is the working path; Release & Ops should confirm. |
| **3. arm64 migration** | Tooling | **After.** Insurance only. |
| Carried in the roadmap: invitations left over from before 0147 ([PAD-99](/PAD/issues/PAD-99)) | Events | **Must** (CTO, in flight). |

### Cross-cutting triage items I'm adding

| Id | Item | Call | Reason / check |
|---|---|---|---|
| **T-I18N** | `pnpm i18n:check` scans only `apps/mobile/app` and `apps/mobile/components` (`scripts/check-i18n-keys.mjs:34`). Web has a separate catalog, so a missing key renders raw text. | **Must** | Launch criterion L1 isn't enforceable on web. Extend the check to `apps/web`. *Check:* CI fails on a deliberately missing web key. |
| **T-COPY** | One pt-PT register, and a pt-BR pass. | **Must** | Needs a native review; Legal & Growth join about 11-12. |
| **T-DM** | Web dark mode: primary fill equals background. | **Hide** toggle now; token fix **After**, Designer. | One-line hide; both plans flagged it. |
| **T-HOSTED** | Hosted state for 0131+ (the workflow-applied migrations), `pg_cron`, `geocode`, `send-push`, `send-blast` deploys. | **Must** (verify) | I can't read hosted. Ask the CTO for a probe list; hosted steps go through the founder (gates 1, 2). |
| **T-LIVE** | A UX review of the live event, with a short floor list: score entry works one-handed; timer readable in sunlight; leaderboard shows after Finish. | **Must** (small) | The Designer joins about 11-12; ask for a heuristic pass, not a redesign. |
| **T-BUILD** | One new iOS build carrying onboarding, M1–M3 and the 0148 reader. | **Must** | It must come after [PAD-65](/PAD/issues/PAD-65) and after 0148 is on hosted (onboarding spec §5.3). |

---

## 4. Decisions I need

| # | Decision | Owner | My recommendation |
|---|---|---|---|
| **D1** | **What does a free launch show for plans?** Jammer+ onboarding screen, Settings → Subscription, Plan row, community `PlanSection`, `UpgradePrompt`, blast gating. Prices are gate 6, and billing is out of scope. | CEO and founder | Hide purchase, price and "upgrade" language; keep the plan *limits* enforced server-side; make the one decision explicit and tell me if the founder instead wants everyone on the top tier during launch. I haven't read each screen's copy, so this needs the CTO's list of surfaces. |
| **D2** | **Phone sign-in: enable (needs paid Twilio) or defer?** | Founder (gate 4) | Decide by 11-26; fall back to W1's hide plan. |
| **D3** | **Level collection** is with the founder already ([PAD-65](/PAD/issues/PAD-65)). | Founder | Approve; no build ships until it's settled. |
| **D4** | **Is the live-event section of the UX audit coming?** | Founder | If a UX-LIVE document exists outside the repo, add it to `docs/audit/`. If not, T-LIVE stands. |
| **D5** | **Blast send test** (one email to a test account on hosted). | Founder (gate 3) | Yes, after `send-blast` is confirmed deployed. |

## 5. What I haven't done

- I opened no backlog tasks; the CTO reviews first (task rule), then I open them for what is agreed.
- I amended no `Requirements/*.md`; nothing here changes a requirement yet. If D1 or D2 changes behaviour, I will amend `auth-onboarding.md` and `profile.md` and note it.
- No new personal data is proposed, so no gate-5 flag. The existing Level question is already with the founder.
- I could not check hosted, a device, or whether Android builds; each is marked above.
