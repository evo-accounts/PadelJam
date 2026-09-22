# UX Audit — Profile & Settings: implementation plan

## Context

Companion to `2026-09-22-ux-profile-settings.md`, written after mapping the current screens and data model. Read that first for the 19 items and the decisions already taken.

`UX-Audit-Profile-Settings.docx.pdf` is the next external UX audit in the same series as Global
(UX-GLOB-01..10, merged #103–#111) and Community (UX-COMM-01..24, merged #134–#150, now complete).
It contains 19 items — **UX-PROF-01..06** (profile, follow, block, report) and **UX-SET-01..13**
(the Settings tree). Main is clean at `0a0f610` with no open PRs, so this starts from a settled base.

Two things shape the work more than the document does.

**The audit's "Problem" prose predates the UX-GLOB merges.** Already false today: block and report
are bottom sheets, not centred modals; the "⋯" is an action sheet, not an inline list; language is a
bottom sheet, not an expanding list; followers and following have back buttons; and a Logout button
already exists. What *is* true is that the "⋯" and the settings gear sit in the screen **body**
rather than the header. **Trust the Suggestions, not the Problems** — every Suggestion still stands,
and one Problem is a real bug: the report reason chips render raw database enum values
(`harassment`, `inappropriate`, `spam`, `fake`, `other`) untranslated in all three locales, which is
exactly what UX-PROF-04 means by "not in the same language as the rest of the app".

**`Requirements/profile.md` already specifies this area and disagrees with the audit in places.**
Where they conflict, the decisions below are the tie-break. That document needs amending afterwards,
not silently overruling.

The outcome: a profile that stays structured when a user has filled in almost nothing, a Settings
tree of five groups where every screen exists, and — for the first time — a place to see and undo a
block.

---

## What exploration changed about the shape of this work

**There is no map picker and no date picker in the app.** UX-SET-02 names both.
`components/community/LocationPickerSheet.tsx` looks like a map picker but its own header says the
map area is a static placeholder; it searches seeded *venues* via `search_venues` and hands back
**free text with no coordinates**, which cannot feed `set_my_location(lat, lng, text)`. The reusable
logic is in `app/(onboarding)/location.tsx`, which uses `Location.geocodeAsync`.
`@react-native-community/datetimepicker` is not a dependency, and the only date UI in the repo —
`components/event/wizard/DateTimePicker.tsx` — is a rolling 30-day-**forward** chip picker,
structurally useless for a birthdate.

**`get_player_profile` needs no extension.** It already returns `dominant_hand`, `court_side`,
`preferred_time`, `location_text`, `description`, both counts, `is_following`, `is_followed_by`,
`played_matches` and `best_position` — everything UX-PROF-01's header, identity block, counts and
Preferences cards ask for. Groups, last results and badges are three separate reads.

**`list_followers` / `list_following` cannot be `create or replace`d.** Adding relationship flags
changes the OUT column list, which Postgres refuses to replace in place. 0102 must `drop function`
both signatures first and re-issue their `grant execute` lines. Run the file as one script.

**`explore_players` has no blocks clause at all.** `0052_explore_rpcs.sql:113` is security definer
and carries no block predicate, so a blocked player still appears in the Explore rails,
`/explore/players` and the `/search` People tab — tapping through lands on the "unavailable" state.
This is the only place UX-PROF-03's "absent entirely" requirement is actually unenforced; the other
three listing paths already filter both directions.

**Smaller than expected**: the app icon is already persisted (`readActive()` seeds from
`getAppIcon()`; `setAppIcon` persists at the OS level — the `useState` mirrors a native read), so
UX-SET-08 is a pure re-layout. Web already has followers/following routes and its settings page is
already a stack of shadcn `Card` groups, so UX-SET-01 on web is regrouping, not rebuilding.

---

## Product decisions

The twelve decisions taken with the product owner on 2026-09-22 are recorded in
`2026-09-22-ux-profile-settings.md`, together with the ten conflicts with the system as built that
prompted them. They are settled; this file assumes them and does not restate them. The implementation
consequences that are *not* in that list are in **Decided**, below the pull requests.

## Pull requests

Ordered by dependency. 0102 gates every screen PR. Children of the Settings hub land before the hub,
so the hub PR is pure re-layout against destinations that already exist and only one PR ever
rearranges rows.

**0 — `docs(audit)`: transcribe the audit and this plan.** Following the Community convention:
`docs/audit/2026-09-22-ux-profile-settings.md` (the 19 items, the stale-Problems note, the conflicts
with `Requirements/profile.md`) and `docs/audit/2026-09-22-ux-profile-settings-plan.md` (this file).

**1 — `refactor(ui): a SearchInput primitive, and five screens that stop hand-rolling one.**
Five call sites exist — group members, group invite, community invite, new chat, followers/following
— and UX-PROF-05 and UX-SET-06 add the magnifier requirement to two plus a sixth. Creates
`apps/mobile/components/ui/SearchInput.tsx`, exported from the barrel.
**It must render a bare `TextInput` with a decorative leading `SymbolView` and no
`accessibilityLabel`**, not a labelled `Field`: the Community plan's Verification section records
that suite 11's invite search must stay a plain text field, and several suites select search boxes
by `{type: 'TextField'}`. A labelled variant turns multiple suites red at once. No web pair.

**2 — `feat(db)`: the profile screen's reads, and the `explore_players` block hole. Migration 0102.**
One paste, batching everything UX-PROF-01/03/05 and UX-SET-06 need:
- `list_my_blocks(p_search, p_limit, p_offset)` → `id, full_name, avatar_url`, definer over `blocks`
  where `blocker_id = auth.uid()`.
- `explore_players` gains a both-direction blocks clause.
- `list_followers` / `list_following` **dropped and recreated** with `is_following` /
  `is_followed_by` computed relative to `auth.uid()`, not `p_user` — that is what UX-PROF-05 means
  by the follow action reflecting the real relationship inside someone else's list.
- `my_groups(p_user uuid default auth.uid())` — drop the zero-arg version, recreate with the default
  so existing `db.rpc('my_groups')` calls survive, and write decision 10's visibility rule into it.
- `player_recent_results(p_user, p_limit)` — definer over `event_matches` (`side_a_score`,
  `side_b_score`, `court_id`), `match_players`, `event_teams`, `courts`. Definer is mandatory:
  `group_event_results` RLS gates on group-season membership, so a visitor sees nothing otherwise.

Regenerate `packages/db/src/database.types.ts` **in this PR** or every caller fails typecheck. Add
tests to `infra/supabase/tests`.

**3 — `feat(mobile)`: the other-user profile, its sheet, block and report (01, 02, 03, 04).**
`components/profile/ProfileView.tsx` is replaced, not adapted — it is 129 lines shared by own and
other with the "⋯" and gear in the body, and the new body gains three sections it has no concept of.
New section components under `components/profile/`: identity block, tappable counts, primary Follow
below the counts, stats row (**two** cards; the third is the badges PR), Preferences (three cards
always present, from fields `get_player_profile` already returns), Groups, Last results.
The sheet becomes Share / Follow-Unfollow / Message / Block / Report, Message only when
`is_following`. Block becomes an explicit `BottomSheet` with consequence copy rather than
`sheetApi`'s automatic destructive confirm, then a `useBanner` message. The three post-block states
resolve as: row returned → normal; zero rows **and** present in `list_my_blocks` → collapsed photo +
name + Unblock; zero rows and absent → "no access".
UX-PROF-04: a `REASON_KEYS` map into the `profile` namespace, the sheet retitled "Report player",
the reason selector promoted to its own nested `BottomSheet`. **Keep the value sent to
`reports.reason` exactly as-is** — the CHECK constraint is on those five literals.
Adds `useMyBlocks`, `usePlayerGroups`, `usePlayerResults` to `packages/api/src/profile/queries.ts`.
**Every `packages/api` change in this audit ships in the mobile half of its pair**; web PRs are
consumers only.

**4 — `feat(web)`: the other-user profile mirrored.** `components/profile/{ProfileHeader,FollowButton,ReportDialog}.tsx`
and `app/(app)/app/profile/[id]/page.tsx`. Sheet → `DropdownMenu`; block and report → `Dialog`s.
Closes a pre-existing divergence: web's `ReportDialog` omits the `fake` reason the database accepts.

**5 — `feat(mobile)`: follower and following lists (05).** Rows gain `Avatar`, a follow control bound
to the new `is_following` column with optimistic tap-to-toggle in place, and a "⋯" opening the PR-3
sheet. Search becomes `SearchInput`.

**6 — `feat(web)`: follower and following lists mirrored.** `components/profile/FollowList.tsx`.

**7 — `chore(mobile)`: a date picker, and a location picker that returns coordinates.**
Lands alone so the dev-client rebuild is one announced event. Adds
`@react-native-community/datetimepicker`, a `DobPicker` wrapper, and a `ProfileLocationSheet` built
on `Location.geocodeAsync` extracted from `app/(onboarding)/location.tsx` — returning
`{ lat, lng, label }`, which `LocationPickerSheet` cannot. Onboarding is refactored onto the shared
sheet so there is one geocode path, not two.

**8 — `feat(mobile)`: Account Settings and Game preferences replace the edit screen (02, 03, 06).**
The largest screen PR. Creates `app/profile/account.tsx` and `app/profile/game.tsx`, both
`TopBar variant="edit"` with `useDirty` and a fixed Save. Game preferences is three titled blocks
with descriptions over the existing choice primitives.
**"Fixed Save" and "email/mobile OTP" cannot both be literal** — an OTP change is a two-phase
round trip that cannot be batched into a Save. Email and mobile become *rows that open* the
two-phase flow (`startPhoneChange`/`verifyPhoneChange` are already written and unused). Save commits
name, description, avatar, date of birth and gender via `useUpdateProfile`. **Location is a third,
separate write**: `set_my_location` overwrites both columns and cannot ride in a `profiles` UPDATE,
so it gets a `useSetMyLocation` mutation called only when location actually changed.
Also UX-PROF-06, because it is the same deletion: `(tabs)/profile.tsx` gets `TopBar variant="top"`
titled "Profile" with the settings icon top-right, the "Editar" button goes, and
`app/profile/edit.tsx` is deleted with its `validateEditProfile` export and unit test.
**Keep the settings icon's `accessibilityLabel` exactly `"Settings"`**, and simplify
`e2e/driver/flows.ts:117` to the label selector in this PR — see Verification.

**9 — `feat(web)`: account settings and game preferences.** Deletes `app/(app)/app/profile/edit/page.tsx`.

**10 — `feat(mobile)`: the Delete account screen (11).** Rewrites `app/profile/delete-account.tsx`:
warning card with red accent, a card listing **five** erased categories (it lists three today),
fixed destructive button, final confirmation sheet. The edge function and `soft_delete_account()`
are untouched — but 0098's sole-community-admin refusal must still surface in the banner.

**11 — `feat(web)`: the delete account screen.** Copy and layout only.

**12 — `feat(mobile)`: Privacy, Blocked users, and the password move (05, 06, 07).**
Creates `app/profile/privacy.tsx` and `app/profile/blocked.tsx` (`SearchInput`, photo + name +
Unblock over `useMyBlocks`, optimistic removal via the already-exported-but-unused `useUnblock`, and
an `EmptyState` that **hides the search**). `change-password.tsx` gains a right-aligned "Forgot
password?" under the current-password field and a fixed primary button.
**Write correct copy for the Blocked users row** — the audit's "choose who can invite you to
participate in events" describes a different feature entirely.
**Carry the `settings-password-row` testID onto the new row verbatim.**

**13 — `feat(web)`: privacy and blocked users.** Also closes the second divergence: web's password
page checks length only, not the shared four-rule validator. Move
`apps/mobile/lib/passwordRules.ts` to `packages/utils` so both apps read one definition.

**14 — `feat(mobile)`: notification descriptions and App preferences (04, 08).**
Three `SwitchRow`s gain a description under each label. `app/profile/app-preferences.tsx` holds
Language (the sheet lifted out of `settings.tsx`) and the existing icon grid, each a titled block
with a description, both applying immediately. Fold `app-icon.tsx` in.

**15 — `feat(web)`: app preferences.** Language plus the existing `ThemeToggle` (mobile has none).
**No app icon row.** Notification descriptions land here too.

**16 — `feat(mobile)`: Support and feedback, and Legal (12, 13).** `app/profile/support.tsx` becomes
a four-row hub; the ticket form moves to `app/profile/support/contact.tsx`. **"Rate the app" is
missing entirely today** — add it via `expo-store-review`. Creates `app/profile/legal.tsx`, opening
in the device browser via `expo-web-browser` (already a dependency) rather than `Linking`.

**17 — `feat(web)`: support and legal.**

**18 — `feat(db)`: three community tiers. Migration 0104.** `set_community_plan` accepts `'basic'`.
Two things beyond adding a literal, both in `0098_community_roles_permissions.sql:642+`: the
downgrade guard hard-codes `community_limit_for_plan('starter', ...)`, but pro→basic is also a
downgrade and needs checking against **basic's** limits — generalise it to read `p_plan`'s own
limits; and `starter` *deletes* the row where paid tiers *upsert*, so the if/else becomes three
cases. Count the hosted communities affected by decision 3 before pasting.

**19 — `feat(mobile)`: the Settings hub and the Subscription group (01).** Five groups of rounded
cards plus the existing full-width Logout. Every destination is live by now, so this moves rows and
nothing else. Needs a new `useOwnedCommunities` over `communities.created_by` — nothing in
`packages/api` selects that column today — plus a routing rule for owning exactly one (straight in)
versus several (a picker sheet). Rewrites `lib/planSection.ts`, `components/community/PlanSection.tsx`
and `planSection.test.ts` for three tiers: `planSectionView` is not "two tiers", it is "current plan
left, Community Pro right", and what it cannot express is *which* tier an upgrade targets.
`PLAN_TITLE_KEYS` already carries `planBasic`.

**20 — `feat(web)`: the settings hub.** Four groups; Subscription omitted per decision 11.

**21 — `feat(db+mobile+web)`: badges. Migration 0103.** Last, so it blocks nothing.
**Have the RPC return counters, not verdicts.** `player_badge_facts(p_user)` returns a fixed bag
over existing data (matches played, wins, best placement, events attended, communities, groups,
followers, account age); the TypeScript registry maps counters to locked/unlocked. If the RPC
evaluated the predicates the catalogue would live in SQL and every future change would be another
hand-pasted migration — the exact cost decision 5 exists to avoid. This way 0103 ships immediately
and the catalogue is a code change. Adds the registry module, the third stat card, and a badges list
screen with locked and unlocked states. **Blocked on the final catalogue.**

---

---

## Decided

**Three migrations, not seven.** 0102 (profile reads), 0103 (badge facts), 0104 (three tiers). The
hosted database is updated by pasting SQL by hand, so fewer files is better — but these three cannot
collapse further, because 0103 waits on the catalogue and 0104 waits on the hosted count, and holding
0102 for either would stall every screen PR. `get_player_profile` drops off the candidate list
entirely; it already returns every field UX-PROF-01 needs.

**Web parity is not one-for-one, and the gaps are structural.** Web has no bottom sheets, no `TopBar`,
no app icon, no push, no OTP phone flow and no plan surface whatsoever; it also has a `ThemeToggle`
mobile lacks. And `apps/web/src/lib/i18n-web.ts` uses the `settings` namespace, sharing nothing with
mobile's `profile` namespace — so **every string in this audit is authored twice across three
locales**, the largest block of mechanical work here. `scripts/check-i18n-keys.mjs` only scans
`apps/mobile/app` and `apps/mobile/components`, so a web typo ships silently as a visible raw key.
Review the web halves for that specifically; CI will not.

**The "no access" state and a deep link to someone who blocked you are indistinguishable, and that is
fine.** `get_player_profile` returns zero rows for a block in either direction, and `list_my_blocks`
separates the two cases the user can act on. UX-PROF-03's "absent entirely" requirement is about
listings, and it is met by the `explore_players` fix in 0102 — the other three listing paths already
carry both-direction clauses.

## Verification

Every PR runs the eight-command `check`; the database ones add tests to `infra/supabase/tests`.

**The size ratchet fails in both directions and will bite repeatedly.**
`scripts/check-size-budget.mjs` sits at 355 and errors when the count *falls* without the number
being lowered. Deleting `profile/edit.tsx` removes two counted literals → 353 → CI fails with "Under
budget". Measured with the script's own match semantics, the screens this audit rebuilds hold **23**
counted literals — `ProfileView` 6, `app-icon` 4, `delete-account` 4, `change-email` 4, `edit` 2,
`settings` 1, `followers` 1, `following` 1 — and every rebuilt screen should come out at zero, because
the new work uses `Text` variants and `radius` tokens. So the budget walks 355 → **332** across the
series. (`JammerPlusPaywall` holds 17 more, untouched here: subscriptions are deferred.) **Each PR touching a
profile screen re-runs `pnpm size:check` and lowers `BUDGET` by exactly what it removed** — and
because that is one integer in one file, two of these in flight will conflict on it. Sequence them,
or make the budget edit the final hunk on rebase.

**Suite 12 — five of six tests need work** (`apps/mobile/e2e/suites/12-profile-settings.e2e.ts`):
1. *self profile renders* — survives. Watch that UX-PROF-06's TopBar title "Profile" does not
   collide with `tabTo('Profile')`.
2. *edit profile persists a new bio* — **dies with the screen.** Rewrite as "account settings
   persists a description": deep-link `mobile:///profile/account`, type into the `TextArea`,
   `scrollUntilVisible` the fixed Save, poll `profiles.description`.
3. *other profile follow/unfollow* — **breaks subtly.** It taps `{text: /^following$/i}`; UX-PROF-01
   puts a "Following" **count label** above the button, so the regex matches twice. Re-anchor to a
   testID on the primary action.
4. *notification toggle persists* — **breaks twice.** It taps the gear from the body (it moves to the
   TopBar), then `{text: /notifications/i}` in Settings — where the new hub has both a Notifications
   *group heading* and a Notifications *row*. Deep-link `mobile:///profile/notifications` and give
   each `SwitchRow` a testID; `{type:'CheckBox', nth:0}` gets more brittle once UX-SET-04 adds a
   description line.
5. *the password row names the screen it opens* — **breaks on both deep links**; the row moves under
   Privacy. Re-point to `mobile:///profile/privacy` and carry the testID over. Everything else in
   this long, heavily documented test (the `psql` blanking, the `auth_password_set` assertion, the
   create-password flow, the relabel-without-relaunch check) is worth preserving intact.
6. *support ticket submits* — **breaks.** Keep the hub at `/profile/support`, put the form at
   `/profile/support/contact`, re-point the test.

**Beyond suite 12**, the real exposure is `e2e/driver/flows.ts:117` — `logout()` walks Profile tab →
Settings → Log out and is reached from suites 03, 04, 06, 08, 09, 10 and 98 via `switchUser`. Its
primary selector `tap({text: /settings/i, type: 'Button'})` stops matching once the gear is a TopBar
`IconButton`; it survives only on the `tap({label: 'Settings'})` fallback, at a snapshot round-trip
per call site. Fix it in PR 8 rather than relying on the catch. Suite 00 asserts on `ListRow`
trailing slots including "a language" — check it when PR 14 moves Language out of Settings.

**Regenerate `packages/db/src/database.types.ts` inside each database PR**, and remember the hosted
paste backlog: `check-remote-schema.mjs` exists because 0089 shipped locally and not to production.
It probes only the auth path, so a missing 0102 surfaces as screens failing with PGRST202 — quiet
until someone opens them.

**Before starting**: the E2E suite and the local Supabase on this Mac are shared singletons — check
`pgrep -f "node.*e2e/run[.]mjs"` and `/tmp/padeljam-e2e.lock` before any run or DB reset. Each PR
ends with a simulator walk of the screens it touched, against the audit seed.

**`Requirements/profile.md` is already amended** (same PR as this file). Section 07 was deliberately
left unchanged in substance — it is the source of truth other documents cite for plan limits — and
carries only an MVP note. Sections 3.1, 3.2, 5.1, 6.2, PR-04 and PR-09 carry inline
**[Amended 2026-09-22]** notes; the profiles and user_settings schemas were corrected outright; the
Next.js file map and the three Playwright build prompts were removed. Nothing further is owed to that
document by this plan.
