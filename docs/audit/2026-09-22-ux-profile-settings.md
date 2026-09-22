# UX Audit — Profile & Settings (UX-PROF-01..06, UX-SET-01..13)

Transcribed from `UX-Audit-Profile-Settings.docx.pdf`, sections "7. Profile" and "8. Settings". 19 items.

Status: **transcribed and planned.** See `2026-09-22-ux-profile-settings-plan.md` for the 21 pull
requests. The decisions at the end of this file were taken with the product owner on 2026-09-22 and
are not to be re-litigated.

---

## Read the Suggestions, not the Problems

This audit was written against a build that predates the UX-GLOB merges (#103–#111, 2026-09-12).
Several of its "Problem" statements were already fixed before it arrived, verified against `0a0f610`:

| The audit says | Actually |
| --- | --- |
| UX-PROF-02: actions are "a plain list expanded inline in the screen body" | Already a queued action sheet from an `ellipsis` `IconButton` (`ProfileView.tsx:66-87`) |
| UX-PROF-03: "Blocking opens a centred modal" | Already a destructive `SheetRow`; `sheetApi` routes every destructive row through `confirm` |
| UX-PROF-04: "Reporting opens as a centred modal" | Already a `BottomSheet` (`BlockReportModals.tsx:26`) |
| UX-PROF-05: "The list has no back button" | Both lists already pass `onBack` to `TopBar` |
| UX-SET-01: "There is also no logout action" | A full-width ghost Logout already sits at the bottom of Settings |
| UX-SET-01: "there is no Subscription section" | A Plan row under Account already opens the paywall |
| UX-SET-08: "Language opens as an inline expanding list" | Already a `BottomSheet` with the current locale badged |

What is true, and what the Suggestions are really about: the "⋯" and the settings gear sit in the
screen **body** rather than the header, the Settings tree is grouped wrongly and missing six screens,
and the profile shows four values where it should show five sections.

One Problem statement is a real, unfixed bug. UX-PROF-04's "its content is not in the same language as
the rest of the app" is exact: `BlockReportModals.tsx:6` declares
`const REASONS = ['harassment','inappropriate','spam','fake','other']` and renders `<Chip label={r}>`,
so all three locales show raw database enum values. The web twin does this correctly via
`t('reportReason_' + r)` — and separately omits `fake`, which the CHECK constraint accepts.

---

## The items

### UX-PROF-01 — Profile, other user
Rebuild to the reference design. Header: back arrow only, no label, with "⋯" in the top-right opening
UX-PROF-02. Identity block: photo, name, then description and location when set. Following and
Followers counts side by side, each tappable. A primary Follow below the counts, becoming "Following"
once tapped. Then a stats row (Played matches, Best position, Badges), a **Preferences** section of
three cards (Dominant hand, Court side, Preferred time) where **every card is present even when
unset**, a **Groups** section of horizontal cards, and a **Last results** section showing both teams,
the court and the final score.

The screen must remain structured when the user has filled in almost nothing — every section present
with its empty state, never a blank screen.

### UX-PROF-02 — Profile, other user, actions
Move the actions behind the header "⋯", opening as a bottom sheet with a ✕ top-right: Share; Follow /
Unfollow reflecting current state; **Message, only when the user is followed — the only entry point to
messaging from a profile**; Block; Report.

### UX-PROF-03 — Block user
A bottom sheet titled "Block user" with a description of the consequence, primary "Confirm" and
secondary "Cancel". After confirming, a temporary message explaining the user has been blocked and
their information is no longer accessible. A blocked user's profile collapses to photo, name and an
"Unblock" action; all other content is removed. Opening a blocked profile from elsewhere shows a
"no access" state with an icon, a short message and the instruction to unblock. A user who has blocked
the current user **does not appear in search results or listings at all** — no "no access" state in
that direction.

### UX-PROF-04 — Report user
A bottom sheet titled "Report player" with a ✕. A reason selector opening as **its own** bottom sheet,
listing the platform's defined report reasons. A description field. Primary "Confirm", secondary
"Cancel". All content — title, reason list, field labels and confirmation — in the same language as
the rest of the app.

### UX-PROF-05 — Followers and Following
Each row shows photo, name, a follow action and a "⋯" on the right. The follow action reflects the
real relationship — "Unfollow" for users already followed, "Follow" for users not followed, **including
when browsing someone else's followers list**. Tapping toggles in place. The "⋯" opens the UX-PROF-02
sheet. Tapping the row opens that user's profile. The search input gains a magnifier and a generic
placeholder rather than one describing what to do.

### UX-PROF-06 — My Profile
Same structure as UX-PROF-01 minus the relationship actions. Header: title "Profile", left-aligned in
the larger bold typeface, no back button, no divider, settings icon top-right. Body: photo, name,
description and location; the two counts; the stats row; Preferences; Groups; Last results.

**Remove the "Editar" action and the separate edit screen entirely.** All profile and account editing
lives in Settings (UX-SET-02 and UX-SET-03). There is no second place to edit the same data.

### UX-SET-01 — Settings
Rebuild with five groups, each a rounded card, each row with a leading icon, label and chevron.

- **Account** — Account Settings, Game preferences, Privacy
- **Notifications** — Notifications
- **Subscription** — Jammer+; Community Plans, shown only when the user owns at least one community
- **Support** — Support and feedback, App preferences
- **Legal** — Legal
- **Footer** — Logout, full-width

Language and app icon move into App preferences. Password and blocked users move into Privacy. Email,
phone, personal data and delete account move into Account Settings.

### UX-SET-02 — Account Settings (new)
Holds all personal data; replaces the "Editar perfil" screen, which is removed. Profile photo tappable
to change; name; multi-line description; email (changing it sends a verification code to the new
address, committed only on confirmation); mobile number with country selector and numeric keyboard;
date of birth picker; location opening the in-app map picker used in onboarding; gender selector;
destructive "Delete account" as the last item of the form content, opening UX-SET-11; fixed "Save" at
the bottom.

### UX-SET-03 — Game Preferences (new)
One block per preference, each with a title and a short description: Dominant hand (Right / Left),
Preferred side of the court (Right / Left), Preferred time (Any / Morning / Afternoon / Night). Fixed
primary save button. These are the values surfaced in the Preferences section of the profile.

### UX-SET-04 — Notifications
Keep the three toggles, each with a description below the label. Push — receive notifications on the
device, even when the app is closed. WhatsApp — enabling it means agreeing to receive event-related
messages from organizers and the platform. Email — the same for event-related communications.

### UX-SET-05 — Privacy (new)
Two rows, each a card with icon, title, description and chevron: Change password — update your access
password; Blocked users.

*(The audit's description for the Blocked users row reads "choose who can invite you to participate in
events", which describes a different feature. Correct copy is to be written.)*

### UX-SET-06 — Blocked Users (new)
Search input at the top. List of blocked users: photo, name and an "Unblock" action on the right.
Unblocking removes the user from the list immediately and restores access to their profile. When there
are no blocked users, **hide the search input** and show the empty state — no CTA needed.

### UX-SET-07 — Change Password
Move under Privacy. Current password with a "Forgot password?" action directly below it, aligned right.
New password. Repeat new password. Fixed primary button at the bottom. Rules, rule states and eye icons
per UX-GLOB-07 (already implemented).

### UX-SET-08 — App Preferences (new)
Two blocks, each with a title and description. Language selection — a selector opening as a bottom
sheet listing the available languages with the current one marked. App icon — a grid of the available
icons, single selection, the selected one visually highlighted.

### UX-SET-09 — Jammer+ — **DEFERRED**
Three states, each a card with plan name, price and benefits. Free: €0.00/month, free benefits,
primary "Upgrade to Jammer+" opening the paywall. Jammer+ direct: renewal price and next billing date,
premium benefits, destructive "Cancel subscription" at the bottom of the card; cancelling opens a
confirmation sheet and the plan stays active until the end of the period. Jammer+ via Community:
a subtitle stating it is linked to a community subscription, "Go to Community Subscription" instead of
a cancel action, and a helper line explaining that cancelling the community plan ends the bundled
Jammer+ at the end of the billing period.

### UX-SET-10 — Community Plans — **DEFERRED**
Reachable only when the user owns at least one community. Three tiers — Starter, Organizer, Community
Pro — each a card with name, price, next billing date when paid, and its feature list. Paid tiers show
a destructive "Cancel subscription". Tiers below the top one show an "Upgrade" action opening the tier
picker, which presents the three tiers as selectable cards with a "Most popular" badge on the
recommended one, monthly and annual pricing, and a primary action to continue. Cancelling opens a
confirmation sheet stating that it also ends the bundled Jammer+ at the end of the billing period.

### UX-SET-11 — Delete Account (new screen)
Reached from Account Settings. A warning card with a red accent explaining that all data will be
permanently erased and cannot be recovered. A card listing what is removed: profile and personal
information; match and activity history; messages and conversations; payment information; other data.
A fixed destructive button at the bottom opening a final confirmation sheet.

### UX-SET-12 — Support and Feedback (new)
Four rows, each a card with icon, title, description and chevron: Help center — find answers to
frequently asked questions; Contact support — send a message and the team responds as quickly as
possible; Rate the app — opens the native App Store rating page; Share the app — opens the native share
sheet.

### UX-SET-13 — Legal (new)
Two rows, each a card with icon, title, description and chevron: Terms of use — read the terms that
govern the use of the application; Privacy policy — understand how personal data is collected, used and
protected. Both open in the device's default browser.

---

## Global rules referenced

UX-GLOB-01 headers, UX-GLOB-02 bottom sheets, UX-GLOB-03 empty states, UX-GLOB-04 avatars,
**UX-GLOB-05 search input — no such rule exists**, UX-GLOB-06 submission feedback, UX-GLOB-07 password
rules, UX-GLOB-09 card orientation.

UX-GLOB-05 is cited five times here (UX-PROF-05, UX-SET-06) and was already established as a wrong
number during the Community audit: the global spec defines 01, 02, 03, 04, 06, 07, 08, 09, 10 and no
05. As there, it is read as "the inline search input in this list", which is a different thing from
UX-GLOB-08's global search screen.

---

## Decisions taken with the product owner, 2026-09-22

1. **UX-SET-09 and UX-SET-10 are deferred** until billing exists (`Structure Files/09-payments.md`
   specifies Stripe + RevenueCat; none of it is built). Plans today are granted on request under
   UX-GLOB-10 — `provider = 'manual'`, no cadence, no `cancel_at_period_end`, no populated
   `current_period_end` — so the renewal dates and end-of-period cancellation these two screens
   describe cannot be rendered honestly. The Subscription group still ships in the hub, wired to what
   works: Jammer+ → the existing `/profile/plan` paywall; Community Plans → Manage Community's
   existing Plan section.
2. **Three community tiers; the middle keeps its database name `basic`.** The audit's "Organizer" is
   treated as shorthand. `plans`, `plan_features` and `plan_limits` are already seeded for `basic`
   (50 members, 3 groups, 1 co-organizer); only `set_community_plan` refuses it.
3. **`basic` bundling Jammer+ is intended.** `0013_seed_plans.sql:37` seeds
   `('community','basic','jammer_plus_included',true)` and `account_plan` returns `jammer_plus` for
   the `created_by` of any community holding that feature. The row is dormant only because the tier is
   unreachable. Making it settable activates it, exactly as `community_pro` already behaves and as
   Requirements 7.6 specifies. Count the affected hosted communities before migration 0104 is pasted.
4. **Block keeps symmetric `profiles` RLS.** A security-definer `list_my_blocks` serves both the
   UX-SET-06 list and the UX-PROF-03 collapsed profile, rather than widening the read policy and every
   embed that resolves under it.
5. **Badges are built, as a fixed catalogue defined in code**, resolved on read from existing data —
   no badges table, no award trigger, no backfill. The product owner supplies the catalogue.
6. **Message is gated on "I follow them"** and lives only in the UX-PROF-02 sheet. This diverges from
   `Requirements/profile.md` PR-04 and PR-09, which put a Message button under the header
   unconditionally, and is deliberate: `app/chat/new.tsx` already lists only people you follow, so any
   other gating would contradict the surface it opens onto.
7. **Email and mobile changes are both OTP-verified**, per Requirements PR-12. The audit mentions
   verification only for email, but phone is a primary sign-in identifier.
8. **App preferences apply immediately** — no Save button (Requirements 6.2 asks for one; the audit
   does not), and no Jammer+ gate on `custom_icon` even though `0013` seeds it as a Jammer+ feature,
   because gating it now would take a working ability away from existing users.
9. **Date of birth uses the native picker.** Neither a date picker nor a map picker exists in the app
   today; see the plan's preamble.
10. **`my_groups(p_user)` shows shared communities only** when viewing someone else — no private
    groups, no `is_managing`, blocked users excluded both directions.
11. **Full web parity**, mobile PR then web PR per area — except the Subscription group, omitted on
    web, where no plan hook or paywall exists.
12. **`profile/edit.tsx` is deleted**, mobile and web.

---

## Conflicts with the system as built

Established by reading the code, not inferred.

1. **`explore_players` has no blocks clause.** `0052_explore_rpcs.sql:113` is `security definer`, so it
   bypasses the `profiles: read` policy entirely and still surfaces blocked players in the Explore
   rails, `/explore/players` and the `/search` People tab. This is the only listing path where
   UX-PROF-03's "absent entirely" is unenforced; `list_followers`, `list_following` and
   `useSearchProfiles` are already clean.

2. **`get_player_profile` returns zero rows for a block in either direction**, so the blocker cannot
   read the name or avatar of someone they blocked. UX-PROF-03's collapsed profile needs a second
   source — hence decision 4.

3. **There is no map picker and no date picker.** `LocationPickerSheet.tsx` states in its own header
   that the map area is a static placeholder; it searches seeded venues and returns **free text with
   no coordinates**, which cannot feed `set_my_location(lat, lng, text)`.
   `@react-native-community/datetimepicker` is not a dependency, and the wizard's `DateTimePicker` is a
   rolling 30-day-**forward** chip picker.

4. **There are no badges.** The only occurrence in the schema is the inert feature flag
   `('account','jammer_plus','badges_xp', false)` in `0013_seed_plans.sql`.

5. **"Last results" has a source, but not the one the stats use.** `event_matches` carries
   `side_a_score`, `side_b_score` and `court_id`; `match_players` and `event_teams` give the pairs.
   But `played_matches` on the profile counts rows in `group_event_results` — finished *ranked group
   events*, not matches — so the stat and the list legitimately count different things.

6. **`my_groups()` is hardcoded to `auth.uid()`** and is `security definer`, so parameterising it is a
   privacy widening, not a refactor — hence decision 10.

7. **`set_community_plan` accepts only `starter` and `community_pro`**, and its downgrade guard
   hard-codes Starter's limits. A third tier makes pro→basic a downgrade too.

8. **The app icon is already persisted.** `readActive()` seeds from `getAppIcon()` and `setAppIcon`
   persists at the OS level, so UX-SET-08 is a pure re-layout.

9. **`list_followers` / `list_following` return only `id, full_name, avatar_url`** — no relationship
   flags, which is what UX-PROF-05's in-list follow action needs.

10. **Web's `ReportDialog` omits the `fake` reason** the CHECK constraint accepts and mobile offers,
    and **web's password page checks length only**, not the shared four-rule validator.
