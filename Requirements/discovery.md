# Discovery — Explore & Search

*Padel Jam — Version 1.2 • September 2026 • Amended by the Home & Explore UX audit (2026-09-29)*

*Changelog — v1.2 (2026-09-30): search moves inline onto Explore, per-tab filters, recent searches on the device, scoped search dropped; see the block below. v1.1 (May 2026): contextual search + unified filter.*

This document defines how a user discovers content in Padel Jam: the Explore tab — a passive, no-query screen of suggestions — and Search — an active, query-driven screen reached from the Home header and the Home "Find" quick actions. Both surfaces look across the four discoverable entities: events, groups, communities, and players.

> **Amended 2026-09-29 by the Home & Explore UX audit** (`docs/audit/2026-09-29-ux-home-explore.md`,
> UX-HOME-01 and UX-EXPL-01..08; decisions D1–D15 in `docs/audit/2026-09-29-ux-home-explore-plan.md`;
> migrations 0128–0130). Rows and paragraphs marked *(amended, UX-EXPL-nn / Dn)* carry the outcome; where the
> audit and this document disagreed, the audit won. It also supersedes UX-GLOB-08 (search as its own screen). In
> short:
>
> - **One search, inline on Explore.** Explore's title is followed by a full-width search input — the only
>   global search in the app. There is no search icon on any header, and no search screen: `/search` is kept
>   only as a redirect to `/(tabs)/explore?search=1&tab=…&q=…` (D12). Home's Find Event / Group / Community
>   open Explore with the input focused and that tab selected (UX-EXPL-01, UX-HOME-01).
> - **Explore feed** — rails in the order Players you might know, Events, Communities, Groups, each with See
>   all; no tab or chip bar on the feed, no floating Create Event button. Players, Communities and Groups hide
>   when empty; Events shows the standard empty state with "Create event" (D10). Cards carry inline actions:
>   Follow → Following; community Join / Request → Joined / Requested; group Join → Joined (D9). The rails
>   leave out people already followed and communities with a pending request (D8, B4).
> - **See all** opens a dedicated list per type (back button, centred title, full-width horizontal cards with
>   the same actions) — not Search (UX-EXPL-03).
> - **Search states** — empty query: For you chips (`search_for_you_terms`, D6) and Recent searches;
>   typing: name suggestions (`search_suggest`, D7); results: tabs **All / Events / Groups / Communities**,
>   All grouping Players, Events, Communities, Groups, and Players only in All (UX-EXPL-04..06).
> - **Filters are per tab** — one Filter bottom sheet whose body depends on the tab, kept in screen state and
>   restored on return; nothing carries across tabs (D13, UX-EXPL-08). Groups have no Privacy filter (D1).
> - **No scoped search** — the "Searching in [X]" banner and the per-scope tabs are dropped (D14).
> - **Recent searches stay on the device** — up to 10, deduplicated, never synced. The `recent_searches`
>   table was never built and is dropped from this document (D5).
> - **Search runs on the server** (0129, 0130), accent- and case-insensitive: names first, then (0130) venue /
>   event location text and community location, ranked strictly below name matches. Everything the viewer can
>   see is searchable, their own communities, groups and events included ("Open") (D8).

**Confirmed design decisions**

- ~~Discovery has two surfaces: Explore (a bottom-nav tab — passive suggestions, no query) and Search (an overlay reachable from a search icon on every primary screen).~~ *(amended, UX-EXPL-01)* Discovery lives on one screen, Explore: a search input under the title, and the suggestion feed below it. Tapping the input enters search in place; Cancel returns to the feed.

- Explore shows four suggestion rails: Players you might know, Events, Communities, Groups — each with a "See all".

- ~~Search is the same overlay everywhere — what changes is the CONTEXT (scope) it opens with. The opening screen determines the scope, the banner ("Searching in \[X\]"), the default tab, and which tabs are shown.~~ *(amended, D14)* Search is global — there is no scope and no banner. Only the Home Find actions preselect a tab.

- ~~Search has up to five result tabs: For you, Events, Groups, Community, Players. Tabs that the current scope makes redundant are hidden (Community tab hidden inside a community; Groups and Community hidden inside a group / Your Groups).~~ *(amended, UX-EXPL-06)* Search has four result tabs: All, Events, Groups, Communities. Players appear only in All.

- With the keyboard active, Search shows two blocks — personalized "For you" tags and Recent Searches. While typing it shows live suggestions. Confirming a search shows full results.

- ~~There is a single unified Filter sheet attached to the search bar — no longer per-tab. The active filter persists across tabs; each tab interprets the options that apply to its entity (e.g. a date filter on Communities returns communities WITH events on that date).~~ *(amended, UX-EXPL-08 / D13)* Filters are per tab: the Events, Groups and Communities tabs each have their own Filter sheet body, and switching tabs carries nothing across. All has no filter.

- Suggestion ranking (Explore) and the "For you" ranking are location- and relevance-based; the exact ranking is a refinable model.

- Search and Explore surface what the viewer can see: private groups and PRIVATE communities are hidden from non-members; request-to-join communities ARE surfaced (with their "Request to join" CTA). *(amended, D8)* Search also returns the viewer's own communities, groups (private ones included) and upcoming events, with an "Open" action; the Explore rails keep leaving them out.

## Overview

**Two surfaces**

| **Surface** | **Nature** | **Reached from** |
|----|----|----|
| Explore | Passive — curated suggestion rails, no query. | The Explore bottom-nav tab. |
| Search | Active — query-driven results across the relevant entity types. | ~~A search icon on every primary screen: Home header, Home Find quick actions, Events list, Explore, Community page, Your Groups, individual group page, Profile.~~ *(amended, UX-EXPL-01)* The search input on Explore, and the Home Find quick actions (which open it focused). |

**What is discoverable**

Both surfaces look across the same four entity types — events, groups, communities, and players — each owned by its own module. Discovery is a read layer over them: it ranks and filters, it does not own the entities.

**Out of scope**

- The entities themselves — events, groups, communities, profiles — defined in their own module docs.

- The follow system (following a player surfaced by discovery) — defined in the Profile doc; discovery only surfaces players and links to their profiles.

- The exact relevance / suggestion algorithm — treated here as a refinable model.

## Data model

Discovery is almost entirely a query layer over existing tables — events, groups, communities, profiles. It introduces a single table.

| **Table** | **Purpose** |
|----|----|
| ~~recent_searches~~ | ~~Per-user history of confirmed search queries, shown in the keyboard-active state.~~ *(amended, D5)* Not built. Recent searches are stored on the device only (AsyncStorage on mobile, `localStorage` on web, per user). |

*(amended, D2 / migrations 0128–0130)* Discovery adds no table. It adds `communities.location_point` (the picked place's point — see the Communities doc; groups use their community's point for distance), the RPCs listed under "Database schema", and trigram indexes.

*Search results, Explore rails and the "For you" tags are all computed at query time — no stored result sets. Search respects each entity’s Row Level Security, so a user never sees a private group or a private community’s content they have no access to.*

## Explore

Explore is a bottom-nav tab. It has no query — it is a screen of curated suggestion rails, ~~plus a search icon (into Search) and the floating Create Event button~~ *(amended, UX-EXPL-01/02)* under the title "Explore" (left-aligned, large) and the search input. It has no floating Create Event button.

| **3 The suggestion rails** |  |
|----|----|
| **Players you might know** | A horizontal rail of suggested players. Tapping a player opens their profile; following is handled by the Profile module. *(amended, UX-EXPL-02 / D9)* Each card has an inline Follow → Following; unfollowing stays on the profile. People already followed are left out. |
| **Events** | A rail of suggested events the user could join. |
| **Communities** | A rail of suggested communities to explore or join. *(amended, D9)* Each card has Join (public) or Request (request to join) → Requested; a community with rules opens its rules acknowledgement first. Communities with a pending request are left out (B4). |
| **Groups** | A rail of suggested public groups to join. *(amended, D1 / D9)* Each card has Join → Joined (which also joins the community); never Request. |
| **See all** | *(amended, UX-EXPL-03)* "See all" opens a list screen for that type (Players, Events, Communities, Groups): back button, centred title, full-width horizontal cards with the same inline actions — no search, tabs or filters. ~~"See all" opens Search with that entity type’s tab preselected, ranked by the same suggestion model — effectively "Explore, expanded for this type". From there the user can narrow with the unified Filter. For Players you might know it lands on a full followable-players list; for Events, the upcoming events ranked by proximity / relevance; for Communities and Groups the same idea per type.~~ |
| **Ranking** | Suggestions are ranked by location proximity and relevance (the user’s communities, groups, and follow graph). The precise ranking is a refinable model — consistent with the Home empty-state suggestions. |
| **Visibility** | Private groups and PRIVATE communities are hidden from non-members. Request-to-join communities ARE surfaced, with their "Request to join" CTA, so the user can request access right from Explore. |
| **Shell** | ~~Explore carries the floating Create Event button (per the Home doc) and a search icon that opens Search.~~ *(amended, UX-EXPL-01/02, HN-02)* No floating button and no header icon. Creating an event is a Home / Events action. |
| **Empty rails** | *(amended, D10)* Players, Communities and Groups are hidden when empty. Events shows the standard empty state with a "Create event" action. |

## Search — behaviour & states

~~Search is an overlay screen.~~ *(amended, UX-EXPL-01)* Search is a mode of the Explore screen: the feed gives way to the search states and a Cancel appears beside the input. It moves through three states.

| **4.1 Entry points** |  |
|----|----|
| **Where it lives** | ~~Search is reached from a search icon on every primary screen. The opening screen determines the SCOPE (see 4.5) — and from that the banner, the default tab, and which tabs are shown.~~ *(amended, UX-EXPL-01 / D14)* The search input on Explore. There is no search icon and no scope. |
| **Home header** | ~~Search opens with no scope (global) and lands on the For you tab.~~ *(amended, UX-HOME-01)* No search entry — the header has Chat and Notifications only. |
| **Home quick actions** | Find Event / Find Group / Find Community open ~~Search (global)~~ *(amended, UX-HOME-01)* Explore with the input focused, on the Events / Groups / Communities results for an empty query. |
| **Explore** | ~~The search icon on Explore opens Search with no scope, on For you.~~ *(amended)* Tapping the input enters search. |
| **Events list** | ~~The search icon on the Events list opens Search with no scope, preset to the Events tab.~~ *(amended)* No search entry. |
| **Community page** | ~~The search icon on a community page opens Search scoped to that community (see 4.5).~~ *(amended, D14)* No search entry. |
| **Your Groups list** | ~~The search icon there opens Search scoped to the user’s groups (see 4.5).~~ *(amended, D14)* No search entry. |

| **4.2 State 1 — keyboard active, empty query** |  |
|----|----|
| **For you tags** | A block of personalized tag shortcuts (e.g. recent themes, the user’s location, group names). Tapping a tag runs it as a search. *(amended, UX-EXPL-04 / D6)* Up to 8 wrapping chips from `search_for_you_terms()`: the viewer's city, the formats of upcoming events visible within 50 km, and the names of their top recommended communities. A format chip opens the Events tab filtered to that format; the others run as text. Hidden when nothing qualifies. |
| **Recent Searches** | A block listing the user’s recent confirmed searches; tapping one re-runs it. *(amended, UX-EXPL-04 / D5)* Most recent first, clock icon, ✕ per row and "Clear all"; up to 10, deduplicated case-insensitively, stored on the device; hidden when empty. |

| **4.3 State 2 — typing** |  |
|----|----|
| **Live suggestions** | As the user types, Search shows a live suggestions list (matching players, events, groups, communities). *(amended, UX-EXPL-05 / D7)* Up to 8 entity names from `search_suggest(q)`, prefix matches first, accent-insensitive, debounced to about 150 ms; each row has a chevron. |
| **Selecting a suggestion** | ~~Tapping a suggestion either opens that entity directly or runs it as a query.~~ *(amended, UX-EXPL-05)* Tapping a suggestion runs the full search for it and shows the tabbed results. |

| **4.4 State 3 — confirmed search** |  |
|----|----|
| **On confirm (return)** | The full results screen opens on the default tab for the current scope (usually For you), showing results of every relevant type. *(amended, UX-EXPL-06)* Results open on All (or the tab a Find action chose). A back arrow left of the input returns to the suggestions. |
| **Recording** | The confirmed query is saved to ~~recent_searches~~ *(amended, D5)* the device's recent searches. |
| **Tabs** | ~~Up to five tabs: For you, Events, Groups, Community, Players. Tabs hidden by the scope are not shown (section 4.5). Switching tab shows results for that type; the active filter persists across tabs (section 05).~~ *(amended, UX-EXPL-06 / D13)* Four tabs: All, Events, Groups, Communities — shown only once a query has run. Switching tab shows results for that type with that tab's own filters. |

### 4.5 Contextual search — scope, banner & tabs

*(amended, D14)* **Dropped.** The audit has one global search; sections 4.5 and 4.6 are kept only as a record. Context-scoped inputs (followers lists, invite pickers, group members, new chat) stay where they are and are not Search.

Search is the same overlay everywhere — the screen it opens from contextualises it. The context determines a SCOPE (automatic filter on what is searched), a BANNER ("Searching in \[X\]"), the default tab, and which tabs are visible. The unified filter (section 05) is applied on top.

| **Opened from** | **Scope** | **Banner** | **Tabs shown** | **Default tab** |
|----|----|----|----|----|
| Home (search icon), Explore, Profile | Global | (none) | For you · Events · Groups · Community · Players | For you |
| Home → Find Event / Group / Community | Global | (none) | (all five) | Events / Groups / Community (per the action) |
| Events list | Global | (none) | (all five) | Events |
| Community page | This community | "Searching in \[Community name\]" | For you · Events · Groups · Players (Community hidden — already inside one) | For you |
| Your Groups list | The user’s groups (all communities) | "Searching in your groups" | For you · Events · Players (Groups and Community hidden) | For you |

### 4.6 Why tabs are hidden by scope

A scoped search hides tabs whose entity type is implied by the scope:

- Inside a community → the Community tab is hidden (you cannot search communities from inside one).

- Inside one or more groups (single group, or Your Groups) → both the Groups and Community tabs are hidden (you cannot search groups within a group / your-groups context, and the community context isn’t the scope either).

- Players, Events, and For you stay available in most scopes — they remain meaningful relative to the scope (Players = people within the scope, Events = events within the scope, For you = mixed within the scope).

*The same Search component handles every scenario — only the context object (scope + banner + visible tabs + default) changes.*

## Search — results, tabs & unified filter

### 5.1 The For you tab

*(amended, UX-EXPL-06)* Replaced by **All**: Players, Events, Communities and Groups rows of vertical cards, in that order, only non-empty ones, no filter control. Players appear only here.

- The default tab after a confirmed search (unless the scope/entry-point preset another). It mixes the relevant types within the current scope, grouped into Players, Events, Communities, and Groups sections — whichever apply to the scope.

- No tab-specific filter logic — the unified filter applies; ranking is relevance-based.

### 5.2 The other tabs (per entity)

| **Tab** | **What it shows** |
|----|----|
| Events | Events matching the query, within the current scope. |
| Groups | Groups matching the query, within the current scope. Hidden when scope is a group / Your Groups. |
| Community | Communities matching the query. Hidden when scope is a community or inside a group context. |
| Players | Player profiles matching the query, within the current scope. |

### 5.3 The unified Filter sheet

*(amended, UX-EXPL-07/08, D1, D4, D13)* **Replaced by per-tab filters.** A typed tab shows its result count on the left and a Filter control on the right; applied filters appear as chips with ✕ in a sideways-scrolling row (absent when none). The Filter bottom sheet ("Filter", ✕, primary Apply) has a body per tab:

| **Tab** | **Options** |
|----|----|
| Events | Sort: Most relevant (default), Date, Distance · Date From / To · Type: nine chips — the eight below plus **Mixed Up and Down** (D4) · Distance "Up to N km" · Free event · Recurring |
| Groups | Sort: Most relevant, Recently created, Distance · Community (multi-select of the viewer's communities) · Distance · With upcoming events. **No Privacy** (D1) |
| Communities | Sort: Most relevant, Recently created, Distance · Type: Club, Team, Group of friends · Distance · Privacy: Public, Request to join, Private · With upcoming events |

Definitions (D13): "Most relevant" = match quality, then the Explore recommendation order; "Free" = fee off or zero; "Recurring" = part of a series; "With upcoming events" = at least one visible scheduled future event. Distance is a stepped control (5 / 10 / 25 / 50 / 100 km); it and the Distance sort need the viewer's location, and a row with no point sorts last and drops out under a distance filter (D2). Filters are isolated per tab and restored on return. Event-related filters no longer apply to Groups and Communities (5.4 is dropped).

There is ONE Filter sheet, opened from a filter icon on the search bar. It is shared across tabs — switching tab keeps the active filter. The sheet contains every filter option Search supports; each tab interprets the options that apply to it (see 5.4).

| **5.3 Filter options (single sheet)** |  |
|----|----|
| **Sort by** | Most relevant (default) · Date · Distance · Recently created. |
| **Date range** | From / to dates. |
| **Distance** | Slider — "up to X km". |
| **Event type** | Type × specification combinations: Classic Americano, Classic Mexicano, Up and Down, Mixed Americano, Team Americano, Mixed Mexicano, Team Mexicano, Team Up and Down. |
| **Free event** | Checkbox. |
| **Recurring event** | Checkbox. |
| **Community** | Filter to one of the user’s communities (hidden when the scope is already a community). |
| **Group** | Filter to one of the user’s groups (hidden when the scope is already a single group / Your Groups). |
| **Privacy** | Public · Request to join · Private — applies to communities. |
| **With upcoming events** | Checkbox — groups / communities with scheduled events. |

### 5.4 How each tab interprets the filter

The principle: when a filter does not apply directly to a tab’s entity, the entity is filtered by whether its EVENTS match. That way searching by date returns communities and groups that HAVE events on that date — not only the events themselves.

| **Filter option** | **Events tab** | **Groups tab** | **Community tab** | **Players tab** |
|----|----|----|----|----|
| Date range | Events on / in the range. | Groups with events on / in the range. | Communities with events on / in the range. | — |
| Distance | Events within distance. | Groups whose community is within distance. | Communities within distance. | — |
| Event type | Events of that type. | Groups with events of that type. | Communities with events of that type. | — |
| Free event | Free events. | Groups with free events. | Communities with free events. | — |
| Recurring | Recurring events. | Groups with recurring events. | Communities with recurring events. | — |
| Privacy | — | — | Communities of that privacy. | — |
| Upcoming events | — | Groups with scheduled events. | Communities with scheduled events. | — |
| Community | Events from groups in that community. | Groups inside that community. | — | — |
| Group | Events from that group. | — | — | — |

*Tabs hidden by the current scope simply don’t appear in this matrix for that scope.*

## Functional requirements

Must = MVP. Should = V2. Could = V3. IDs are prefixed DS (Discovery).

| **ID** | **Requirement** | **Priority** | **Notes** |
|----|----|----|----|
| DS-01 | Explore is a bottom-nav tab showing no-query suggestion rails. | **Must** |  |
| DS-02 | Explore shows four rails — Players you might know, Events, Communities, Groups — each with See all. | **Must** |  |
| DS-03 | *(amended)* Explore carries a full-width search input under its title — the only global search — and no header icon and no floating Create Event button. Players, Communities and Groups rails hide when empty; Events shows an empty state with "Create event". Cards carry inline Follow / Join / Request actions. | **Must** | UX-EXPL-01, UX-EXPL-02, D9, D10 |
| DS-04 | *(amended)* Search opens from the Explore search input, or from a Home Find quick action (focused, tab preselected). No screen has a search icon; `/search` only redirects to Explore. | **Must** | UX-EXPL-01, UX-HOME-01, D12; supersedes UX-GLOB-08 |
| DS-05 | *(amended)* With the input active and an empty query, Search shows "For you" chips (up to 8, from the viewer's city, nearby formats and recommended communities; hidden when none) and Recent searches (device-local; hidden when empty). Cancel returns to the feed. | **Must** | UX-EXPL-04, D5, D6 |
| DS-06 | While typing, Search shows a live suggestions list. | **Must** |  |
| DS-07 | Confirming a search opens results on the default tab for the current scope (usually For you). | **Must** |  |
| DS-08 | *(amended)* Search results have four tabs: All, Events, Groups, Communities, shown only once a query has run. All groups Players, Events, Communities and Groups (non-empty only); players appear only in All. | **Must** | UX-EXPL-06 |
| DS-09 | The For you tab mixes the relevant entity types within the current scope. | **Must** |  |
| DS-10 | *(amended)* Switching tab shows results for that entity type with that tab's own filters; nothing carries across, and returning restores the tab's filters and chips. | **Must** | UX-EXPL-08, D13 |
| DS-11 | *(amended)* Each typed tab (Events, Groups, Communities) has a result count and a Filter control opening a per-tab Filter sheet; applied filters show as removable chips. All has no filter. | **Must** | UX-EXPL-07, UX-EXPL-08, D13 |
| DS-12 | *(amended)* Filter options per tab — Events: sort, date range, nine type chips, distance, free, recurring; Groups: sort, community, distance, with upcoming events (no privacy); Communities: sort, type, distance, privacy, with upcoming events. No Group filter. | **Must** | UX-EXPL-08, D1, D4, D13 (§5.3) |
| DS-13 | ~~Each tab interprets the filter options that apply to its entity. Event-related filters on the Groups / Community tabs return entities WITH events matching the filter (e.g. date range on Community → communities with events in that range).~~ *(amended)* Dropped: each tab has only its own options. | — | D13 |
| DS-14 | ~~When Search is scoped (community / group / Your Groups), a "Searching in \[name\]" banner is shown and scope-redundant tabs are hidden.~~ *(amended)* Dropped: there is one global search. | — | D14 |
| DS-15 | *(amended)* A Find Event / Group / Community quick action opens Explore with the search input focused on the matching tab's results. | **Must** | UX-HOME-01 |
| DS-16 | *(amended)* Confirmed searches are stored on the device (per user, up to 10, most recent first, deduplicated case-insensitively, never synced) and shown as Recent searches, each removable, with Clear all. | **Must** | UX-EXPL-04, D5 |
| DS-17 | Search and Explore surface what the viewer can see: private groups and PRIVATE communities are hidden from non-members; request-to-join communities are surfaced with their Request to join CTA. | **Must** | Respects each entity’s RLS. |
| DS-18 | Tapping any result or suggestion navigates to that entity. | **Must** |  |
| DS-19 | Explore and "For you" ranking are location- and relevance-based. | **Should** | Refinable model. |
| DS-20 | *(amended)* Explore "See all" opens a list screen for that type, ranked by the same suggestion model: horizontal full-width cards with the inline actions, and no search, tabs or filters. | **Must** | UX-EXPL-03 |

## Database schema

Discovery adds one table. All search results are computed by querying events, groups, communities and profiles directly.

*(amended, D5 / migrations 0128–0130)* **Discovery adds no table**: `recent_searches` below was never built — recent searches live on the device. What was built:

- `communities.location_point geography(point)`, set by `create_community_with_personal_tenant(…, p_location_lat, p_location_lng)` and `set_community_location` (0128).
- `explore_players / _communities / _groups` return `viewer_state` (and `distance_m` for communities and groups); `follow_player` / `unfollow_player` (0128).
- `search_players`, `search_events`, `search_groups`, `search_communities` (query, per-tab filter JSON, sort, paging, `total_count`, `viewer_state`), `search_suggest`, `search_for_you_terms` (0129). Names are matched through `unaccent` + `pg_trgm` trigram indexes; 0130 also matches event venue / location text and community location, ranked below name matches.
- All of them are callable by signed-in users only, never by `anon`.

~~**recent_searches**~~ *(not built)*

CREATE TABLE recent_searches (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

query TEXT NOT NULL,

created_at TIMESTAMPTZ DEFAULT now()

);

-- Keep only the most recent N per user (trim on insert, app / RPC layer).

**Search queries**

- Event / group / community / player search runs as ILIKE or full-text queries against events, groups, communities and profiles.

- Every query is filtered by the existing RLS on those tables, so private and inaccessible content never appears in results.

- Sorting by Distance uses the user’s and the entity’s location; ranking ("Most relevant", Explore rails, For you) is a server-side scoring function — kept isolated so it can be tuned.

## Row Level Security policies

~~**recent_searches**~~ *(amended, D5 — not built; no policy)*

ALTER TABLE recent_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recent_searches: own" ON recent_searches FOR ALL

USING (user_id = auth.uid())

WITH CHECK (user_id = auth.uid());

No new policies are needed for search results: discovery reads events, groups, communities and profiles through their existing RLS, which already restricts each user to what they may see.

## Component & file map

Assumes the default Padel Jam stack — Next.js (App Router) + Supabase + shadcn/ui + Tailwind.

src/lib/hooks/useExplore.ts The four suggestion rails

src/lib/hooks/useSearch.ts Query state machine + results

src/lib/hooks/useRecentSearches.ts Read / record / clear

src/lib/discovery/ranking.ts Relevance + suggestion scoring (isolated)

src/app/(app)/explore/page.tsx Explore tab

src/components/explore/SuggestionRail.tsx + See all

src/components/explore/ExploreHeader.tsx search icon

src/app/(app)/search/page.tsx Search overlay

src/components/search/SearchInput.tsx

src/components/search/ForYouTags.tsx keyboard-active block

src/components/search/RecentSearches.tsx keyboard-active block

src/components/search/LiveSuggestions.tsx typing state

src/components/search/SearchResults.tsx 5 tabs

src/components/search/ResultsForYou.tsx mixed sections

src/components/search/ResultsList.tsx single-type list

src/components/search/FilterSheet.tsx Single unified filter — all options

src/components/search/ScopeBanner.tsx "Searching in \[X\]" banner

src/lib/discovery/searchScope.ts Derives scope / banner / visible tabs / default tab from the opening screen

## Claude Code prompts

Run the section 07 schema and section 08 RLS as Supabase migrations first. Then run the two prompts in order.

**Prompt 1 — Explore**

**Build the Explore tab for Padel Jam.**

1.  Create src/lib/discovery/ranking.ts — a server-side scoring function (location proximity + relevance from the user’s communities, groups, and follow graph). Keep it isolated so it can be tuned later.

2.  Create useExplore.ts that returns four ranked rails — Players you might know, Events, Communities, Groups — each respecting the entities’ RLS (no private groups / inaccessible communities).

3.  Build the Explore tab (/explore): a SuggestionRail per type with a horizontal list and a "See all" into the full list; an ExploreHeader with a search icon into Search; the floating Create Event button.

**Prompt 2 — Search**

**Build Search for Padel Jam.**

4.  Create useSearch.ts as a three-state machine: keyboard-active / empty, typing, confirmed. Create useRecentSearches.ts (read / record on confirm / clear) backed by recent_searches.

5.  Build the Search overlay (/search): SearchInput, and the keyboard-active state showing ForYouTags and RecentSearches. While typing, show LiveSuggestions querying events / groups / communities / profiles.

6.  On confirm, open SearchResults with up to five tabs — For you, Events, Groups, Community, Players — driven by the scope. ResultsForYou mixes the relevant types within the scope; ResultsList renders a single type.

7.  Build the unified FilterSheet (single sheet on the search bar, shared across tabs): sort, date range, distance, event type combinations, free event, recurring, community, group, privacy, with upcoming events. The active filter persists across tabs. Each tab interprets the options that apply to it (per section 5.4 — e.g. a date range on the Community tab returns communities WITH events in that range).

8.  Build searchScope.ts to derive, from the opening screen, the SCOPE, the banner ("Searching in \[X\]"), the default tab, and which tabs to show — hiding Community inside a community, and hiding Groups / Community inside a single group or Your Groups. Render ScopeBanner above the results. Ensure every query is filtered by the scope AND each entity’s RLS. Write a Playwright spec for the three search states, the unified filter, scope-based tab hiding, and the Find quick actions presets.
