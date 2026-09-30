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

Found during implementation (fixed in the PR named):

| # | Bug | Where | PR |
|---|-----|-------|----|
| B7 | The four security-definer `explore_*` RPCs were callable by `anon` (`create function` + 0030's default privileges), so `explore_communities` listed public communities to anyone with the publishable key | 0052 / 0066 / 0102 grants | #253 (0128) |
| B8 | Follow flash: `useFollowPlayer` invalidated `['explore','players']`, and 0128's rail excludes followed players, so a card read "Following" for under a second and then vanished (seen on web W2 first) | `packages/api` follow hooks | #259 (`profile/followCache.ts` writes `viewer_state` into the cached rows) |
| B9 | On a short Explore search list the last rows sat under the keyboard and could not be scrolled clear | mobile Explore search list | #259 (`automaticallyAdjustKeyboardInsets`; #260 extends it to every search list) |
| B10 | Web community create / settings: the thumbnail and cover file inputs overflowed a 390 px viewport by 16 px | `apps/web` community forms | #256 |
| B11 | Search matched names only, so the For you city chip ("Lisbon") missed an event at "Lisbon Padel Arena" and a club located in Lisbon | 0129 `search_events/groups/communities` | #258 (0130: venue / event location text and community location, ranked below names) |
| B12 | Web: `SidebarInset` had no `min-w-0`, so a wide child pushed the whole inset, header buttons included, past the viewport | `apps/web` app shell | #254 |
| B13 | Web dark mode: the selected filter chip (primary on primary) was near-invisible | W3 filter chips | #257 (semantic colours) |
| B14 | Main's E2E suite 03 (search-icon test) and suite 09 (pending-request test) broke once 0128 / 0129 were on the local stack | E2E suites 03, 09 | #259 |
| B15 | A second Home Find to the same tab while Explore stayed mounted did not re-focus the input (M1 open item) | mobile Explore route | #260 (arrival stamp `at`) |
| B16 | The mobile E2E job timeout (90 min) had no headroom: a fully green run (#260) took 89.75 min for 136 tests in 16 suites, and #262's first run was cut off at 90 | `.github/workflows/e2e-mobile.yml` | #262 (120 min) |
| B17 | About 80 minutes into a serial run the simulator's accessibility tree went empty (idb "No translation object returned", or a single zero-size `AXApplication`), even though the app sat on its welcome screen. The driver read that as "stale session survived keychain reset (saw "")" and burned 3 × 30 s per fresh-install suite until the job timed out. Restarting `idb_companion` did not help; a simulator reboot did | E2E driver `freshInstall` / `snapshot` | #263 (persistent-wedge detection + at most 2 reboots per suite) |

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

**Done** — see the status table and the hosted hand-off.

## Status (2026-09-30)

**Complete.** Migrations are 0128–0130: the two planned plus **0130** (search also matches location, B11), all
applied to hosted on 2026-09-30. Web shipped as W1–W3 and mobile as M1–M3. Mobile users get M1–M3 with the next
TestFlight build.

| Step | Scope | PR | State |
|------|-------|----|-------|
| 0 | Transcription + this plan | #252 | merged |
| 0128 | Explore viewer state — `viewer_state` on `explore_players / _communities / _groups`, followed players and pending requests left out of the rails (D8, B4), `communities.location_point` + create RPC point params + `set_community_location` (D2), `follow_player` / `unfollow_player` (D9), anon closed on all four explore RPCs (B7) | #253 | merged |
| 0129 | Discovery search — `unaccent` + `pg_trgm`, `search_norm` / `search_rank`, trigram indexes, `search_players / _events / _groups / _communities` (filters, sorts, `total_count`, `viewer_state`), `search_suggest`, `search_for_you_terms` (D1, D2, D4, D6–D9, D13; B3) | #255 | merged |
| 0130 | Search also matches venue / event location text and community location, ranked below name matches; `communities_location_trgm_idx` (B11) | #258 | merged |
| M1 | Mobile Home + Explore feed: header, quick actions, Next Events / My Groups rails, FAB offset and off Explore, inline search entry, rails + See all with Follow / Join / Request, community location picker (UX-HOME-01, UX-EXPL-01..03; B1, B2, B5, B6, B8, B9, B14; D2) | #259 | merged |
| M2 | Mobile search states: For you + Recent searches, suggestions, All / typed results, back arrow, `/search` redirect, server-side `ExploreList` (UX-EXPL-04..06; B3, B15; D5, D6, D7, D12) | #260 | merged |
| M3 | Mobile results by type + filters: count, Filter sheet per tab, applied chips, stepped distance, `DateField` min/max; E2E job timeout 90 → 120 min (UX-EXPL-07, 08; D13; B16) | #262 | merged |
| E2E | Driver recovers from a wedged simulator accessibility tree (B17) | #263 | merged when its E2E is green |
| W1 | Web Home: quick actions, Next Events and My Groups rails, EmptyStates (UX-HOME-01 web; B12) | #254 | merged |
| W2 | Web Explore feed + See all with Follow / Join, community location picker (UX-EXPL-01..03 web; B10; D2) | #256 | merged |
| W3 | Web search states, results and per-tab filters (UX-EXPL-04..08 web; B13) | #257 | merged |
| Final | Requirements amended (`discovery.md` v1.2, `home.md` v1.1, `communities.md` v1.3, a note in `groups.md`), UX-GLOB-08 superseded note, this status + hand-off | this PR | open |

The PR sequence above is kept as planned; this table is authoritative for what shipped.

**Decisions taken during implementation** (recorded in the Requirements where they change behaviour):

- *Server (0128–0130)*
  - There is no `update_community` RPC (settings write `communities` under RLS), so the point is written by a
    new `set_community_location(id, lat, lng, label)`: admins only, label and point together, null coordinates
    clear the point and keep the label.
  - `create_community_with_personal_tenant` was dropped and recreated with two trailing defaulted params rather
    than overloaded (two overloads differing only in defaults make named PostgREST calls ambiguous). Clients
    send `p_location_lat` / `p_location_lng` only when a point is picked, so they also work on a database
    without 0128.
  - `explore_events` keeps its body (its rail already excludes every event the viewer is on, so a
    `viewer_state` would always read `none`); only its grants changed.
  - `explore_communities` / `explore_groups` return explicit column lists (plus `distance_m`, `viewer_state`)
    instead of `setof`, keeping the raw geography out of the payload.
  - `follow_player` refuses `cannot_follow_self`, `blocked` (either direction) and `user_not_found`; direct
    `follows` writes stay open for now.
  - Search: a blank query returns every visible row in sort order, so filters work alone; an unknown sort
    raises `invalid_sort`; a format word (`americano`, `mexicano`, `up and down`) matches events at rank 4;
    `search_norm` stays executable by `authenticated` because Postgres checks it for writers of indexed rows.
  - For you: the city is `location_text` before the first comma; up to 3 formats of upcoming events visible
    within 50 km; up to 4 recommended community names.
  - 0130: a location match ranks 5–8, strictly below names (0–3) and the format match (4); `search_suggest` is
    unchanged and stays name-only.
- *Apps*
  - Card actions sit beside the card's tappable body, never inside it, so VoiceOver and the E2E driver reach
    them. An acted-on card keeps its resolved state and place until the screen loses focus (mobile
    `stickyRows.ts`, in a screen-level provider because FlashList recycles cells); web keeps it until refetch.
  - A community with rules sends Join to its join / community page for the acknowledgement, up front or on
    `rules_acknowledgement_required`. A pending invitation opens the join screen on mobile; on web the card reads
    "Invited" and opens the page.
  - A format For you chip opens the Events tab filtered to that format (every specification); city and
    community chips run as text (web and mobile).
  - Home's Find links carry `?search=1&tab=…` and land on that tab's results for an empty query, input
    focused. Web keeps `search`, `q` and `tab` in the URL (`history.pushState`), so reload and Back work.
  - Web: Create Event on Home needs a community (the wizard lives under one): one → straight in, several → a
    picker menu, none → "Join a community to create events". Home's communities list was removed (the audit's
    Home is quick actions, Next Events and My Groups).
  - Web: the Distance filter and sort are disabled, with a hint, when the viewer's profile has no point.
  - Mobile community location uses the profile `LocationSheet`; the venue-only `LocationPickerSheet` was
    deleted.

## Hosted hand-off

**Done 2026-09-30.** The product owner pasted 0128, 0129 and 0130 in order and recorded all three. A
combined check returned `true` for all seven probes: `follow_player`, `set_community_location`,
`search_players`, `search_suggest`, the 0130 index, `communities.location_point`, and anon blocked. From
outside, every new RPC called with its real arguments and the publishable key answers `42501 permission denied`,
which means it exists and anon is revoked.

**Ordering lesson:** web W2 / W3 were merged before this paste, and production web deploys from main against
hosted. Paste hosted migrations **before** merging a web PR that calls new RPCs. The account cannot `db push`;
the product owner pastes each file into the dashboard SQL editor **in this order** and records each one in
`supabase_migrations.schema_migrations` after it succeeds. Before this batch, hosted was current through 0127.

**Order: 0128 → 0129 → 0130.** 0129 needs 0128 (`communities.location_point`); 0130 recreates three of 0129's
functions. None of the three files has an explicit `begin` / `commit`: paste each **whole file as one script**
(a partial run of 0128 leaves the app without the explore RPCs it drops and recreates) and check it finished —
each ends with a self-check `do` block that raises if grants or objects are wrong.

**No edge function redeploy** — none of #253, #255, #258 or the app PRs touch `infra/supabase/functions`.

**App builds.** Older apps keep working after the paste: the `explore_*` RPCs keep their arguments and only
gain columns; the recreated create RPC takes the same named arguments (the two new ones default to null); old
settings screens still write `communities.location` directly. The new code needs the migrations **first**:
web from main (W2 calls `follow_player` / `set_community_location` / the new explore columns, W3 the
`search_*` RPCs) and the next TestFlight build with M1–M3. So paste all three before deploying web from main
and before that build goes out. (Production web deploys from main against hosted, which is why the paste was
done on 2026-09-30 as soon as the gap was noticed; see the ordering lesson above.)

1. **0128** `0128_explore_viewer_state.sql` — drops and recreates `explore_players`, `explore_communities`,
   `explore_groups` and `create_community_with_personal_tenant`; adds `communities.location_point`,
   `set_community_location`, `follow_player`, `unfollow_player`. No backfill. Probe:
   ```sql
   select exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'communities'
                    and column_name = 'location_point')
      and exists (select 1 from pg_proc where proname = 'follow_player') as has_0128;
   ```
2. **0129** `0129_discovery_search.sql` — **needs the `unaccent` and `pg_trgm` extensions.** The file creates
   both (`create extension if not exists … with schema extensions`); both ship with Supabase. If the editor
   refuses, enable them under Database → Extensions (schema `extensions`) and paste again — the file is
   additive and idempotent. Adds four trigram indexes and nine functions. Probe:
   ```sql
   select (select count(*) from pg_extension where extname in ('unaccent', 'pg_trgm')) = 2
      and (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
             and proname in ('search_norm','search_rank','search_pattern','search_players','search_events',
                             'search_groups','search_communities','search_suggest','search_for_you_terms')) = 9
      as has_0129;
   ```
3. **0130** `0130_search_location_match.sql` — replaces `search_events`, `search_groups`,
   `search_communities` in place (same signatures) and adds `communities_location_trgm_idx`. Probe:
   `select to_regclass('public.communities_location_trgm_idx') is not null as has_0130;`

Record each after it succeeds:
```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('0128', 'explore_viewer_state') on conflict do nothing;  -- repeat per file (0129 discovery_search,
-- 0130 search_location_match)
```

Verification, after all three:
```sql
-- 1. Nothing discovery-related is callable by anon; everything is callable by authenticated (expect 0 rows).
select p.proname
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('explore_players','explore_communities','explore_groups','explore_events',
                    'follow_player','unfollow_player','set_community_location',
                    'create_community_with_personal_tenant',
                    'search_norm','search_rank','search_pattern','search_players','search_events',
                    'search_groups','search_communities','search_suggest','search_for_you_terms')
  and (has_function_privilege('anon', p.oid, 'execute')
       or not has_function_privilege('authenticated', p.oid, 'execute'));

-- 2. Accent-insensitive matching (expect 'evora').
select search_norm('Évora');

-- 3. The five trigram indexes (expect 5 rows).
select indexname from pg_indexes
where schemaname = 'public'
  and indexname in ('profiles_full_name_trgm_idx','events_name_trgm_idx','communities_name_trgm_idx',
                    'groups_name_trgm_idx','communities_location_trgm_idx');

-- 4. One create RPC, with the two point params (expect 1 row, ending in p_location_lng).
select pg_get_function_identity_arguments(oid) from pg_proc
where proname = 'create_community_with_personal_tenant';

-- 5. Recorded (expect 0128, 0129, 0130).
select version, name from supabase_migrations.schema_migrations
where version in ('0128','0129','0130') order by version;
```
Then run `pnpm schema:check` against hosted as usual. The `search_*` RPCs need a signed-in user, so an
end-to-end check is the app itself: Explore → type a community's name → it appears under All.

## Open items

- **Dark-mode primary buttons (web)** — the button tokens are light-only (`tokens.generated.css`: "nothing adds
  the .dark class today", but next-themes does), so every primary button (Apply, Join, Follow) is dark purple on
  dark purple. Pre-existing and app-wide; W3 only moved its filter chips onto semantic colours. The Manage Event
  plan flagged the same thing. **Proposal:** one design-system PR that gives dark mode its own primary fill
  token, applied to both apps.
- **Web geocoder** — web has no geocoder, so a web community location is a typed label plus the admin's current
  position (the browser's Geolocation API); the event wizard and account settings have the same gap. Picking a
  third-party provider is a product and privacy decision. **Proposal:** a server-side geocode edge function
  (e.g. Nominatim or Mapbox behind our own endpoint) that `PlacePicker` queries for suggestions; decide the
  provider first. It touches `infra/`, so it queues E2E.
- **omar@ is not onboarded, and web `/app` renders blank for him** (pre-existing, found in W1/W3 walks; card
  actions were exercised as dora@ instead). **Proposal:** a web fix that routes a signed-in, not-onboarded user
  to onboarding (or a "finish on the app" screen) instead of an empty shell.
- **No unit test runner in `apps/web`** — the web-only logic of W1–W3 (recent searches, the URL state, filter
  chips, Create Event community choice) has no unit tests; the shared filter helpers are tested in
  `packages/api`, and mobile's recents and links rules in #260. The Manage Event plan left the same item.
  **Proposal:** add Vitest to `apps/web` and cover these modules first; one small web-only PR (no E2E).
- **E2E driver `keyboardTop()` ignores the suggestion (predictive) bar** — it reads the key rows, so a row under
  the predictive bar looks tappable while the tap lands in the bar. #259 works around it (`findFromHome` drags
  the list to dismiss the keyboard before tapping). **Proposal:** make `keyboardTop()` include the predictive
  bar's frame, then drop the workaround.
- **No community location backfill** — existing communities have no point until an admin re-saves the
  location, so they sort last on Distance and drop out of distance filters. **Proposal:** nudge admins
  (e.g. a pending-action row in Manage Community) rather than geocoding free text server-side.
- **Mobile Filter sheet scroll** — in the simulator, quick flicks over the chip rows did not scroll the sheet;
  slow drags did. E2E passes with the driver's scrolling. **Proposal:** check on a device with the TestFlight
  build. If it reproduces, let the chip rows pass vertical pans through to the sheet's scroll view.
- **Distance filtering is unexercised against seed data** — no seeded upcoming event has a `location_point` or
  a venue locally, so "Up to N km" on Events always returns 0 in demos and E2E. Real wizard events do get a
  point. **Proposal:** give the demo / E2E seed venues coordinates and point the seeded events at them, then add
  one E2E assertion for a distance-filtered result.
- **Filter logic exists twice** — mobile `components/explore/search/searchFilters.ts` copies web's
  `search-filters.ts` (state ↔ RPC JSON, chip labels). **Proposal:** move the platform-neutral part into
  `packages/api/src/discovery/` next to `compactSearchFilters`, so the two apps cannot drift.
- **Confirm #263 in real runs** — the wedge recovery only runs when the wedge happens. **Proposal:** search the
  next few full-run logs for `[e2e] freshInstall: accessibility tree wedged`. A reboot followed by passing suites
  confirms it. `still wedged after 2 simulator reboots` means restarting CoreSimulatorService in `run.mjs` is the
  next step.
- **TestFlight** — M1–M3 reach users with the next EAS build (hosted is already on 0130).
