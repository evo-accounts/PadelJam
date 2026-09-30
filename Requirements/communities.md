# Communities Module — Create, View, Join & Manage

*Padel Jam — Version 1.3 • September 2026 • Location amended by the Home & Explore UX audit (2026-09-29)*

*Changelog — v1.3 (2026-09-30): location becomes a picked place with a map point (D2); see the block below. v1.2 (May 2026): empty state redesign, cover image, cancellation rules.*

This document defines the Communities module of Padel Jam — the top of the product hierarchy. A community is a club, team, or group of friends; it contains groups, hosts a posts feed, and carries reviews. Subscription rules for who can own how many communities, and which community tier confers which capabilities, live in the Profile & Settings document (section 7.6) — this doc references them. The Explore / discovery screen and the Profile module are specified separately.

> **Amended 2026-09-29 by the Home & Explore UX audit** (`docs/audit/2026-09-29-ux-home-explore.md`, decision D2
> in `docs/audit/2026-09-29-ux-home-explore-plan.md`, migration 0128). **A community's location is a picked
> place with a point.** Create Community and Community Settings replace the free-text field with the location
> picker (mobile: the profile `LocationSheet`; web: a label plus the browser's current position — the web has no
> geocoder yet). `location` keeps the place's label and the new `location_point geography(point)` its
> coordinates. The point is written by the create RPC (`p_location_lat` / `p_location_lng`, only sent when a
> point was picked) and by `set_community_location` (admins only; label and point together; null coordinates
> clear the point and keep the label). There is no backfill: existing communities get a point when an admin
> next saves the location. The point drives distance in Explore and search — for the community and its groups;
> a community without one sorts last on Distance and drops out under a distance filter. Search also matches the
> `location` label, below name matches (0130).

**Confirmed design decisions**

- A community is the top of the hierarchy (Community → Group → Event). Any authenticated user may create one, subject to the community-tier rules in the Profile & Settings doc (section 7.6).

- Every community is created with an auto-generated “general group”, named “[Community] Group”. It starts public, with every member in it, and afterwards behaves like any other group — it can be renamed, made private and left *(amended 2026-09-25, UX-GRP-01; supersedes CM-07's “every member belongs to it”)*. A community can never be left without an active group: whichever group is the last active one cannot be archived.

- Community privacy has three levels: Public (join instantly), Request to join (admin approval required), Private (invite only). Groups have only two — there is no request-to-join at the group level.

- Roles live in community_members: owner / admin / member. There is one owner; admins are promoted via “Make admin”. Community admins are automatically admins of every group in the community.

- A “Members permission” screen lets the owner / admins toggle what regular members may do: invite members, approve join requests, create posts. Creating groups and creating events are NOT member permissions — they are admin-only and gated by community subscription tier.

- Joining a community (joining, being invited, or an accepted request) auto-adds the user to the general group. When the community has more than one group, an invite lets the inviter choose which group(s) to add the new member to.

- Community invitations have no accept / decline — the invitee either joins or dismisses the invite from notifications.

- A community is never deleted — only archived. Archiving a community archives all its groups; unarchiving restores them. Leaving a community removes the user from the community and from all of its groups.

- Each user can mark one community as their default — preselected in the community switcher.

- The Community tab has NO search affordance — not on the populated screen, not on the empty state. Discovery of new communities happens through the Suggested communities section (empty state), shared links and QR codes, and the Explore module (separate doc).

- A user who belongs to no community lands on an empty state with two sections: Suggested communities (proximity / friend-based recommendations) and a “Create your community” card (a direct entry into Create Community).

- Create Community has a Cover Image picker (separate from the Thumbnail), following the same pattern as the Thumbnail: a library of pre-defined images plus an Upload option.

- Create Community has a Cancellation & Attendance Rules section: a toggle that, when on, requires a Details text area. The rules are then surfaced on the community About tab as a “Cancellation and attendance rules” text link that opens a modal with the full text. When a non-member tries to join, the join screen requires the user to acknowledge the rules via a toggle before the Join CTA enables.

## Overview

**What a community is**

A community is the largest circle of people in Padel Jam — typically a padel club, a team, or a group of friends. It is the top of the hierarchy: a community contains groups, and groups contain events. A community also has a social layer of its own — a posts feed and reviews — and a member roster with roles.

**Hierarchy & roles**

- Community → Group → Event. A group belongs to one community; an event belongs to at most one group.

- Roles are defined here, in community_members: owner / admin / member. A community has exactly one owner; admins are promoted by the owner or other admins via “Make admin”.

- Community admins (owner included) are automatically the administrators of every group inside the community — this is the is_community_admin() authority the Groups doc relies on.

**The general group**

Events can only be created inside groups, so a community is never group-less. When a community is created, one group — the “general group” — is created automatically and named after the community. Every community member belongs to the general group; it cannot be archived while it is the community’s only group. Once the community has additional groups, the general group behaves like any other.

**Subscription gating (cross-reference)**

Two aspects of Communities are gated by the community subscription tier defined in the Profile & Settings doc section 7.6:

- How many communities a user may own. In the MVP, every available community tier (Starter, Basic, Community Pro) allows one community per user; multi-community ownership lifts on Club, which is post-MVP. The “New community” entry in the switcher is hidden when the user already owns a community.

- Per-community capacity and capability limits: members cap, groups cap, recurring events cap, co-organizer slots, custom-vs-default broadcasts, and support priority. The Settings doc is the single source of truth; this doc only references those rules where they affect a screen.

**The four sub-flows**

| **Sub-flow** | **Who** | **Summary** |
|----|----|----|
| Create Community | Any user (per subscription) | Create a community; a general group is auto-created with it. |
| View Community | Member | The community page — Posts / Events / Groups / Members / About tabs. |
| Join Community | Any user | Join a public community, request to join, or join by invitation. |
| Manage Community | Owner / admin | Settings, member permissions, groups, members, archive. |

**Two built-in features**

Lighter than the sub-flows above — these are features the community offers its members, not flows users navigate as their main task.

| **Feature** | **Who** | **Summary** |
|----|----|----|
| Posts feed | Any member | A social feed inside the community — posts, likes, comments. |
| Reviews | Members who played 3+ events | Star ratings and written reviews of the community. |

**Out of scope**

- The Explore / community-discovery screen — a separate document. This doc only references it as the destination of the Suggested communities section in the empty state.

- The Profile module, Home screen, and Auth / Onboarding — separate documents.

- The Groups and Events modules — fully specified in their own documents.

## Data model

Ten tables. profiles, groups and events are referenced as foreign keys and defined elsewhere. communities gains three columns in this revision (cover_image_path, cancellation_rules_enabled, cancellation_rules_text). Full SQL is in section 10.

| **Table** | **Purpose** |
|----|----|
| communities | The community — name, type, privacy, archive state, thumbnail, cover image, cancellation & attendance rules. |
| community_members | Membership with role (owner / admin / member). The role source for the whole hierarchy. |
| community_permissions | The “Members permission” toggles for a community. |
| community_join_requests | Pending / accepted / declined requests for request-to-join communities. |
| community_invitations | Invitations to join a community (no decline state). |
| community_reviews | One star rating + written review per member. |
| community_posts | Posts in the community feed — user posts and auto result posts. |
| post_likes | Likes on a post. |
| post_comments | Comments on a post. |
| user_default_community | Each user’s chosen default community. |

*Note: the Groups doc schema gains one column — groups.is_general BOOLEAN — to flag the auto-created general group. It is additive and migrates cleanly.*

## Create Community

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>3.1 Creating a community</strong></th>
</tr>
<tr>
<th><strong>Who can create</strong></th>
<th>Any authenticated user, subject to the community-tier rule in Profile &amp; Settings doc section 7.6. In the MVP, every available community tier allows one community per user, so a user who already owns a community cannot create a second one in the MVP (multi-community ownership is post-MVP, Club tier). The client gates entry by hiding the “New community” entry in the switcher and the “Create your community” card on the empty state when the current user already owns a community.</th>
</tr>
<tr>
<th><strong>Default tier on creation</strong></th>
<th>A newly-created community is provisioned on the Starter (free) community tier by default. Upgrading the community to Basic or Community Pro happens later, from the community subscription screen owned by the Profile &amp; Settings doc (section 7.3).</th>
</tr>
<tr>
<th><strong>Entry points</strong></th>
<th>(a) The “Create your community” card on the empty state of the Community tab (4.3). (b) The “+ New community” entry inside the community switcher dropdown (4.2). Both route to the same Create Community form.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>3.2 Create Community form</strong></th>
</tr>
<tr>
<th><strong>Title</strong></th>
<th>“Create Community” with an “×” close icon in the top-right.</th>
</tr>
<tr>
<th><strong>Name</strong></th>
<th>Required, single-line text.</th>
</tr>
<tr>
<th><strong>Description</strong></th>
<th>Optional, multi-line text.</th>
</tr>
<tr>
<th><strong>Location</strong></th>
<th>Optional, <s>free text</s> <em>(amended, D2)</em> a place picked with the location picker, stored as a label plus a map point. The form shows an info icon noting that adding a location is strongly recommended — it helps the community surface in proximity-based suggestions (empty state Suggested communities, Explore, Discovery sort).</th>
</tr>
<tr>
<th><strong>Type</strong></th>
<th>Required, one of: Club, Team, Group of Friends. A categorisation label rendered as a 3-button segmented control.</th>
</tr>
<tr>
<th><strong>Thumbnail</strong></th>
<th>Optional. The picker is a horizontal scroll of pre-defined thumbnail tiles plus a final tile with a “+”/upload affordance (“→” arrow icon) that opens the system file picker (jpeg / png / webp, max 5 MB). Tap to select; a single tile is highlighted as the active choice.</th>
</tr>
<tr>
<th><strong>Cover Image</strong></th>
<th>Optional. Follows the same pattern as Thumbnail but with a different aspect ratio (16:9 rectangle vs the thumbnail’s square). A horizontal scroll of pre-defined cover-image tiles plus a final upload tile. The Cover Image is displayed at the top of the community page hero on the View Community screen. Mandatory only on the wireframe sense — the field itself is database-nullable; if the user picks nothing, a default cover is rendered server-side.</th>
</tr>
<tr>
<th><strong>Privacy</strong></th>
<th>Required, one of three full-width selectable cards: Public (“Anyone can see and join this group instantly, no approval needed.”), Request to join (“Anyone can see but people need to request access. Admins must approve before joining.”), Private (“Only invited members can see and access this group.”). The selected card has an accented border.</th>
</tr>
<tr>
<th><strong>Cancellation &amp; Attendance Rules</strong></th>
<th>A toggle row near the bottom of the form titled “Cancellation &amp; Attendance Rules” with the helper “Enable if your community has rules for cancellations or no-shows.” When the toggle is on, a “Details” text area appears immediately below, required and non-empty before Save is enabled. When the toggle is off, the Details area is hidden and not persisted. See 3.3 for the downstream effects on View and Join.</th>
</tr>
<tr>
<th><strong>Auto general group</strong></th>
<th>On creation, a general group is created automatically and named “[Community name] group”. The creator joins it. This guarantees the community always has a group, so events can be created right away.</th>
</tr>
<tr>
<th><strong>Save</strong></th>
<th>A primary full-width button at the bottom. On submit, the entire community is created in one transaction (see DB impact). Errors surface inline next to the offending field.</th>
</tr>
<tr>
<th><strong>After creation</strong></th>
<th>A “Community Created!” screen with Share, Copy Link and QR Code actions, plus two buttons: “Create Event” (opens the Create Event wizard, the general group preselected) and “Manage Community” (opens the community on its Posts tab).</th>
</tr>
<tr>
<th><strong>DB impact</strong></th>
<th>Inserts communities (including the new cover_image_path and cancellation-rules columns), community_permissions (defaults), community_members (creator as owner), a community_subscriptions row at tier = starter (Profile &amp; Settings doc §7.3), a groups row with is_general = true, plus a group_members row for the creator.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>3.3 Cancellation &amp; Attendance Rules — downstream effects</strong></th>
</tr>
<tr>
<th><strong>Storage</strong></th>
<th>communities.cancellation_rules_enabled (BOOLEAN, default false) and communities.cancellation_rules_text (TEXT, nullable). The DB enforces a CHECK constraint: when enabled is true, text must be non-empty.</th>
</tr>
<tr>
<th><strong>View Community — About tab</strong></th>
<th>When the community has cancellation_rules_enabled = true, the About tab displays a text link labelled “Cancellation and attendance rules” (styled in the primary brand colour) below the Admins list. Tapping it opens a modal sheet that renders the cancellation_rules_text as read-only formatted text with a close affordance. Members and non-members alike can open the modal (a non-member sees it from the join modal’s About surface as well).</th>
</tr>
<tr>
<th><strong>Join Community — acknowledgement gate</strong></th>
<th>When the community has rules enabled, the join screen renders an additional row above the primary Join CTA: a toggle (off by default) plus the label “I have read and agree to the community’s cancellation and attendance rules.” The phrase “cancellation and attendance rules” is itself a tappable link that opens the same modal as above. The Join button is rendered disabled (light-blue, low contrast) until the toggle is flipped on; once on, it switches to the primary state and the user can tap Join.</th>
</tr>
<tr>
<th><strong>Apply to every privacy level</strong></th>
<th>The acknowledgement gate applies to all three privacy levels: Public (Join becomes Join + acknowledge), Request to join (Request becomes Request + acknowledge), Private (Join via invitation also requires acknowledge).</th>
</tr>
<tr>
<th><strong>Not persisted on members</strong></th>
<th>The acknowledgement is enforced at join time only — there is no per-member “acknowledged on” record in the MVP. If the rules text is later edited by an admin, existing members are NOT asked to re-acknowledge. The agreement is presumed to roll forward.</th>
</tr>
<tr>
<th><strong>Disabling later</strong></th>
<th>If an admin later disables the toggle in Community Settings, the rules text is preserved in cancellation_rules_text (not deleted) but the About-tab link disappears and the join-acknowledgement gate disappears. Re-enabling restores the same text without re-entry.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## View Community — member perspective

### 4.1 The community page

The community page is reached via the Community bottom-nav tab. Hero block at the top of the screen shows the Cover Image (or default), the Thumbnail centred over the cover, the community name, the description (short), and three at-a-glance pills: Type · Member count · Privacy. Below the hero, the five tabs:

| **Tab** | **Content** |
|----|----|
| Posts | The community’s social feed — see section 07. |
| Events | All events across every group in the community (in-progress / scheduled). |
| Groups | The community’s groups, each opening the group page (Groups doc). |
| Members | The member roster, with an Invite member entry (subject to permissions). |
| About | Type · member count · privacy pills at the top; then Location, Admins list, Created date, the privacy summary (“Request to join Community / Admins have to approve join requests”, “Public Community”, etc.), and — when enabled — the “Cancellation and attendance rules” text link (3.3). Below all that, the community rating block (“4 ★ · 15 reviews”) links to the Reviews screen. |

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>4.2 Community switcher &amp; default</strong></th>
</tr>
<tr>
<th><strong>Switcher</strong></th>
<th>The top of the Community tab has a community switcher (dropdown) listing the user’s communities under Managing and Participating, an Active / Archived toggle, plus a “+ New community” entry at the bottom. The currently selected community’s name appears in the header.</th>
</tr>
<tr>
<th><strong>“+ New community” availability</strong></th>
<th>Visible only when the user is below their owned-community cap (MVP: zero owned). When the cap is reached, the entry is hidden (not greyed out) — see 3.1 for the rule.</th>
</tr>
<tr>
<th><strong>No search</strong></th>
<th>There is no search affordance anywhere on the Community tab — not on the populated screen, not on the switcher, not on the empty state. Discovery of new communities is via Suggested communities (4.3), shared links / QR codes, and the Explore module.</th>
</tr>
<tr>
<th><strong>Default community</strong></th>
<th>A user can mark one community as their default — it is the one preselected in the switcher whenever they open the Community tab. Marking a new default shows a “[Community] is now your default community!” toast.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>4.3 Empty state (user belongs to no community)</strong></th>
</tr>
<tr>
<th><strong>Trigger</strong></th>
<th>Rendered on the Community tab when the user has zero rows in community_members (and zero accepted invitations awaiting them — those would auto-join).</th>
</tr>
<tr>
<th><strong>Header</strong></th>
<th>A “Community” title at the top of the screen, no switcher dropdown (there is nothing to switch between), no search icon.</th>
</tr>
<tr>
<th><strong>Section 1 — Suggested communities</strong></th>
<th>A horizontal scroll of community cards, ranked by proximity (using the user’s onboarding location) and by signal density (friends already in those communities). Each card shows cover image, name, type, member count, and a primary “View” affordance that opens the community in the join modal (section 05). The section has a “See all” link in its header that hands off to the Explore module. When the user has no resolvable location and no friend signal, the section can be empty — in which case it is hidden, not shown as a zero-state.</th>
</tr>
<tr>
<th><strong>Section 2 — Create your community card</strong></th>
<th>Immediately below the Suggested communities section, before the fold, a single card titled “Create your community” with supporting copy (“Build a club, a team or a group of friends and start playing.”) and a primary CTA “Create community” routing to the Create Community form (section 03). The card is hidden when the current user is already at the owned-community cap (MVP: hidden the moment the user owns one community; conceptually never shown in the MVP empty state because if they had created one they would not be on the empty state anyway — included for completeness).</th>
</tr>
<tr>
<th><strong>After first join / create</strong></th>
<th>Once the user joins or creates their first community, the empty state is replaced by the regular populated Community tab; that community is preselected in the switcher.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>4.4 More menu</strong></th>
</tr>
<tr>
<th><strong>Share</strong></th>
<th>System share sheet, copy link, QR code.</th>
</tr>
<tr>
<th><strong>Mark as default Community</strong></th>
<th>Sets user_default_community for the current user; shows the confirmation toast.</th>
</tr>
<tr>
<th><strong>Leave Community</strong></th>
<th>Confirmation modal: “Leaving this community will remove your access to the community and all of its groups. Are you sure you want to leave?” Leaving removes the user from the community and from every group in it.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Join Community

A non-member who finds or opens a community first sees a community join modal. What they can do from there depends on the community’s privacy and on whether the community has Cancellation & Attendance Rules enabled.

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>5.1 Public community</strong></th>
</tr>
<tr>
<th><strong>Preview</strong></th>
<th>The modal allows full navigation of all the community’s info (the same surfaces as the View Community About tab).</th>
</tr>
<tr>
<th><strong>Without rules enabled</strong></th>
<th>A primary “Join” button at the bottom joins the community instantly — no approval.</th>
</tr>
<tr>
<th><strong>With rules enabled (3.3)</strong></th>
<th>Above the Join button, an acknowledgement row: a toggle (off by default) and the label “I have read and agree to the community’s cancellation and attendance rules”, with “cancellation and attendance rules” as a tappable link to the rules modal. The Join button renders disabled (low-contrast blue) until the toggle is on.</th>
</tr>
<tr>
<th><strong>Result</strong></th>
<th>A “You joined [Community]!” banner; the community becomes the selected one in the top switcher.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>5.2 Request-to-join community</strong></th>
</tr>
<tr>
<th><strong>Preview</strong></th>
<th>The modal shows general info only (About basics, hero, member count, privacy summary, cancellation-rules link if enabled) — not the full content (Posts feed and full roster stay hidden).</th>
</tr>
<tr>
<th><strong>Without rules enabled</strong></th>
<th>A primary “Request to join” button. After requesting, the button shows “Requested”; the screen notes “Admins have to approve join requests”.</th>
</tr>
<tr>
<th><strong>With rules enabled</strong></th>
<th>Same acknowledgement row as 5.1, above the “Request to join” button, gating the same way.</th>
</tr>
<tr>
<th><strong>Approval</strong></th>
<th>When an admin (or a permitted member) accepts the request, the user is notified and gains full access. See 6.4.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>5.3 Private community</strong></th>
</tr>
<tr>
<th><strong>Preview</strong></th>
<th>General info only — same as request-to-join.</th>
</tr>
<tr>
<th><strong>Without rules enabled</strong></th>
<th>A primary “Join” button. The modal shows “[Name] invited you!” above the action area.</th>
</tr>
<tr>
<th><strong>With rules enabled</strong></th>
<th>Same acknowledgement row as 5.1, above the Join button, gating the same way.</th>
</tr>
<tr>
<th><strong>Invitations</strong></th>
<th>Community invitations have no accept / decline. The invitee simply joins if they want; otherwise the invite sits in notifications and can be dismissed with an “×”.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>5.4 Joining and the general group</strong></th>
</tr>
<tr>
<th><strong>Auto-add to general group</strong></th>
<th>However a user enters a community — joining a public one, an accepted request, or an invitation — they are automatically added to the community’s general group.</th>
</tr>
<tr>
<th><strong>Multi-group invites</strong></th>
<th>When the community has more than one group, an invite flow lets the inviter choose which group(s) to add the new member to (see 6.5); the user still joins the general group as well.</th>
</tr>
<tr>
<th><strong>Switcher selection</strong></th>
<th>Once a user joins, that community becomes the selected community in the top switcher.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Manage Community — admin perspective

Available to the owner and admins, who see a settings icon on the community page. It opens a “Manage Community” sheet: Community Settings, Manage Groups, Manage Members, plus Mark as default, Leave Community, and Archive Community.

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>6.1 Community Settings</strong></th>
</tr>
<tr>
<th><strong>Edits</strong></th>
<th>Name, description, location, type, thumbnail, cover image, privacy, and the Cancellation &amp; Attendance Rules toggle + Details. All fields use the same controls as Create Community (3.2).</th>
</tr>
<tr>
<th><strong>Editing rules</strong></th>
<th>Toggling Cancellation &amp; Attendance Rules ON requires a non-empty Details text area before Save is enabled. Toggling OFF preserves the existing Details text in cancellation_rules_text — the field is hidden but not nulled — so re-enabling later restores the same text.</th>
</tr>
<tr>
<th><strong>Existing members</strong></th>
<th>When the rules text is edited, existing members are NOT asked to re-acknowledge in the MVP.</th>
</tr>
<tr>
<th><strong>Save</strong></th>
<th>A standard edit sheet with Save / Cancel.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>6.2 Members permission</strong></th>
</tr>
<tr>
<th><strong>Purpose</strong></th>
<th>Owners and admins always have full control. This screen toggles what regular members are allowed to do within the community.</th>
</tr>
<tr>
<th><strong>Note on groups &amp; events</strong></th>
<th>Creating groups and creating events are NOT member permissions — they are restricted to community admins and gated by community subscription tier (Profile &amp; Settings doc §7.6).</th>
</tr>
<tr>
<th><strong>Invite members</strong></th>
<th>Allow members to invite others to the community / its groups.</th>
</tr>
<tr>
<th><strong>Approve member requests</strong></th>
<th>Allow members to accept join requests (otherwise only owner / admins can).</th>
</tr>
<tr>
<th><strong>Create posts</strong></th>
<th>Allow members to publish posts in the community feed.</th>
</tr>
<tr>
<th><strong>Storage</strong></th>
<th>One row per community in community_permissions.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>6.3 Manage Members</strong></th>
</tr>
<tr>
<th><strong>List</strong></th>
<th>The searchable member roster with an Invite members entry.</th>
</tr>
<tr>
<th><strong>Member detail</strong></th>
<th>Tapping a member opens a card: See profile, Make admin, Remove.</th>
</tr>
<tr>
<th><strong>Make admin</strong></th>
<th>Promotes a member to admin; a “[Name] is now an admin!” confirmation is shown. The admin role grants management of the community and all its groups.</th>
</tr>
<tr>
<th><strong>Remove</strong></th>
<th>Removing a member opens a confirmation modal first.</th>
</tr>
<tr>
<th><strong>Admin demotion</strong></th>
<th>Demoting an admin back to member is available from the same member card on an admin row, labelled “Remove admin role” with a confirmation modal.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>6.4 Member requests (request-to-join communities)</strong></th>
</tr>
<tr>
<th><strong>Where</strong></th>
<th>A “Member Requests” entry on the community page shows the pending count (“3 pendings”).</th>
</tr>
<tr>
<th><strong>Screen</strong></th>
<th>A list of requesters, each with Decline and Accept actions.</th>
</tr>
<tr>
<th><strong>Who can act</strong></th>
<th>Owner / admins always; regular members only if the “Approve member requests” permission is on.</th>
</tr>
<tr>
<th><strong>On accept</strong></th>
<th>The requester becomes a member, is added to the general group, and is notified. Their stored acknowledgement (if rules were enabled at request time) is honoured — no re-acknowledgement is required.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>6.5 Inviting members</strong></th>
</tr>
<tr>
<th><strong>Community with one group</strong></th>
<th>The invite confirmation reads “Members will be added to community and General Group” — the new members join the community and the general group.</th>
</tr>
<tr>
<th><strong>Community with multiple groups (direct invite)</strong></th>
<th>The invite flow shows “Select at least 1 group to add the new members” with a checklist of groups. The new members join the community, the general group, and the selected group(s); they can join other public groups themselves later.</th>
</tr>
<tr>
<th><strong>Sharing</strong></th>
<th>Invites can also be sent via Share, Copy Link, or QR Code.</th>
</tr>
<tr>
<th><strong>Shared link with multiple groups</strong></th>
<th>When a SHARED link / QR is opened by the receiver and the community has more than one group, the receiver lands on a “Choose a group” screen and picks one or more groups to join along with the community. If the community has only the general group, the receiver joins the community and the general group directly — no picker.</th>
</tr>
<tr>
<th><strong>Rules acknowledgement on shared links</strong></th>
<th>When the community has Cancellation &amp; Attendance Rules enabled, the receiver of a shared link / QR also sees the acknowledgement toggle before they can confirm the join.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>6.6 Archive &amp; ownership</strong></th>
</tr>
<tr>
<th><strong>Archive Community</strong></th>
<th>Confirmation: “Archiving community will archive [N] groups inside it. Are you sure you want to archive?” Archiving the community archives every group within it.</th>
</tr>
<tr>
<th><strong>Unarchive</strong></th>
<th>Confirmation: “Unarchiving community will unarchive [N] groups inside it.” Restores the community and all its groups.</th>
</tr>
<tr>
<th><strong>Never deleted</strong></th>
<th>A community is never fully deleted — archiving is the only way to retire it (it holds groups and game history).</th>
</tr>
<tr>
<th><strong>Where it shows</strong></th>
<th>Archived communities appear in the switcher under an Active / Archived toggle.</th>
</tr>
<tr>
<th><strong>Leaving as owner</strong></th>
<th>The sole owner cannot leave directly: a “Transfer ownership first” prompt routes them to the community members screen to assign a new owner.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Posts feed

Each community has a social feed on its Posts tab. It is a first-class MVP feature.

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>7 The feed &amp; a post</strong></th>
</tr>
<tr>
<th><strong>Feed</strong></th>
<th>A vertical list of posts, newest first. Each feed item shows the post content and its like count and comment count — but not the comments themselves.</th>
</tr>
<tr>
<th><strong>Post detail</strong></th>
<th>Tapping a post opens the post detail, where the user can read all comments, like the post, and add their own comment.</th>
</tr>
<tr>
<th><strong>Composer</strong></th>
<th>A post supports text and one optional photo. The composer is a full-screen entry with a Cancel and a post action.</th>
</tr>
<tr>
<th><strong>Likes</strong></th>
<th>Any community member can like a post; tapping again removes their like. There is no dislike — the only states are “liked” and “not liked”. Enforced one like per user via post_likes.</th>
</tr>
<tr>
<th><strong>Comments</strong></th>
<th>Any community member can comment on a post (post_comments). Comments appear in the post detail.</th>
</tr>
<tr>
<th><strong>Result posts</strong></th>
<th>The feed also receives auto-generated result posts — the “post to the community feed” option from the Events Share Results flow. They render with a standard result format and behave like normal posts (likeable, commentable).</th>
</tr>
<tr>
<th><strong>Permission</strong></th>
<th>Creating a post requires the community’s “Create posts” permission (on by default). Owners / admins can always post.</th>
</tr>
<tr>
<th><strong>Visibility</strong></th>
<th>The feed is visible to community members. For request-to-join and private communities, non-members see only general info, not the feed.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Reviews & ratings

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<thead>
<tr>
<th colspan="2"><strong>8 Community reviews</strong></th>
</tr>
<tr>
<th><strong>Who can review</strong></th>
<th>Only members who have participated in at least 3 events in this community can write a review. One review per eligible member.</th>
</tr>
<tr>
<th><strong>Writing a review</strong></th>
<th>A “Write a review” sheet: a 1–5 star rating and an optional written detail. Save / Cancel.</th>
</tr>
<tr>
<th><strong>Editing</strong></th>
<th>A member can edit their own review later; it stays one review per member (community_reviews has a unique constraint on community + user).</th>
</tr>
<tr>
<th><strong>Average rating</strong></th>
<th>The community’s average star rating is shown on the About tab (e.g. “4.1 ★ · 15 reviews”) and is available to the discovery / Explore surface.</th>
</tr>
<tr>
<th><strong>Reviews screen</strong></th>
<th>A dedicated Reviews screen lists all reviews with the average, a sort control, and a rating filter; it has a “Write a review” entry.</th>
</tr>
</thead>
<tbody>
</tbody>
</table>

## Functional requirements

Must = MVP. Should = V2. Could = V3. IDs are prefixed CM (Communities).

| **ID** | **Requirement** | **Priority** | **Notes** |
|----|----|----|----|
| CM-01 | Any authenticated user can create a community, subject to the community-tier rule in Profile & Settings doc §7.6. In the MVP every available tier allows one community per user. | **Must** | Multi-community = Club tier (post-MVP). |
| CM-02 | The “New community” entry in the switcher and the “Create your community” card on the empty state are hidden when the current user already owns a community. | **Must** |  |
| CM-03 | Community fields: name, description, location, type, thumbnail, cover image, privacy, cancellation_rules_enabled, cancellation_rules_text. | **Must** |  |
| CM-04 | Community privacy is one of Public / Request to join / Private. | **Must** |  |
| CM-05 | Creating a community auto-creates a general group named after the community. | **Must** |  |
| CM-06 | After creation the user gets Share / Copy Link / QR Code, Create Event, and Manage Community. | **Must** |  |
| CM-07 | *(amended 2026-09-25)* Every new member is added to the general group; they may leave it like any other group. | **Must** | UX-GRP-01 |
| CM-08 | *(amended 2026-09-25)* A community always keeps at least one active group: whichever group is the last active one cannot be archived. The general group starts public. | **Must** | UX-GRP-01, migration 0108 |
| CM-09 | The community page has Posts / Events / Groups / Members / About tabs and a hero block with cover image + thumbnail. | **Must** |  |
| CM-10 | A community switcher lets the user move between their communities (Managing / Participating + Active / Archived toggle + a “+ New community” entry). | **Must** |  |
| CM-11 | A user can mark one community as default — preselected in the switcher. | Should |  |
| CM-12 | A user in no community sees an empty state titled “Community” with two sections: Suggested communities (proximity / friend signal, with a “See all” link to Explore) and a “Create your community” card. There is no search affordance. | **Must** |  |
| CM-13 | There is no search affordance on the Community tab — not on the populated screen and not on the empty state. | **Must** |  |
| CM-14 | Public = join instantly; Request-to-join = request + approval; Private = invite only. | **Must** |  |
| CM-15 | A non-member first sees a community join modal — full info for public, general info for request / private. | **Must** |  |
| CM-16 | Joining or being added to a community auto-adds the user to the general group. | **Must** |  |
| CM-17 | Inviting to a community with multiple groups lets the inviter pick which group(s). | **Must** |  |
| CM-18 | Community invitations have no accept / decline — the invitee joins or dismisses. | Should |  |
| CM-19 | Roles are owner / admin / member; one owner; admins promoted via Make admin; demotion via Remove admin role. | **Must** |  |
| CM-20 | Community admins are automatically admins of every group in the community. | **Must** |  |
| CM-21 | A Members permission screen toggles member abilities: invite, approve requests, create posts. Creating groups and events is admin-only and gated by community subscription tier (Profile & Settings doc §7.6). | **Must** |  |
| CM-22 | Manage Community covers Settings, Manage Groups, Manage Members, Mark default, Leave, Archive. | **Must** |  |
| CM-23 | Manage Members allows See profile / Make admin / Remove admin role / Remove, with confirmation. | **Must** |  |
| CM-24 | Request-to-join communities show a Member Requests screen with Accept / Decline. | **Must** |  |
| CM-25 | A community is never deleted — only archived; archiving archives all its groups. | **Must** |  |
| CM-26 | Unarchiving a community restores all its groups, with confirmation. | Should |  |
| CM-27 | Leaving a community removes the user from the community and all its groups. | **Must** |  |
| CM-28 | The sole owner cannot leave without transferring ownership first. | **Must** |  |
| CM-29 | The thumbnail picker offers a library of pre-defined images plus an Upload option (jpeg / png / webp, max 5 MB). | **Must** |  |
| CM-30 | The cover image picker follows the same pattern as the thumbnail picker (library + Upload), with a wider aspect ratio. | **Must** |  |
| CM-31 | Create Community has a Cancellation & Attendance Rules toggle. When ON, a Details text area is required and non-empty. | **Must** |  |
| CM-32 | When rules are enabled, the About tab renders a “Cancellation and attendance rules” text link that opens a modal with the read-only rules text. | **Must** |  |
| CM-33 | When rules are enabled, the join screen renders an acknowledgement toggle above the Join CTA with a “cancellation and attendance rules” link to the modal; the Join CTA is disabled until the toggle is on. | **Must** |  |
| CM-34 | The acknowledgement gate applies to all three privacy levels (Public Join, Request-to-join Request, Private invitation Join). | **Must** |  |
| CM-35 | Disabling the toggle in Community Settings hides the About link and the join gate but preserves cancellation_rules_text for later re-enabling. | **Must** |  |
| CM-36 | The Posts feed shows posts with like and comment counts; tapping opens the post for comments. | **Must** |  |
| CM-37 | A post supports text and one optional photo. | **Must** |  |
| CM-38 | Posts can be liked (toggle: like / remove like — no dislike) and commented on by community members. | **Must** |  |
| CM-39 | The feed also receives auto-generated result posts from Share Results. | Should |  |
| CM-40 | A community member who has participated in at least 3 events in the community can write one review (rating + text), editable. | **Must** |  |
| CM-41 | The community’s average rating is shown on About and available to discovery. | **Must** |  |
| CM-42 | A community can be shared via link and QR code. | Could |  |
| CM-43 | *(amended)* Location is optional, picked with the location picker (a label plus a map point, not free text); the form surfaces an info icon explaining it helps the community appear in proximity-based suggestions and distance search. | Should | D2 (Home & Explore audit), migration 0128 |
| CM-44 | When a shared community link is opened and the community has more than one group, the receiver picks one or more groups to join along with the community. | **Must** |  |

## Database schema

profiles, groups and events are referenced as foreign keys and defined in their own docs. The is_community_admin() helper used across the hierarchy is defined here.

**communities**

| **Column** | **Type** | **Nullable** | **Notes** |
|----|----|----|----|
| id | UUID | No | gen_random_uuid() |
| created_by | UUID | No | FK profiles — the creator (becomes owner) |
| name | TEXT | No |  |
| description | TEXT | Yes |  |
| location | TEXT | Yes | *(amended, D2)* the picked place's label |
| location_point | GEOGRAPHY(POINT) | Yes | *(amended, D2 — migration 0128)* the picked place's point; the apps write it through the create RPC and `set_community_location` |
| type | TEXT | No | CHECK IN (club, team, group_of_friends) |
| thumbnail_path | TEXT | Yes | Supabase Storage path |
| cover_image_path | TEXT | Yes | Supabase Storage path; default rendered server-side if null |
| privacy | TEXT | No | CHECK IN (public, request_to_join, private) |
| cancellation_rules_enabled | BOOLEAN | No | default false |
| cancellation_rules_text | TEXT | Yes | Required (non-empty) when enabled = true; preserved when disabled |
| is_archived | BOOLEAN | No | default false |
| archived_at | TIMESTAMPTZ | Yes |  |
| created_at | TIMESTAMPTZ | No | default now() |
| updated_at | TIMESTAMPTZ | No | Trigger-updated |

CREATE TABLE communities (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

created_by UUID NOT NULL REFERENCES profiles(id),

name TEXT NOT NULL,

description TEXT,

location TEXT,

type TEXT NOT NULL CHECK (type IN ('club','team','group_of_friends')),

thumbnail_path TEXT,

cover_image_path TEXT,

privacy TEXT NOT NULL DEFAULT 'public'

CHECK (privacy IN ('public','request_to_join','private')),

cancellation_rules_enabled BOOLEAN NOT NULL DEFAULT false,

cancellation_rules_text TEXT,

is_archived BOOLEAN NOT NULL DEFAULT false,

archived_at TIMESTAMPTZ,

created_at TIMESTAMPTZ DEFAULT now(),

updated_at TIMESTAMPTZ DEFAULT now(),

CHECK (

NOT cancellation_rules_enabled

OR (cancellation_rules_text IS NOT NULL AND length(trim(cancellation_rules_text)) \> 0)

)

);

**community_members + is_community_admin()**

CREATE TABLE community_members (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,

user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

role TEXT NOT NULL DEFAULT 'member'

CHECK (role IN ('owner','admin','member')),

joined_at TIMESTAMPTZ DEFAULT now(),

UNIQUE (community_id, user_id)

);

-- Role helper used by Groups and Events RLS policies.

CREATE FUNCTION is_community_admin(cid UUID) RETURNS BOOLEAN AS \$\$

SELECT EXISTS (

SELECT 1 FROM community_members

WHERE community_id = cid AND user_id = auth.uid()

AND role IN ('owner','admin')

);

\$\$ LANGUAGE sql SECURITY DEFINER STABLE;

**community_permissions**

CREATE TABLE community_permissions (

community_id UUID PRIMARY KEY REFERENCES communities(id) ON DELETE CASCADE,

members_invite BOOLEAN NOT NULL DEFAULT false,

members_approve_requests BOOLEAN NOT NULL DEFAULT false,

members_create_posts BOOLEAN NOT NULL DEFAULT true,

updated_at TIMESTAMPTZ DEFAULT now()

);

-- Creating groups and creating events are NOT member permissions —

-- they are restricted to community admins and gated by community

-- subscription tier (Profile & Settings doc §7.6).

**community_join_requests + community_invitations**

CREATE TABLE community_join_requests (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,

user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

status TEXT NOT NULL DEFAULT 'pending'

CHECK (status IN ('pending','accepted','declined')),

created_at TIMESTAMPTZ DEFAULT now(),

responded_at TIMESTAMPTZ,

responded_by UUID REFERENCES profiles(id),

UNIQUE (community_id, user_id)

);

CREATE TABLE community_invitations (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,

inviter_id UUID NOT NULL REFERENCES profiles(id),

invitee_id UUID NOT NULL REFERENCES profiles(id),

status TEXT NOT NULL DEFAULT 'pending'

CHECK (status IN ('pending','accepted')),

created_at TIMESTAMPTZ DEFAULT now(),

responded_at TIMESTAMPTZ,

UNIQUE (community_id, invitee_id)

);

**community_reviews**

CREATE TABLE community_reviews (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,

user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),

body TEXT,

created_at TIMESTAMPTZ DEFAULT now(),

updated_at TIMESTAMPTZ DEFAULT now(),

UNIQUE (community_id, user_id)

);

**community_posts + post_likes + post_comments**

CREATE TABLE community_posts (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,

author_id UUID REFERENCES profiles(id),

kind TEXT NOT NULL DEFAULT 'user' CHECK (kind IN ('user','result')),

body TEXT,

image_path TEXT,

result_event_id UUID REFERENCES events(id) ON DELETE SET NULL,

created_at TIMESTAMPTZ DEFAULT now(),

updated_at TIMESTAMPTZ DEFAULT now(),

CHECK (body IS NOT NULL OR image_path IS NOT NULL OR kind = 'result')

);

CREATE TABLE post_likes (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,

user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

created_at TIMESTAMPTZ DEFAULT now(),

UNIQUE (post_id, user_id)

);

CREATE TABLE post_comments (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,

author_id UUID NOT NULL REFERENCES profiles(id),

body TEXT NOT NULL,

created_at TIMESTAMPTZ DEFAULT now()

);

**user_default_community + Groups doc sync**

CREATE TABLE user_default_community (

user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,

community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,

updated_at TIMESTAMPTZ DEFAULT now()

);

-- Groups doc sync: flag the auto-created general group.

ALTER TABLE groups ADD COLUMN is_general BOOLEAN NOT NULL DEFAULT false;

**Realtime**

ALTER PUBLICATION supabase_realtime ADD TABLE community_members;

ALTER PUBLICATION supabase_realtime ADD TABLE community_join_requests;

ALTER PUBLICATION supabase_realtime ADD TABLE community_posts;

ALTER PUBLICATION supabase_realtime ADD TABLE post_likes;

ALTER PUBLICATION supabase_realtime ADD TABLE post_comments;

## Row Level Security policies

A community row is broadly readable so discovery and the join modal work; the sensitive child data (posts, full roster) is gated by membership. Management is gated by is_community_admin().

**communities**

ALTER TABLE communities ENABLE ROW LEVEL SECURITY;

-- READ: any authenticated user (the join modal shows general info even

-- for request-to-join / private communities). Sensitive content is

-- gated on its own tables.

CREATE POLICY "communities: read" ON communities FOR SELECT USING (true);

-- INSERT: any user, creating their own community.

-- The per-user owned-community cap is enforced in the create RPC

-- (counts community_members rows with role = owner for auth.uid()

-- and rejects if the count meets the tier limit).

CREATE POLICY "communities: create" ON communities FOR INSERT

WITH CHECK (created_by = auth.uid());

-- UPDATE: owner / admin only (settings, archive).

CREATE POLICY "communities: manage" ON communities FOR UPDATE

USING (is_community_admin(id));

**community_members**

ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members: read" ON community_members FOR SELECT

USING (EXISTS (SELECT 1 FROM communities c WHERE c.id = community_members.community_id));

-- INSERT: a user joining a public community themselves, or an admin

-- adding a member. (Request / invitation joins run through an RPC.)

-- The RPC also verifies the rules-acknowledgement flag if the

-- community has cancellation_rules_enabled = true.

CREATE POLICY "members: join" ON community_members FOR INSERT

WITH CHECK (user_id = auth.uid() OR is_community_admin(community_id));

-- UPDATE (role changes) / DELETE (remove): owner / admins.

CREATE POLICY "members: manage" ON community_members FOR UPDATE

USING (is_community_admin(community_id));

CREATE POLICY "members: remove" ON community_members FOR DELETE

USING (user_id = auth.uid() OR is_community_admin(community_id));

**community_posts / post_comments / post_likes**

ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;

-- READ: members of the community.

CREATE POLICY "posts: read" ON community_posts FOR SELECT

USING (EXISTS (

SELECT 1 FROM community_members cm

WHERE cm.community_id = community_posts.community_id AND cm.user_id = auth.uid()

));

-- INSERT: a member posting as themselves. The "Create posts" permission

-- (community_permissions) is enforced in the post RPC / app layer.

CREATE POLICY "posts: create" ON community_posts FOR INSERT

WITH CHECK (

author_id = auth.uid()

AND EXISTS (

SELECT 1 FROM community_members cm

WHERE cm.community_id = community_posts.community_id AND cm.user_id = auth.uid()

)

);

-- post_likes and post_comments follow the same pattern: read for

-- community members, insert/delete as the acting user.

**community_permissions / reviews / requests / invitations**

-- community_permissions: read for members; update only owner / admin.

-- community_reviews: read for members; insert/update only the author

-- (one row per user enforced by the UNIQUE constraint).

-- community_join_requests: a user reads/creates their own; owner / admins

-- (or permitted members) read all and update status. The create RPC

-- verifies the rules-acknowledgement flag when applicable.

-- community_invitations: invitee and inviter read; inviter creates.

-- All follow the membership / is_community_admin() patterns above.

## Component & file map

Assumes the default Padel Jam stack — Next.js (App Router) + Supabase + shadcn/ui + Tailwind.

src/lib/hooks/useCommunities.ts Switcher list (Managing / Participating)

src/lib/hooks/useCommunity.ts Single community + Realtime

src/lib/hooks/useCreateCommunity.ts Create + auto general group + Starter sub

src/lib/hooks/useCanCreateCommunity.ts Reads tier rule from Profile doc §7.6

src/lib/hooks/useJoinCommunity.ts Join / request / accept invite + rules ACK

src/lib/hooks/useCommunityMembers.ts Roster / make admin / remove

src/lib/hooks/useCommunityPermissions.ts

src/lib/hooks/useCommunityPosts.ts Feed / post detail / like / comment

src/lib/hooks/useCommunityReviews.ts

src/lib/hooks/useSuggestedCommunities.ts Proximity / friend-signal ranking

src/lib/validations/community.schema.ts

src/app/(app)/community/page.tsx Community tab + switcher (or empty)

src/app/(app)/community/new/page.tsx Create Community form

src/app/(app)/community/\[id\]/page.tsx Community page (tabs)

src/components/community/CommunitySwitcher.tsx Managing/Participating + Active/Archived + New

src/components/community/CommunityModal.tsx Join modal (public/request/private)

src/components/community/EmptyState.tsx Title + SuggestedCommunities + CreateYourCommunityCard

src/components/community/SuggestedCommunities.tsx Horizontal scroll of suggested cards

src/components/community/CreateYourCommunityCard.tsx Visible only if user has zero owned communities

src/components/community/create/ThumbnailPicker.tsx Library + Upload (square)

src/components/community/create/CoverImagePicker.tsx Library + Upload (16:9)

src/components/community/create/CancellationRulesSection.tsx Toggle + Details textarea

src/components/community/RulesModal.tsx Read-only modal rendering the rules text

src/components/community/JoinAgreementToggle.tsx Acknowledgement toggle + link in CommunityModal

src/components/community/tabs/PostsTab.tsx

src/components/community/tabs/EventsTab.tsx

src/components/community/tabs/GroupsTab.tsx

src/components/community/tabs/MembersTab.tsx

src/components/community/tabs/AboutTab.tsx Renders the rules link when enabled

src/components/community/posts/PostComposer.tsx

src/components/community/posts/PostCard.tsx like + comment counts

src/components/community/posts/PostDetail.tsx comments + interact

src/components/community/reviews/ReviewsScreen.tsx

src/components/community/reviews/WriteReviewSheet.tsx

src/components/community/manage/ManageCommunitySheet.tsx

src/components/community/manage/CommunitySettings.tsx Includes Cover Image + Rules toggle

src/components/community/manage/MembersPermission.tsx

src/components/community/manage/ManageGroups.tsx

src/components/community/manage/ManageMembers.tsx

src/components/community/manage/MemberRequests.tsx

src/components/community/manage/InviteMembersSheet.tsx

src/components/community/manage/ArchiveCommunityModal.tsx

src/components/community/manage/TransferOwnershipPrompt.tsx

## Claude Code prompts

Run the section 10 schema and section 11 RLS as Supabase migrations first. Then run the three prompts in order.

**Prompt 1 — Create & Join Community**

**Build community creation and joining for Padel Jam.**

- Create useCanCreateCommunity.ts that reads the current user’s community subscription rule from the Profile & Settings doc §7.6 (in the MVP, returns true when the user owns zero communities and false otherwise). Use this to gate every entry point into Create Community: the “+ New community” item in the switcher and the “Create your community” card on the empty state must both hide (not grey out) when the hook returns false.

- Create the Zod schema (community.schema.ts) for the Create Community form: name required, description / location / thumbnail_path / cover_image_path optional, type and privacy enums, plus a “rules” object { enabled: boolean, text: string \| undefined } where text must be non-empty when enabled is true. Build the Create Community page (/community/new) with the fields in the order shown in 3.2: Name, Description (Optional), Location (Optional), Type (3-button segmented), ThumbnailPicker (horizontal scroll of pre-defined tiles + an upload-tile that opens the system file picker), CoverImagePicker (same pattern, 16:9 tiles), Privacy (three full-width selectable cards), and CancellationRulesSection (a toggle that conditionally reveals a Details textarea; the textarea is required when the toggle is on). On submit, run the create RPC in one transaction: insert communities (including cover_image_path, cancellation_rules_enabled, cancellation_rules_text), community_permissions (defaults), community_members (creator as owner), a community_subscriptions row at tier = starter, a groups row with is_general = true named “\[name\] group”, and a group_members row for the creator.

- Build the “Community Created!” screen — Share / Copy Link / QR Code, plus Create Event (opens the Create Event wizard with the general group preselected) and Manage Community.

- Build RulesModal.tsx — a sheet that renders communities.cancellation_rules_text as read-only formatted text with a close affordance. It is opened from the About tab’s “Cancellation and attendance rules” link and from the JoinAgreementToggle link.

- Build CommunityModal — the join modal a non-member sees first: full info for public communities, general info only for request-to-join and private. When communities.cancellation_rules_enabled is true, render JoinAgreementToggle above the primary CTA: a toggle plus the label “I have read and agree to the community’s cancellation and attendance rules” (the underlined phrase opens RulesModal). The primary CTA (Join / Request to join / Join via invitation) is rendered disabled until the toggle is on; the join RPC verifies the acknowledgement flag server-side and rejects with a structured error otherwise.

- On any successful join / accepted request / accepted invitation, add the user to community_members and to the general group; make that community the selected one in the switcher. Community invitations have no decline — they are joined or dismissed. Write a Playwright spec covering: create community with all fields including cover image and rules; create community is blocked when useCanCreateCommunity returns false; joining a public community without rules works in one tap; joining a public community with rules requires the toggle; the same for request-to-join.

**Prompt 2 — View & Manage Community + Empty state**

**Build the community page, the no-community empty state, and management for Padel Jam.**

- Build the community page (/community/\[id\]) with a hero block at the top (cover image + thumbnail centred on top of it, community name, description, and Type · Member count · Privacy pills) and the five tabs: Posts, Events, Groups, Members, About. Build CommunitySwitcher at the top of /community/page.tsx: Managing / Participating sections, Active / Archived toggle, default-community indicator, and a “+ New community” entry that is hidden when useCanCreateCommunity returns false. Do NOT add a search affordance anywhere on the Community tab.

- Build the About tab to render Type · Member count · Privacy pills, Location, Admins list, Created date, the privacy summary line (“Request to join Community / Admins have to approve join requests”, etc.), and — when communities.cancellation_rules_enabled is true — a brand-coloured text link “Cancellation and attendance rules” that opens RulesModal. Below all of that, the average-rating block links to the Reviews screen.

- Build the empty state (rendered on /community when the user has zero community_members rows): a “Community” title at the top, no switcher, no search. Section 1 is SuggestedCommunities — a horizontal scroll of cards driven by useSuggestedCommunities.ts (proximity to the user’s onboarding location + friend signal). Each card opens the community in CommunityModal (Prompt 1) on tap. The section has a “See all” link to Explore. When the hook returns zero suggestions, hide the section. Section 2 is CreateYourCommunityCard — visible before the fold, with a “Create community” CTA that routes to /community/new. Hide CreateYourCommunityCard when useCanCreateCommunity returns false (a defensive guard — in MVP the empty state shouldn’t coexist with an owned community anyway).

- Build ManageCommunitySheet (owner / admins): Community Settings, Manage Groups, Manage Members, Mark as default, Leave Community, Archive Community. Build CommunitySettings (name / description / location / type / thumbnail / cover image / privacy / Cancellation & Attendance Rules toggle + Details — same controls as Create Community 3.2); Save runs an UPDATE on communities with the new columns. Toggling rules OFF must preserve cancellation_rules_text. Build MembersPermission — the three toggles persisted to community_permissions.

- Build ManageMembers (roster; member card with See profile / Make admin / Remove admin role / Remove; confirmations) and MemberRequests (Accept / Decline for request-to-join communities; gated by role or the approve-requests permission). Build InviteMembersSheet: for a one-group community confirm “added to community and General Group”; for a multi-group community require selecting at least one group. When the community has rules enabled, a shared link that the receiver opens still shows the JoinAgreementToggle in their CommunityModal.

- Build ArchiveCommunityModal (archives / unarchives the community and all its groups) and TransferOwnershipPrompt for the sole owner leaving.

**Prompt 3 — Posts feed & Reviews**

**Build the community posts feed and reviews for Padel Jam.**

- Build useCommunityPosts.ts and the Posts tab: PostCard shows the post plus like and comment counts only; PostComposer supports text and one optional photo; creating a post checks the “Create posts” permission. Build PostDetail — opened by tapping a post — showing all comments and letting the user like and add a comment.

- Wire post_likes and post_comments with Supabase Realtime. Render auto result posts (kind = result) in the feed using a standard result layout; they are likeable and commentable like any post. Hook this into the Events Share Results flow.

- Build useCommunityReviews.ts, the Reviews screen (average rating, sort, rating filter) and WriteReviewSheet (1–5 stars + optional text, one editable review per member). Show the average on the About tab.

- Write a Playwright spec covering: create community → general group exists; the no-community empty state renders SuggestedCommunities and CreateYourCommunityCard; a public community without rules joins in one tap; a community with rules requires the toggle to enable Join; the About tab shows the rules link only when enabled; post + like + comment; write + edit a review; archive + unarchive.

*Padel Jam • Communities Module • v1.2 • Empty state redesign, cover image, cancellation rules*
