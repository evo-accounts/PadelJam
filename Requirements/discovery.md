# Discovery — Explore & Search

*Padel Jam — Version 1.1 • May 2026 • Contextual search + unified filter*

This document defines how a user discovers content in Padel Jam: the Explore tab — a passive, no-query screen of suggestions — and Search — an active, query-driven screen reached from the Home header and the Home "Find" quick actions. Both surfaces look across the four discoverable entities: events, groups, communities, and players.

**Confirmed design decisions**

- Discovery has two surfaces: Explore (a bottom-nav tab — passive suggestions, no query) and Search (an overlay reachable from a search icon on every primary screen).

- Explore shows four suggestion rails: Players you might know, Events, Communities, Groups — each with a "See all".

- Search is the same overlay everywhere — what changes is the CONTEXT (scope) it opens with. The opening screen determines the scope, the banner ("Searching in \[X\]"), the default tab, and which tabs are shown.

- Search has up to five result tabs: For you, Events, Groups, Community, Players. Tabs that the current scope makes redundant are hidden (Community tab hidden inside a community; Groups and Community hidden inside a group / Your Groups).

- With the keyboard active, Search shows two blocks — personalized "For you" tags and Recent Searches. While typing it shows live suggestions. Confirming a search shows full results.

- There is a single unified Filter sheet attached to the search bar — no longer per-tab. The active filter persists across tabs; each tab interprets the options that apply to its entity (e.g. a date filter on Communities returns communities WITH events on that date).

- Suggestion ranking (Explore) and the "For you" ranking are location- and relevance-based; the exact ranking is a refinable model.

- Search and Explore surface what the viewer can see: private groups and PRIVATE communities are hidden from non-members; request-to-join communities ARE surfaced (with their "Request to join" CTA).

## Overview

**Two surfaces**

| **Surface** | **Nature** | **Reached from** |
|----|----|----|
| Explore | Passive — curated suggestion rails, no query. | The Explore bottom-nav tab. |
| Search | Active — query-driven results across the relevant entity types. | A search icon on every primary screen: Home header, Home Find quick actions, Events list, Explore, Community page, Your Groups, individual group page, Profile. |

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
| recent_searches | Per-user history of confirmed search queries, shown in the keyboard-active state. |

*Search results, Explore rails and the "For you" tags are all computed at query time — no stored result sets. Search respects each entity’s Row Level Security, so a user never sees a private group or a private community’s content they have no access to.*

## Explore

Explore is a bottom-nav tab. It has no query — it is a screen of curated suggestion rails, plus a search icon (into Search) and the floating Create Event button.

| **3 The suggestion rails** |  |
|----|----|
| **Players you might know** | A horizontal rail of suggested players. Tapping a player opens their profile; following is handled by the Profile module. |
| **Events** | A rail of suggested events the user could join. |
| **Communities** | A rail of suggested communities to explore or join. |
| **Groups** | A rail of suggested public groups to join. |
| **See all** | "See all" opens Search with that entity type’s tab preselected, ranked by the same suggestion model — effectively "Explore, expanded for this type". From there the user can narrow with the unified Filter. For Players you might know it lands on a full followable-players list; for Events, the upcoming events ranked by proximity / relevance; for Communities and Groups the same idea per type. |
| **Ranking** | Suggestions are ranked by location proximity and relevance (the user’s communities, groups, and follow graph). The precise ranking is a refinable model — consistent with the Home empty-state suggestions. |
| **Visibility** | Private groups and PRIVATE communities are hidden from non-members. Request-to-join communities ARE surfaced, with their "Request to join" CTA, so the user can request access right from Explore. |
| **Shell** | Explore carries the floating Create Event button (per the Home doc) and a search icon that opens Search. |

## Search — behaviour & states

Search is an overlay screen. It moves through three states.

| **4.1 Entry points** |  |
|----|----|
| **Where it lives** | Search is reached from a search icon on every primary screen. The opening screen determines the SCOPE (see 4.5) — and from that the banner, the default tab, and which tabs are shown. |
| **Home header** | Search opens with no scope (global) and lands on the For you tab. |
| **Home quick actions** | Find Event / Find Group / Find Community open Search (global) preset to the Events / Groups / Community tab respectively. |
| **Explore** | The search icon on Explore opens Search with no scope, on For you. |
| **Events list** | The search icon on the Events list opens Search with no scope, preset to the Events tab. |
| **Community page** | The search icon on a community page opens Search scoped to that community (see 4.5). |
| **Your Groups list** | The search icon there opens Search scoped to the user’s groups (see 4.5). |

| **4.2 State 1 — keyboard active, empty query** |  |
|----|----|
| **For you tags** | A block of personalized tag shortcuts (e.g. recent themes, the user’s location, group names). Tapping a tag runs it as a search. |
| **Recent Searches** | A block listing the user’s recent confirmed searches; tapping one re-runs it. |

| **4.3 State 2 — typing** |  |
|----|----|
| **Live suggestions** | As the user types, Search shows a live suggestions list (matching players, events, groups, communities). |
| **Selecting a suggestion** | Tapping a suggestion either opens that entity directly or runs it as a query. |

| **4.4 State 3 — confirmed search** |  |
|----|----|
| **On confirm (return)** | The full results screen opens on the default tab for the current scope (usually For you), showing results of every relevant type. |
| **Recording** | The confirmed query is saved to recent_searches. |
| **Tabs** | Up to five tabs: For you, Events, Groups, Community, Players. Tabs hidden by the scope are not shown (section 4.5). Switching tab shows results for that type; the active filter persists across tabs (section 05). |

### 4.5 Contextual search — scope, banner & tabs

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
| DS-03 | Explore carries a search icon and the floating Create Event button. | **Must** |  |
| DS-04 | Search opens from a search icon present on every primary screen (Home, Home Find quick actions, Events list, Explore, Community page, Your Groups, single group page, Profile). | **Must** |  |
| DS-05 | With the keyboard active and an empty query, Search shows "For you" tags and Recent Searches. | **Must** |  |
| DS-06 | While typing, Search shows a live suggestions list. | **Must** |  |
| DS-07 | Confirming a search opens results on the default tab for the current scope (usually For you). | **Must** |  |
| DS-08 | Search has up to five tabs: For you, Events, Groups, Community, Players. Tabs the current scope makes redundant are hidden. | **Must** |  |
| DS-09 | The For you tab mixes the relevant entity types within the current scope. | **Must** |  |
| DS-10 | Switching tab shows results for that entity type; the active filter persists across tabs. | **Must** |  |
| DS-11 | There is a single unified Filter sheet on the search bar — not per-tab. | **Must** |  |
| DS-12 | Filter options: sort, date range, distance, event type, free event, recurring, community, group, privacy, with upcoming events. | **Must** |  |
| DS-13 | Each tab interprets the filter options that apply to its entity. Event-related filters on the Groups / Community tabs return entities WITH events matching the filter (e.g. date range on Community → communities with events in that range). | **Must** |  |
| DS-14 | When Search is scoped (community / group / Your Groups), a "Searching in \[name\]" banner is shown and scope-redundant tabs are hidden. | **Must** |  |
| DS-15 | A Find Event / Group / Community quick action opens Search preset to the matching tab. | **Must** |  |
| DS-16 | Confirmed searches are stored per user and shown as Recent Searches. | **Should** |  |
| DS-17 | Search and Explore surface what the viewer can see: private groups and PRIVATE communities are hidden from non-members; request-to-join communities are surfaced with their Request to join CTA. | **Must** | Respects each entity’s RLS. |
| DS-18 | Tapping any result or suggestion navigates to that entity. | **Must** |  |
| DS-19 | Explore and "For you" ranking are location- and relevance-based. | **Should** | Refinable model. |
| DS-20 | Explore "See all" opens Search with that entity type’s tab preselected, ranked by the same suggestion model. | **Should** |  |

## Database schema

Discovery adds one table. All search results are computed by querying events, groups, communities and profiles directly.

**recent_searches**

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

**recent_searches**

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
