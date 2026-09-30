# UX Global Rules: design

**Date:** 2026-09-12
**Source:** "UX Audit — Global" (external document, 6 pages; rules UX-GLOB-01 to 10, no 05)
**Scope:** apply the nine global conventions across the mobile app. Web is untouched. The flow-specific audit documents this one refers to (the create-event wizard rule UX-CEVT-01, the sign-in and onboarding header rules) are not available; where a global rule defers to them, this spec applies the global rule only.

## Problem

The audit found that the app has no consistent header, no bottom-sheet component, three empty-state treatments, users shown by name alone, silent failed submissions, unstated password rules, search embedded in Explore, cards reused across the wrong axis, and paid features that cannot be reached. A code map confirmed each finding and measured it (section "Current state"). Two primitives, a bottom sheet and a top banner, unblock most of the rest.

## Decisions

| Question | Decision |
|---|---|
| Sequencing | Foundations first (one PR), then one PR per rule, all nine. |
| Search (UX-GLOB-08) | Follow the new rule, reversing PR #79: search is its own screen, reached from a header icon on Home, Events and Explore. *Superseded 2026-09-29 by the Home & Explore audit: search is inline on Explore again; see §7.* |
| Paid features (UX-GLOB-10) | Granted on request and reversible. The community upgrade grants Community Pro from Manage Community; Jammer+ gets a Plan row in Profile settings reusing the paywall. Two security-definer RPCs. |
| Password rules (UX-GLOB-07) | Enforced on the client and on the server (auth config and the complete-account function). Existing passwords keep working. |
| Bottom sheet implementation | In-house, on React Native `Modal`. No `@gorhom/bottom-sheet`. |
| Headers | Owned by the `TopBar` primitive with variants, not by native Stack headers. |

## Current state (from the code map, 2026-09-12)

- **Headers.** Four mechanisms coexist: `TopBar` (7 screens), native Stack headers (about 15), native Tabs headers (4 tabs; Community has none), hand-rolled header views (4). Twelve screens have no back affordance at all, including the five community home tabs and the community create form. One discard confirmation exists (event wizard). The wizard has Back in the footer and Close in the header.
- **Bottom sheets.** No primitive. 48 `Alert.alert` calls in 20 files, four of them used as action sheets. 18 `Modal`s: 7 bottom-anchored, 6 centred, 1 top-right dropdown (the notifications menu), 1 full-screen photo viewer. The profile menu is an inline dropdown. None has a ✕.
- **Empty states.** `EmptyState` primitive exists (card, icon, title, body, action). Used in 5 places; 25 lists render a bare line of text; the community tab has a bespoke component that does not compose the primitive.
- **Avatars.** `Avatar` primitive exists (five sizes, initials, coloured background) but its initials contrast is about 2.3:1. Used in 2 places; 14 hand-rolled clones; 12 rows show a name only; 3 places show an empty grey circle.
- **Submission feedback.** No banner or toast. Errors are inline text at the bottom of the form, `Alert.alert`, or a disabled button with no message. `Field` supports `error` (red border) but is used with it in 4 places; auth screens use raw `TextInput`.
- **Password.** Four password inputs, no eye toggle, no rules shown. Client checks length only on two screens and nothing on create-account. Server: `minimum_password_length = 8`, `password_requirements = ""`; the complete-account function checks length only.
- **Search.** No `/search` route. Explore embeds the input (deliberately not focused). No header search icons. Home quick actions already deep-link with `?tab=`. `explore/[type]` duplicates `ExploreList` without query filtering.
- **Cards.** No orientation prop. `EventCard` and `group/GroupCard` are horizontal; `explore/GroupCard`, `CommunityCard`, `PlayerCard` are vertical. Explore lists stack the 160/180 px vertical cards one per row; Home rails hold the full-width `EventCard` and stack the vertical `GroupCard`. Two different `GroupCard` components.
- **Paid features.** The paywall's three CTAs all just finish onboarding. No settings entry, no community plan screen, no RPC, and RLS forbids client writes to `subscriptions` / `community_subscriptions` (migration 0011). Plan caps surface only as error alerts with nowhere to upgrade.

---

## 0. Foundations

One PR. Four primitives in `apps/mobile/components/ui`, one provider at the root, and the first consumer of each.

### BottomSheet, useConfirm, useActionSheet

`BottomSheet` props: `visible`, `onClose`, `title?`, `children`, `testID?`. Renders a transparent `Modal` with a backdrop `Pressable` (`accessible={false}`, closes on tap), a sheet `View` anchored to the bottom (`accessibilityViewIsModal`, claims the responder so taps inside do not reach the backdrop, top radii `radius.xl`, safe-area bottom padding), a header row with the optional title and a ✕ `IconButton` top-right labelled "Close", and the children stacked full width. Same structure as `PendingActionsSheet`, generalised.

`SheetRow` props: `label`, `onPress`, `destructive?`, `icon?`, `disabled?`. A full-width row using `ListRow`; destructive rows use the destructive tone.

`useConfirm()` returns `confirm({ title, body?, confirmLabel, cancelLabel?, destructive? }) => Promise<boolean>`. Implemented with a single `ConfirmSheetHost` mounted in the root layout and a context; the promise resolves on the row tapped or on dismissal. This is the drop-in for every two-button `Alert.alert`.

`useActionSheet()` returns `show({ title?, actions: { key, label, destructive?, disabled? }[] }) => Promise<string | null>`. Same host pattern. This is the drop-in for the four `Alert.alert` menus and the two dropdowns.

The destructive rule: a destructive `SheetRow` never performs the action directly; it calls `confirm` with `destructive: true` first. The hooks encode this so call sites cannot forget it.

### Banner

`Banner` is mounted once by `BannerProvider` in the root layout, above the navigator, pinned to the top under the status bar, outside any scroll view. `useBanner()` returns `show(message: string, tone?: 'error' | 'success')`. The banner auto-dismisses after four seconds or on the next touch anywhere (a capture-phase responder on the provider). It carries `accessibilityRole="alert"` and calls `AccessibilityInfo.announceForAccessibility`. Two shared messages live in a `common` namespace: `missingInformation` ("Missing information") and `somethingWrong` ("Something isn't right").

### TopBar variants

`TopBar` gains `variant: 'top' | 'nav' | 'edit' | 'wizard'` (default `nav` for the existing call sites):

| Variant | Left | Title | Right | Divider |
|---|---|---|---|---|
| `top` | none | left-aligned, `title` type role (large, bold) | up to two `actions` | none |
| `nav` | back arrow (`onBack`, mandatory) | centred, body-strong; omitted when `title` is absent | up to two `actions` | hairline |
| `edit` | ✕ (`onClose`) | centred | up to two `actions` | hairline |
| `wizard` | back arrow (`onBack`) | centred | ✕ (`onClose`) | hairline |

`actions` becomes an array of up to two `{ icon, label, onPress, testID? }`. The `edit` and `wizard` variants take `dirty?: boolean`; when true, `onClose` is wrapped in `confirm({ title: discardTitle, body: discardBody, destructive: true })` before it runs, using the strings the event wizard already has (moved to `common`). Screens keep the safe-area handling they have today.

### Avatar

Initials use the `inverse` tone on a saturated background chosen from a palette of eight by hashing the user id (deterministic per user, never grey). Contrast checked at 4.5:1 or better for every palette entry. Sizes and `initialsOf` unchanged. Web is not touched.

### First consumers

`PendingActionsSheet` is rebuilt on `BottomSheet` + `SheetRow`. The notifications ••• menu becomes a `useActionSheet` call with "Clear all" confirmed as destructive. The event wizard's discard confirmation moves to `useConfirm`. That proves each primitive in place before the adoption PRs.

### Testing

Vitest with jsdom for `useConfirm` and `useActionSheet` promise resolution and for `Banner` auto-dismiss, following `StreamChatProvider.test.tsx`. The existing a11y tree tests for `components/ui` gain cases for the sheet (backdrop not accessible, sheet modal, ✕ labelled) and for the four `TopBar` variants. Avatar palette contrast is unit-tested.

---

## 1. Headers (UX-GLOB-01)

Every screen uses exactly one `TopBar` variant. Native headers are turned off where they still draw (`app/(tabs)/_layout.tsx`, the Stack layouts under `chat`, `notifications`, `groups`, `community/[id]/manage`, `community/[id]/reviews`, `group/[id]/manage`, `profile`, `explore`) so a screen never has two.

- **Top-level tabs** (Home, Events, Explore, Community, Profile): `top`. Home keeps chat and notifications as its right actions; Home, Events and Explore gain the search action in sub-project 7. Community's in-body title moves into the bar.
- **Navigation screens** (about 34): `nav`. Entity detail screens (event, group, community home) pass no title. Right actions move from native `headerRight` into `actions`. The twelve screens with no back affordance get one; the community home tabs share a single `nav` bar above the hero and top tabs.
- **Create and edit screens** (community create, group create, edit event, edit profile, community settings, group settings, review write, compose, change email, change password): `edit` with `dirty` derived from the form state, so ✕ confirms before discarding. Confirmation copy: "Discard changes?" / "What you entered will be lost."
- **The event wizard**: `wizard`, back stepping through steps, ✕ leaving the flow with the same confirmation. The footer loses its Back button.
- Sign-in and onboarding are out of scope (their own rules are not in this document). Chat channel screens keep the Stream header.

Copy for back and close labels comes from `common`. Each converted screen keeps its `testID`s so the E2E suites still find their controls; suites that tapped a header "Close" text button are updated to the ✕ label.

## 2. Bottom sheets (UX-GLOB-02)

Every `Alert.alert` confirmation becomes `await confirm(...)`; every `Alert.alert` menu and every dropdown or centred menu becomes `await show(...)`; every centred confirmation modal (chat channel menu, block and report, team-manage confirm) becomes a sheet; the seven already bottom-anchored modals gain the ✕ and the shared sheet chrome by moving onto `BottomSheet`. Selectors that are a list of options (language in settings, add-admin picker, transfer-ownership picker, community switcher) render as `BottomSheet` with `SheetRow`s or a selectable list. Selection widgets that are part of a form's layout (chips, segmented controls, selectable cards) are not sheets and stay. Success messages currently sent through `Alert.alert` move to the banner with the `success` tone. The full-screen photo viewer stays a modal.

## 3. Empty states (UX-GLOB-03)

The 25 bare-text sites render `EmptyState` with an icon, a title naming what is missing, a description, and a CTA when one resolves the condition:

- Lists the viewer can fill: group events → "Create event"; community groups → "Create group" (only when the viewer manages the community); My Events → "Find events" (opens search on the Events tab); chat → "Start a conversation"; followers and following → no CTA.
- Query results: "No matches" with "Try a broader search", no CTA.
- Rosters, requests, invitations, activity, comments, reviews, standings: icon, title and description only.

The community tab's bespoke `components/community/EmptyState.tsx` is rebuilt on the primitive with its suggested rail as a second block. Error states get their own treatment: the primitive gains a `tone: 'error'` with a "Retry" CTA, so an error never reads as "nothing here". Copy lives in the namespace of each screen; icons are `SymbolView` names chosen per list.

## 4. User representation (UX-GLOB-04)

The 14 hand-rolled avatars are replaced with `Avatar`. The 12 name-only rows (followers, following, partner requests in and out, manage roster, live standings and match cards, team manage slots and sheets, invite picker, member action sheet, about-page admin list, transfer picker, Home and Groups `ListRow`s) get an `Avatar` on the left at the size that fits the row (`sm` in dense rows, `md` in list rows). The three grey circles (new chat, partner requests inbox, community switcher) use the initials fallback. Queries that feed these rows already embed `avatar_url` and `full_name`; where one does not (live standings), the participant embed is extended. Names are never rendered without the avatar.

## 5. Submission feedback (UX-GLOB-06)

`useBanner` is called on every failed submit:

- **Auth screens** (sign-in, OTP, create-account, password, recovery, change email, change password): the banner is the only feedback; inputs stay in their normal state; the inline error `Text` under the form is removed. Server errors that are safe to show ("wrong code", "network") keep their specific message in the banner; anything that would reveal whether an identifier exists uses the generic message. A tap on a disabled-looking submit still produces the banner, so create-account's silent return on missing fields is replaced by validation that shows the banner.
- **Every other form** (event wizard and edit, community create and settings, group create and settings, profile edit, review write, compose, support): the banner appears, and the invalid inputs turn red through `Field`'s `error` prop. Raw `TextInput`s in these forms migrate to `Field`. The inline summary line is removed where the red inputs and the banner replace it.

## 6. Password rules (UX-GLOB-07)

A `PasswordField` primitive in `components/ui`: a `Field` with `secureTextEntry`, an eye `IconButton` inside the input on the right (labelled "Show password" / "Hide password"), and, when `showRules` is set, a four-row checklist under the input (min 8, uppercase, number, symbol) whose rows tick live as the user types. The rule list is field-level feedback and is not replaced by the banner. `passwordRules(value)` is a pure helper in `apps/mobile/lib` returning each rule's state; it is the single client validator.

Used on create-account, recovery and change-password with rules, and on the sign-in password screen with the eye only. Server: `password_requirements = "lower_upper_letters_digits_symbols"` in `infra/supabase/config.toml`, and the complete-account function validates with the same regex set before calling the admin API. Hosted needs the same setting under Authentication → Providers → Email (Password requirements), recorded in the hand-off.

## 7. Search entry point (UX-GLOB-08)

> **Superseded 2026-09-29 by the Home & Explore UX audit** (UX-HOME-01, UX-EXPL-01;
> `docs/audit/2026-09-29-ux-home-explore.md`, decisions in `docs/audit/2026-09-29-ux-home-explore-plan.md`).
> There is no search icon on any header any more, and no separate search screen. The one global search is an
> inline input under the Explore title; Home's Find quick actions open it focused on the matching tab
> (`/(tabs)/explore?search=1&tab=…`). Search runs server-side (migrations 0129, 0130), with For you and Recent
> searches, suggestions, and results tabs All / Events / Groups / Communities (#257 web, #260 mobile).
> `app/search.tsx` is kept only as a redirect to that URL (D12, #260). The context-scoped inputs listed below still
> stay where they are. The paragraph below is kept as the record of what #107 shipped.

A new `app/search.tsx` screen: `nav` bar with a search `Field` in place of the title (autofocused), the five tab chips from Explore (For you, Events, Groups, Communities, People) and `ExploreList` for the active tab. It accepts `?tab=` and `?q=`. Home, Events and Explore get a magnifying-glass `top` action that pushes `/search`. The Home quick actions route to `/search?tab=events|groups|communities`. Explore loses its embedded input and its chip row scrolls the curated rails only. `app/explore/[type].tsx` renders `ExploreList` instead of its own copy, so "see all" and search share one list. The five context-scoped inputs (group members, group invite, community invite, new chat, followers and following) stay where they are.

## 8. Card orientation (UX-GLOB-09)

`EventCard`, `GroupCard` and `CommunityCard` gain `orientation: 'vertical' | 'horizontal'`. Vertical: image or avatar on top, text below, action at the bottom, fixed width for rails. Horizontal: full width, image left, text middle, chevron or action right. The two `GroupCard`s merge into `components/group/GroupCard.tsx` with both orientations. `PlayerCard` stays vertical (rails) and gains a horizontal form for the People list.

Placement: Home and Explore rails and the sections inside event, group and community detail use vertical; every list screen, every "see all", the Explore tab lists, My Events and the community groups list use horizontal. `ExploreList` renders horizontal cards one per row for all kinds, dropping the three-column player grid. Rows that render a group through `ListRow` (Home "My Groups", the Groups screen) switch to the horizontal `GroupCard` so a group looks the same everywhere.

## 9. Paid features in the MVP (UX-GLOB-10)

**Schema.** One migration with two `security definer` RPCs, granted to `authenticated`:

- `set_account_plan(p_plan text)`: `p_plan in ('free', 'jammer_plus')`; upserts or deletes the caller's `subscriptions` row (`plan_id = 'jammer_plus'`, `status = 'active'`, `provider = 'manual'`). Idempotent.
- `set_community_plan(p_community_id uuid, p_plan text)`: `p_plan in ('starter', 'community_pro')`; caller must be the community owner; upserts or deletes the `community_subscriptions` row. Downgrading is refused with `plan_downgrade_over_limit` when the community currently exceeds Starter's limits (members over 10, or more than one active group), so a downgrade never leaves data over cap.

RLS on both tables stays select-only; the RPCs are the only writers besides the seed. The manual `provider` value marks these rows so a future billing integration can distinguish them.

**Reads.** `useAccountPlan()` and `useCommunityPlan(communityId)` in `packages/api` call the existing `account_plan` and `community_plan` SQL functions; both are exposed as RPCs if they are not already. `useSetAccountPlan()` and `useSetCommunityPlan()` mutations invalidate them.

**Screens.**
- Profile settings gains a Plan row ("Jammer" or "Jammer+") that opens the existing paywall screen in a `nav` context. The paywall's "Try 7-day free trial" calls `set_account_plan('jammer_plus')` and shows a success banner; when already on Jammer+, the screen shows the current plan and a "Return to free" action, confirmed through the sheet. Onboarding keeps using the same screen; its "Continue with Free" behaviour is unchanged.
- Manage Community gains a Plan section showing Starter and Community Pro side by side (limits from the features registry) with "Upgrade to Community Pro" or "Return to Starter", the latter confirmed and refused with a clear message when over limit.
- The four cap errors (`groups_per_community`, `co_organizers_limit_reached`, `recurring_events`, `members_per_community`) become gated UI: the error copy gains an "Upgrade" action that opens the community Plan section; the blast customisation screen checks `custom_broadcasts` through `useCommunityPlan` and shows the Starter read-only template with the same upgrade action.

**Hosted hand-off.** The migration is pasted in the SQL editor like the previous three. The audit seed's Jammer+ and Community Pro rows already use `provider = 'manual'`, so they read as granted-on-request plans.

---

## Ordering and delivery

Sub-project 0 first; sub-projects 1 to 9 afterwards, each its own PR from `origin/main`, in the numbered order (1 and 2 share the most screens and go first; 5 depends on 0's banner; 7 depends on 1's `top` actions; 9 depends on 2's confirm sheet). Each PR ends with a simulator walk of the screens it touched, and the E2E suites that cover those screens are run before opening it.

## Verification

- Unit: vitest for the primitives, `passwordRules`, `pendingActions`-style pure helpers, the avatar palette.
- A11y: the `components/ui` tree tests extended for every new primitive and variant.
- RPC: `infra/supabase/tests/plans.test.mjs` for the two plan RPCs (grant, revoke, owner-only, downgrade refused over limit).
- E2E: the existing suites touching converted screens; suite 01 (auth) updated for banner-only feedback and the password rules.
- Manual: a simulator walk per PR against the audit seed, which already exercises every list, empty state and gated feature the rules touch.
