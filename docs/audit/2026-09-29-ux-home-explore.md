# UX Audit — Home and Explore (sections 3 and 6)

Transcription of `UX-Audit-Home-Explore.docx.pdf` (6 pages), received 2026-09-29. Text is the audit's own,
reflowed from the PDF; wording is unchanged. Implementation plan: [2026-09-29-ux-home-explore-plan.md](2026-09-29-ux-home-explore-plan.md).

These IDs are unrelated to the earlier, internal `UX-HOME-01..06` commits of July 2026 (search icon, quick-action
cards, empty-state cards, Home FAB). Where the two disagree, this audit wins.

> 3. Home — Initial screen and quick actions.

## UX-HOME-01

**Location:** Home

**Problem:** The quick actions row is cut off at the right edge and only three of the four actions are reachable. The "Next Events" empty state is a bare line of text with no icon and no way out of the empty condition. The floating action button sits too far above the navbar.

**Suggestion:** Home carries no search of its own. Its first section is the way into search, which lives on Explore (UX-EXPL-01). Quick actions:

- Make the row horizontally scrollable, each action a card of consistent size, so all four are reachable: Create Event, Find Event, Find Group, Find Community.
- Create Event opens the create flow.
- The three Find actions open Explore with its search input focused and the matching tab pre-selected. They do not open a search screen of their own.

Header:

- No search icon. Chat and notifications only.

Content:

- For the Next Events empty state, either surface events that exist platform-wide, or show the standard empty state.
- The Next Events and My Groups rows are overview sections — vertical cards scrolling horizontally, each with a "See all".
- Reduce the floating action button's bottom spacing to roughly 20px from the navbar.

Header per UX-GLOB-01. Empty state per UX-GLOB-03. Cards per UX-GLOB-04. Card orientation per UX-GLOB-09.

> 6. Explore — Recommendation feed for players, events, communities and groups, and the single entry point for search.

## UX-EXPL-01

**Location:** Explore

**Problem:** Explore carries a centred title and a tab bar that belong to a screen with a different purpose, and search has no single home in the app. The result is that what should be both a recommendation feed and the one place to search reads as neither.

**Suggestion:** Explore is a navbar destination holding two things: the search entry point at the top, and a recommendation feed below it.

Header:

- Title "Explore", left-aligned in the larger bold typeface, with no back button and no divider.
- No search icon in the header, here or anywhere else in the app.

Search input:

- A full-width search input below the title. This is the only global search in the app.
- It is inactive on arrival, showing the feed below it. Tapping it activates search: the keyboard opens, the feed gives way to the search states, and a "Cancel" action appears to its right to return to the feed.
- It is also activated from the Find Event, Find Group and Find Community quick actions on Home, which arrive with the input focused and the matching tab pre-selected.

Recommendation feed:

- A vertical stack of recommendation sections, each with a section title on the left and a "See all" on the right, in this order: Players you might know, Events, Communities, Groups.
- Each section is a horizontally scrollable row of vertical cards.
- "See all" opens the full list for that section (UX-EXPL-03).
- No tab bar on the feed. The tabs belong to the active search state (UX-EXPL-06).

Header per UX-GLOB-01. Search input per UX-GLOB-05. Card orientation per UX-GLOB-09.

## UX-EXPL-02

**Location:** Explore — Sections

**Problem:** The player cards show only an avatar and a name, with no action, so there is no way to follow someone from here. The Events section falls back to a bare line of text when empty. The floating action button overlaps the content of the community cards, covering their action button. Groups is the last section and is partially cut off.

**Suggestion:**

- Each player card carries an inline action to follow, which changes to a resolved state once tapped.
- Each community and group card carries an inline action reflecting its privacy setting — "Join" when entry is immediate, "Request" when approval is required.
- Remove the floating action button from this screen. Creating an event is a Home action; keeping it here duplicates the entry point and overlaps card content.
- Give the scroll container enough bottom padding that no section is cut off by the navbar.
- When a section has nothing to show, use the standard empty state rather than a line of text.
- When a section has no recommendations at all and no meaningful CTA, hide the section instead of showing an empty row.

Empty state per UX-GLOB-03. Cards per UX-GLOB-04.

## UX-EXPL-03

**Location:** Explore — See all

**Problem:** The "See all" action of each section has no destination. There is no screen listing the full set of recommended players, events, communities or groups.

**Suggestion:** Each "See all" opens a dedicated list screen for that section — one per type: Players, Events, Communities, Groups.

Header:

- Back button on the left, title matching the section name that was tapped, centred, and a divider below.

Content:

- A vertical list of all recommendations of that type.
- Cards are horizontal and full-width — avatar or image on the left, text in the middle, action on the right. This is not the vertical card used in the Explore row.
- Each row keeps the inline action defined in UX-EXPL-02 — follow for players, join or request for communities and groups.
- These are recommendation lists, not search results. They carry no search input, no tab bar and no filters — a user looking for something specific uses the search input on Explore.

Header and back button per UX-GLOB-01. Empty state per UX-GLOB-03. Avatars per UX-GLOB-04. Card orientation per UX-GLOB-09.

## UX-EXPL-04

**Location:** Explore — Search, empty query

**Problem:** With the input active and nothing typed, the user has nothing to act on and no way back into something they searched before.

**Suggestion:** While the input is active and empty, the feed is replaced by two blocks.

For you:

- Suggested search terms as tappable chips, wrapping across lines.
- Tapping a chip runs that query.

Recent searches:

- A list of the user's previous queries, most recent first, each with a clock icon.
- Tapping a row re-runs that query.
- Each row has a remove ( ✕ ) action, and a "Clear all" entry clears the list.
- Store up to 10, locally on the device.
- Hide the block entirely when there are no recent searches.
- Cancelling returns to the recommendation feed.

## UX-EXPL-05

**Location:** Explore — Search, suggestions

**Problem:** As the user types there is no intermediate state between the empty query and the full results.

**Suggestion:**

- As the user types, show a list of matching suggestions below the input, before any tab is applied.
- Each row is a suggested term or entity name, with a chevron on the right.
- Tapping a row runs the full search for that term and reveals the tabbed results.
- The list updates on each keystroke.

## UX-EXPL-06

**Location:** Explore — Search, all results

**Problem:** There is no mixed result state, so a user who does not know which type they are looking for has to guess a tab first.

**Suggestion:** Once a query has been run, a tab bar appears below the input: All, Events, Groups, Communities. It exists only in this state — never on the feed and never on the empty query.

The All tab:

- Default tab. Shows mixed results grouped by type, in this order: Players, Events, Communities, Groups.
- Each group has its section title and a horizontally scrollable row of vertical cards.
- Only groups with at least one result are displayed.
- Players appear only in this tab — there is no dedicated Players tab.
- A back arrow to the left of the input returns to the suggestions state.
- No filter control on this tab — it is a mixed overview, not a filtered query.

Empty state per UX-GLOB-03. Card orientation per UX-GLOB-09.

## UX-EXPL-07

**Location:** Explore — Search, results by type

**Problem:** There is no per-type result list, so results cannot be counted, filtered or acted on.

**Suggestion:** Selecting Events, Groups or Communities shows a vertical list of results for that type.

- Above the list, the result count on the left and the filter control on the right.
- Cards are horizontal and full-width — thumbnail on the left, name and details in the middle, action on the right.
- Applied filters appear as chips between the count and the list, each with a remove ( ✕ ).
- The chip row scrolls horizontally and collapses when no filter is applied.

Join action on Groups and Communities:

- Each row carries an inline action reflecting the entity's privacy setting.
- "Join" when it is open and entry is immediate.
- "Request" when approval is required, changing to a resolved state such as "Requested" once tapped.
- Private groups and communities the user cannot access do not appear in the results.

Empty state per UX-GLOB-03. Avatars per UX-GLOB-04. Card orientation per UX-GLOB-09.

## UX-EXPL-08

**Location:** Explore — Search, filters

**Problem:** Results cannot be narrowed, so a query returning a long list has no way of being refined.

**Suggestion:** The filter control opens a bottom sheet titled "Filter", with a close ( ✕ ) in the top-right corner. The body is specific to the active tab.

Events:

- Sort by — Most relevant (default), Date, Distance.
- Date — From and To pickers.
- Type — multi-select chips: Classic Americano, Classic Mexicano, Up and Down, Mixed Americano, Team Americano, Mixed Mexicano, Team Mexicano, Team Up and Down.
- Distance — slider, labelled "Up to N km".
- Free event — toggle.
- Recurring — toggle.

Groups:

- Sort by — Most relevant (default), Recently created, Distance.
- Community — multi-select, restricted to the user's communities.
- Distance — slider, labelled "Up to N km".
- Privacy — chips: Public, Request to join, Private.
- With upcoming events — toggle.

Communities:

- Sort by — Most relevant (default), Recently created, Distance.
- Type — chips: Club, Team, Group of friends.
- Distance — slider, labelled "Up to N km".
- Privacy — chips: Public, Request to join, Private.
- With upcoming events — toggle.

Footer:

- Primary button applying the filters and closing the sheet.
- Filters are isolated per tab — switching tabs does not carry them across, and returning to a tab restores its filters and chips.

Bottom sheet per UX-GLOB-02.
