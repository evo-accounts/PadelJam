# UX Audit — Home and Explore: implementation plan

## Context

`UX-Audit-Home-Explore.docx.pdf` (sections 3 and 6 of the external audit): nine items, **UX-HOME-01** and
**UX-EXPL-01..08**. The transcription is in [2026-09-29-ux-home-explore.md](2026-09-29-ux-home-explore.md). This is the
seventh audit in the series, after Global, Community, Profile & Settings, Groups, Create & Join Events and Manage
Event. Main is at `fd480353`.

As before, **the Problems predate earlier merges; trust the Suggestions.** Some of it is already true today:

- Home's quick actions scroll horizontally and all four are reachable (internal commit 5d021cab, July).
- Explore rails, "See all" list screens (`app/explore/[type].tsx`, horizontal full-width cards), standard empty
  states on the rails (UX-GLOB-03), and bottom padding on the feed (`insets.bottom + 96`).
- The Events tab already has no header search ("global search lives on Explore").

**This audit reverses UX-GLOB-08** (#107, `docs/superpowers/specs/2026-09-12-ux-global-rules-design.md` §7). GLOB-08
moved search out of Explore into its own `/search` screen reached from a magnifying-glass header action on Home and
Explore. The audit wants no search icon anywhere, and one inline search input on Explore. "UX-GLOB-05", cited by the
audit, has never been in hand; later audits already quote it as "global search lives on Explore". The audit wins, and
the global spec gets a superseded note in the last PR.

**The new UX-HOME-01 reuses an internal ID.** The July 2026 commits `UX-HOME-01..06` (ecac7afb…c5c9e2ae) came from
an internal pass with no document. That UX-HOME-01 *added* the Home search icon. From now on the IDs refer to this
audit.

### What exists

| Area | State on main |
|------|---------------|
| Explore RPCs | `explore_players/events/communities/groups(p_limit, p_offset)` (0052, 0066, 0102). No query text, no filters, no sort, no total count, no viewer state (following / member / requested). Players are co-members only. |
| Search | Client-side only. `ExploreList` filters loaded pages by name, so a match on page 3 is invisible until scrolled. There is no server search RPC and no mixed search. |
| Follow | `follows` table with direct insert/delete (`useFollow`/`useUnfollow`). `explore_players` returns no `is_following`. |
| Join | `join_community` → `joined`/`requested`/`invite_required`/`rules_acknowledgement_required`; `join_group` → immediate, `group_private_join_forbidden`. Groups have **no request-to-join** (GR-06..09). |
| Geo | `events.location_point`, `profiles.location_point`. Communities have free-text `location` only; groups have nothing. |
| Community type | `club` / `team` / `friends`. |
| Event types | `event_type` (americano / mexicano / up_and_down) × `specification` (classic / mixed / team) = 9. The audit lists 8 (no Mixed Up and Down). |
| Recent searches | Nothing, in the DB or on the device. AsyncStorage is already a dependency. |
| Mobile primitives | `SearchInput`, `Chip`, `BottomSheet`, `SwitchRow`, `DateField`, `EmptyState`, `TopBar top` (left-aligned large title). **No slider.** |
| Web | Explore is a "coming soon" placeholder. Home has a welcome line, "Your groups" and a plain community list: no quick actions, no events rail, no search. |

## Decisions (product owner, 2026-09-29 — do not re-litigate)

1. **Groups keep two privacy states** (public / private, GR-06..09 unchanged). Group cards show Join only, never
   Request. The Groups filter sheet has **no Privacy chips**; search returns public groups plus the viewer's own
   private ones. The audit's group "Request" is a documented deviation.
2. **Communities get a geo point.** `communities.location_point geography(point)` is set with the existing location
   picker (`LocationSheet`), which replaces the free-text field in community create and settings. `location` keeps
   the picked label. Groups use their community's point. With no point, a community sorts last on Distance and
   drops out when a distance filter is set. There is no backfill; existing communities get a point when an admin
   next saves the location.
3. **Full web parity** (see D15).
4. **Nine event type chips**: the audit's eight plus **Mixed Up and Down**, which can be created and so must be
   filterable. Each chip is an `(event_type, specification)` pair.

Defaults (presented at plan review):

5. **Recent searches stay on the device** (AsyncStorage on mobile, `localStorage` on web), capped at 10,
   deduplicated case-insensitively, and never synced. This amends DS-05/DS-16, which planned a server
   `recent_searches` table.
6. **"For you" chips** come from `search_for_you_terms()`: the viewer's city, the formats of upcoming public events
   near them, and the names of their top recommended communities, up to 8. When nothing qualifies, the block is
   hidden.
7. **Suggestions** (EXPL-05) come from `search_suggest(q)`: up to 8 entity names across players, events, communities
   and groups, matching on prefix first and then substring, accent-insensitive. The query is debounced to about
   150 ms, which satisfies "updates on each keystroke" without a round trip per key.
8. **Search scope.** Results include everything the viewer can see, including their own communities and groups
   (whose action reads "Open" instead of Join). Players means every onboarded, non-blocked profile, not only
   co-members. Explore's recommendation rails keep excluding memberships, and now also exclude people already
   followed.
9. **Card actions.**
   - Player: Follow → Following. Unfollowing stays on the profile.
   - Community: Join (public) or Request (request to join) → Requested. If the community has rules, Join opens the
     existing rules sheet, and the acknowledgement goes through `join_community(p_ack)`.
   - Group: Join, which also joins the parent community, as today.
   - Every explore and search RPC returns a `viewer_state` column, so cards need no per-card query.
10. **Explore sections.** Players, Communities and Groups are hidden when empty. Events shows the standard empty state
    with a "Create event" action, because that is its meaningful CTA once the FAB leaves Explore.
11. **Home.**
    - Header: Chat and Notifications only.
    - Next Events: when empty, the standard empty state with a "Find events" action (→ Explore search, Events tab).
      It does not surface platform-wide events, because the no-activity view already does that.
    - My Groups: becomes a rail of vertical cards; empty → EmptyState with "Find groups".
    - FAB: stays on Home and on Events, about 20 pt above the tab bar. The current offset double-counts the bottom
      inset.
    - FAB leaves Explore. This amends HN-02.
12. **`/search` is removed as a screen** and kept only as a redirect to `/(tabs)/explore?search=1&tab=…&q=…`, so old
    links and in-flight builds land in the right place.
13. **Filters.**
    - Filters are isolated per tab and live in screen state; the search input is shared. This amends DS-10 and
      DS-11 (one unified sheet that persists across tabs).
    - "Most relevant" = text-match rank, then the existing recommendation order.
    - "Free" = fee disabled or zero. "Recurring" = `series_id is not null`.
    - "With upcoming events" = at least one visible scheduled event in the future.
    - Group "Community" = a multi-select of the viewer's communities.
    - The distance control is a stepped JS slider (5 / 10 / 25 / 50 / 100 km), not a native dependency, so no new
      EAS build is needed for it.
14. **Scoped search** ("Searching in [community]", DS-14) and the per-tab reinterpretation (DS-13) are dropped. The
    audit has one global search. Context-scoped inputs such as followers lists and invite pickers stay as they are.
15. **Full web parity**, as in the earlier audits: a mobile PR, then a web PR per area. Web gets the Explore feed,
    See all, search and filters, plus the Home quick actions and the Next Events and My Groups rails.

## Bugs found while mapping (fixed regardless)

| # | Bug | Where | PR |
|---|-----|-------|----|
| B1 | `CommunityCard` shows "Request to join" to members and to people with a pending request, and public communities get no Join at all | `components/explore/CommunityCard.tsx:45` | M1 |
| B2 | `ExploreList` runs all four list hooks whatever `kind` is, so every list screen fetches four lists | `components/explore/ExploreList.tsx:39` | M1 |
| B3 | Search matches only rows already loaded, not the whole set | `ExploreList.tsx:66-78` | 0129 / M2 |
| B4 | `explore_communities` keeps offering communities the viewer has already requested | 0052 | 0128 |
| B5 | Home's "Groups you might like" empty state says "You're not in any groups yet" | `(tabs)/index.tsx:209-238` | M1 |
| B6 | `CreateEventFab` double-counts the bottom inset, and its accessibility label is hard-coded English | `components/CreateEventFab.tsx:12` | M1 |

## PR sequence

Migrations are serial (0128 →). Every PR touching `apps/mobile/**`, `packages/**` or `infra/**` queues the ~37-min
self-hosted E2E; web-only PRs skip it. After each migration PR merges, it is applied to the local stack under
`pnpm e2e:hold` before the next E2E run. Merge gate: `check` green, `db-tests` for migrations, E2E green →
squash-merge. Hosted migrations are handed over as one paste batch.

**0 — docs.** Transcription + this plan.

**0128 — explore viewer state.**
- Drop and recreate the four `explore_*` RPCs with a `viewer_state` column: players `following` / `none`;
  communities `member` / `requested` / `invited` / `none`; groups `member` / `none`.
- Rails exclude followed players and communities with a pending request (B4).
- Communities gain `location_point` (D2), set through `update_community` / create, and groups resolve distance
  through their community.
- A `follow_player(p_user)` / `unfollow_player` pair returning the new state, so a card can resolve optimistically.
  Direct table writes stay for now.

**0129 — search.**
- `search_players(q, limit, offset)`, `search_events(q, filters jsonb, sort, limit, offset)`,
  `search_groups(q, filters, sort, limit, offset)` and `search_communities(q, filters, sort, limit, offset)`.
  Each returns `total_count` (a window count) and `viewer_state`, respects blocks and private visibility, and ranks
  "Most relevant" by match quality.
- `search_suggest(q, limit)` and `search_for_you_terms()`.
- Index support: an `unaccent` + `pg_trgm` GIN index on the name columns if the extensions are available,
  otherwise a `lower(name)` btree plus ILIKE.

**M1 — Home and Explore feed** (HOME-01, EXPL-01 header, EXPL-02, EXPL-03 actions; B1, B2, B5, B6; needs 0128).
- Home header: Chat and Notifications only. Quick actions go to `/(tabs)/explore?search=1&tab=…`. Next Events and
  My Groups become rails with EmptyStates. Correct the FAB offset.
- Explore: `top` title, an inert `SearchInput` below it, rails in the order Players / Events / Communities /
  Groups with inline actions, empty sections hidden, no FAB, no chip bar.
- See-all lists keep their horizontal cards and gain the inline actions.
- Community create and settings: `LocationSheet` replaces the free-text location (D2).
- E2E suites 03, 04, 05 and 09 are updated for the new entry points.

**M2 — search states** (EXPL-04, 05, 06; B3; needs 0129).
- Search mode on Explore: focus, Cancel, and a back arrow that returns from results to suggestions.
- Empty query: For you chips and Recent searches (local, 10, ✕, Clear all).
- Typeahead suggestions. The results tab bar is All / Events / Groups / Communities; All shows grouped rails, with
  players only there.
- `/search` becomes a redirect (D12). `ExploreList` search goes server-side.

**M3 — results by type and filters** (EXPL-07, 08).
- Count and filter button, applied-filter chips with ✕, and horizontal cards with Join / Request / Requested /
  Open.
- The Filter sheet has a per-tab body and a stepped distance slider. Filters are per-tab state, restored when the
  user returns to a tab.

**W1 — web Home** (quick actions, Next Events and My Groups rails, EmptyStates). Independent of the migrations.

**W2 — web Explore feed and See all** (needs 0128). Replaces the placeholder. Web community settings get the
location picker (D2).

**W3 — web search and filters** (needs 0129 and W2).

**Final — docs.**
- Requirements amendments:
  - `discovery.md`: DS-03, 04, 05, 08, 10, 11, 12, 13, 14, 15, 16, 20.
  - `home.md`: HN-02, 03, 09.
  - `groups.md`: a note that the audit's group "Request" is not adopted (D1).
  - `communities.md`: location becomes a picked place with a point (D2).
- A superseded note on UX-GLOB-08 in the global spec.
- Status table and hosted paste order (0128, 0129).

## Status

| PR | Scope | State |
|----|-------|-------|
| — | docs | plan approved 2026-09-29 |
