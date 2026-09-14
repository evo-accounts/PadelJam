# UX Audit — Community (UX-COMM-01..24)

Transcribed from `UX-Audit-Community.docx.pdf`, section "9. Community — Creating, joining, viewing and managing communities". 24 items.

Status: **transcribed, not yet planned.** Open questions are listed at the end and several are blocking.

---

## Roles and permissions (as the audit defines them)

Two roles only. **Admin** created the community or was promoted by another admin. **Member** joined or was invited. Admins have full control, including every group inside the community; there is no group-level admin role.

Permissions marked *toggle* are set per community in Members permissions (UX-COMM-17).

| Action | Admin | Member |
| --- | --- | --- |
| View all tabs and content | yes | yes |
| Create posts | yes | toggle, **on** by default |
| Create events | yes | toggle, **on** by default |
| Invite members | yes | toggle, **on** by default |
| Create groups | yes | toggle, **off** by default |
| Approve member requests | yes | toggle, **off** by default |
| Write a review | after 3 completed events | after 3 completed events |
| Edit community settings | yes | no |
| Set member permissions | yes | no |
| Manage groups | yes | no |
| See archived communities and groups | yes | no |
| Remove members | yes | no |
| Promote to admin | yes | no |
| Demote or remove another admin | yes | no |
| Archive / unarchive community | yes | no |
| Leave community | yes* | yes |

\* The last remaining admin cannot leave until another member has been promoted.

---

## The items

### UX-COMM-01 — Create Community
Rebuild as a task flow, not a destination. Hide the navbar. Close (✕) on the left in place of back, title centred, divider below; closing opens a confirmation sheet warning entered information will be lost. No draft.

Form: name; description (optional); location via the **location picker** with search, results and confirmation (map area is a static placeholder and results come from seeded addresses until a map provider is chosen); type (Club / Team / Group of Friends); thumbnail as a row of presets plus custom upload; cover image the same; once an image is set, change and remove actions appear in its top-right corner; privacy as three options each with a description (Public, Request to join, Private); cancellation and attendance rules as a toggle **inside a card**, with the details field appearing in the same card below the toggle and becoming required.

Footer: primary button fixed to the bottom, disabled until every required field is filled.

Permissions are not asked during creation. A new community starts with the defaults above. **Creating a community always creates a default group inside it**, so it is never without one.

### UX-COMM-02 — Community Created
Hide the navbar. Success illustration at the top (generic placeholder for now, unrelated to the cover). Title plus a short confirming line. Three square buttons side by side: Share, Copy Link, QR Code. Two fixed buttons at the bottom: "Create event" primary, "Manage community" secondary. Create event is always enabled and never disabled by subscription state. Share opens the native share sheet; Copy Link copies the invite link and shows a confirmation banner.

### UX-COMM-03 — QR Code
Present as a bottom sheet with a ✕ top-right, the code centred, the invite link below, and a single secondary "Download" action. Remove share and copy from the sheet — they exist on the screen behind it.

### UX-COMM-04 — Preview (non-member)
**A community the user does not belong to opens as a bottom sheet, never a full screen.**

Structure: ✕ top-right; cover and thumbnail, then the name; three attribute widgets side by side, each a card with icon, value and label — type, member count, privacy, **not text chips**; description, location, admins (photo, name, chevron), creation date; a plain-language line stating the privacy rule; the join action fixed at the bottom while content scrolls.

- **Public**: all tabs accessible from the preview — Posts, Events, Groups, Members, About — with About default. The fixed join action stays visible across tabs.
- **Request to join**: only About is visible, other tabs inaccessible, attribute widgets still shown. Action reads "Request to join", becomes "Requested" once tapped, tapping again cancels.
- **Private**: not discoverable anywhere. Reachable only through an invitation arriving as a notification. At the bottom, the inviter's photo and name above "Decline" (secondary) and "Accept" (primary). No plain Join action exists.

### UX-COMM-05 — Cancellation and Attendance Rules
When the community has rules, the preview requires explicit acceptance before joining: a toggle above the join action, with the words naming the rules tappable to open the full rules screen. Join stays disabled until the toggle is on. Applies to all three privacy settings.

Acceptance is given once, on entry. Later edits to the rules do **not** re-prompt existing members. The rules remain in the About tab.

### UX-COMM-06 — Joining
On success the sheet closes and the community opens in member mode as a full screen, becomes the selected community in the header switcher, and a temporary banner confirms the join. Accepting a private invitation behaves the same. For approval communities, joining does not happen on tap — the user stays in the preview showing "Requested".

### UX-COMM-07 — No community
Shown whenever the user belongs to no **active** community, on first access or after leaving/archiving all of them. Remove the Active/Archived tabs and the "New community" row from the body; move create to a "+" in the header. Empty state with icon, title, description and a CTA. Below it, suggested communities, each opening the preview sheet.

Archived: an archived community does not count as belonging to one. When the user administers archived communities, an "Archived" section appears below the suggestions, listing them as horizontal cards; tapping opens the read-only archived state with "Unarchive community" fixed at the bottom. This section exists only for the case where every community is archived and the switcher is unavailable.

### UX-COMM-08 — Member View
Being inside a community is a **navbar destination, not a sheet**, and carries no back button.

Header: thumbnail and name on the left with a chevron indicating a switcher; a "⋯" top-right for members, replaced by a settings icon for admins. **No cover, no centred thumbnail, no attribute widgets** — that identity block lives in About.

Tabs directly below the header: Posts, Events, Groups, Members, About. Posts is default. The tab bar scrolls horizontally so About stays reachable.

### UX-COMM-09 — Community Switcher
Tapping the community name opens a bottom sheet listing every community the user belongs to: thumbnail, name, role, with the active one marked. Selecting switches the whole screen and closes the sheet. Archived communities appear in a separate section at the bottom, **admins only**, opening the read-only archived state. "New community" as the last row. Always available — plan limits do not apply during the MVP.

### UX-COMM-10 — Posts tab
A composer entry pinned at the top, always visible even with no posts: user avatar on the left and a prompt such as "Share something with the community", styled as an input rather than a button. Hidden for users without permission. Tapping opens the full composer: full screen, keyboard open on launch, ✕ on the left, publish on the right, text field plus attach-image and link-event actions, publish disabled until there is content.

### UX-COMM-11 — Events, Groups and Members tabs
**Events**: "Create event" full-width at the top, only with permission; vertical list of horizontal cards (image, name, details).

**Groups**: "Create group" full-width at the top, only with permission; vertical list of horizontal cards (thumbnail, name, chevron). Archived groups never appear here for anyone — they live in Manage Groups.

**Members**: search input at the top; a "Member requests" entry above the invite action showing the pending count, when the community requires approval and the user can approve; "Invite member" only with permission; member list with photo, name and chevron. For admins a row opens the member actions sheet, for members it opens the profile.

No floating action buttons on any of these tabs. When a tab is empty and the user cannot create, the empty state appears without a CTA.

### UX-COMM-12 — About tab
Cover and thumbnail, then the name. The three attribute widgets side by side. Description, location, admins, creation date. Cancellation and attendance rules when present. Rating summary at the bottom — average, stars, review count — as a **tappable row with a chevron**, opening Reviews. It must read as tappable, not as a static summary with a text link.

### UX-COMM-13 — Reviews
With reviews: average, stars, count, and a bar chart of how many reviews gave each score. Two dropdown selectors, sort and rating filter, opening as **bottom sheets rather than inline chips**. Each review a card with author photo, name, stars and text. "Write a review" fixed at the bottom, only for users who have participated in 3 completed events in this community — the gate is participation, not role.

Empty with the gate met: icon, title, description and the fixed action. Empty without the gate: icon, title, and a description explaining that 3 completed events unlock reviewing. No action.

Write a review: a bottom sheet with ✕, star selector, details field, primary and secondary actions.

### UX-COMM-14 — Member overflow menu
The "⋯" opens a sheet with: Share community (native share sheet), Copy link, Community details (read-only), Leave community (destructive, confirmation per UX-COMM-23).

There is no default or favourite community. The tab opens whichever was last selected, and the switcher updates it.

### UX-COMM-15 — Admin settings menu
The settings icon opens a sheet holding every admin action: Edit community; Members permissions; Manage members; Manage groups; Manage requests (when approval is required); Share community (shares, does not invite — inviting lives on the Members tab and in Manage Members); Copy link; Archive community (destructive); Leave community (destructive).

### UX-COMM-16 — Community Settings
Same form as Create Community. ✕ on the left in place of back, since leaving discards changes; title centred, divider below. Primary save fixed at the bottom. Editing the rules does not re-prompt existing members.

### UX-COMM-17 — Members Permissions
An "Admins" block at the top explaining admins have full control (read-only). A "Members" block explaining what follows can be enabled or disabled. **Five toggles**, each with a description: Create groups, Create events, Invite members, Approve member requests, Create posts. ✕ on the left, title centred, divider below, primary save fixed at the bottom.

Defaults on a new community: on — create posts, create events, invite members; off — create groups, approve member requests.

### UX-COMM-18 — Manage Groups
Admin only. "Create Group" full-width at the top. Vertical list of active groups as horizontal cards. **Swiping a card reveals Archive.** Tapping opens the group. Archived groups in a separate labelled section at the bottom, each with an unarchive action — **this screen is the only place they are visible**. A group has no administration of its own.

### UX-COMM-19 — Manage Members
The same screen as the Members tab, reached from management; both share one component, the difference being that everyone arriving here is an admin, so every row exposes member actions. Search at the top; "Invite members" below it; "Member requests" above invite when approval is required; list with photo, name, role, chevron. Tapping opens the member actions sheet. **Swiping a row exposes the same actions.**

### UX-COMM-20 — Member Actions
Tapping a member row opens a sheet with their photo and name and three actions: See profile; Make admin (temporary banner on success); Remove (confirmation sheet stating the consequence).

Rules: promotion and removal are admin only; a member tapping a row goes straight to the profile. **Any admin can promote a member, demote another admin, or remove them. There is no protected role and no ownership to transfer.** The only restriction is the last admin, who cannot be demoted or removed while alone — blocked with a message saying another member must be promoted first.

### UX-COMM-21 — Member Requests
A "Member requests" entry with the pending count at the top of the Members tab and of Manage Members, above invite, shown only when the community requires approval and has at least one pending request. The screen lists each request with photo, name, how long ago, and Decline / Accept side by side. A request made from the preview appears here as pending, and the requester sees "Request" become "Requested" until answered.

### UX-COMM-22 — Invite Members
✕ on the left, title centred, divider below. "Share" and "Copy Link" side by side at the top with an "or" divider. Search below. Results with photo, name and a **checkbox, not a radio button**. Selected people appear as removable chips below the search input. Confirm fixed above the keyboard while open, showing the number selected.

Confirmation sheet: with a single group, a title stating how many members are being invited and a line explaining they join the community and that group. With more than one, the same title plus a **required** group selection with checkboxes and a note that members can request to join public groups; confirm disabled until at least one group is chosen. **Never a native alert.**

### UX-COMM-23 — Leave Community
Check the condition **before** asking for confirmation, never after.

- Last admin with other members: a sheet titled "Promote another admin first", explaining the requirement, with primary "Go to community members" opening Manage Members and secondary "Cancel". Never presented as an error.
- Last admin with no other members: the sheet states there is nobody to promote and offers archiving instead.
- Any other admin, or a member: a confirmation sheet stating that leaving removes access to the community and all its groups.

### UX-COMM-24 — Archive and Unarchive
Archived communities and groups are visible to **admins only**. A member sees neither, with no indication they exist.

For admins, archived communities are reached through the switcher, or through the Archived section of the no-community screen when everything is archived. Archived groups are reached through Manage Groups.

Archiving: any admin can archive. A confirmation sheet states how many groups will also be archived — always at least one.

An archived community opens as a **bottom sheet, never full screen**, showing the same read-only content as the preview, with "Unarchive community" fixed at the bottom. Nothing can be changed while archived.

Unarchiving: any admin can. A confirmation sheet states how many groups come back with it.

---

## Global rules referenced

UX-GLOB-01 headers, UX-GLOB-02 bottom sheets, UX-GLOB-03 empty states, UX-GLOB-04 avatars, **UX-GLOB-05 search input (see open questions — no such rule exists)**, UX-GLOB-06 submission feedback, UX-GLOB-09 card orientation, UX-GLOB-10 paid features.

---

## Decisions taken with the product owner, 2026-09-14

Do not re-litigate these while implementing.

1. **Owner is removed.** Every current owner becomes an admin, the role constraint drops the value, transfer-ownership goes, and `set_community_plan` accepts any admin. The last-admin rule takes over the job ownership was doing.
2. **The two missing permission toggles are added** as real columns. The comment in `0012` recording the opposite decision is to be updated to say it was reversed and why, not silently deleted.
3. **Inline search inputs** where this audit asks for them. UX-GLOB-08 governs global search, which is a different thing from filtering a list you are already looking at. The UX-GLOB-05 reference is simply a wrong number.
4. **The preview stays a full screen**, against UX-COMM-04's "never a full screen". Everything else in that item is adopted: the attribute widgets, the privacy-specific actions, the plain-language privacy line, the pinned join action. The same applies to the archived community view in UX-COMM-24, for consistency.

Taken as settled by the document itself, not asked:

5. **Permission defaults flip** to match the matrix: posts, events and invites on; groups and approvals off.
6. **The one-community cap is lifted.** UX-COMM-09 states plainly that "New community" is always available and that plan limits do not apply during the MVP, citing UX-GLOB-10, which is the rule we implemented as granted-on-request.
7. The "Cards per UX-GLOB-04" reference in UX-COMM-07 means card orientation, UX-GLOB-09.

## Conflicts with the system as built

These are established by reading the code, not inferred.

1. **Three roles exist, not two.** `0004_communities.sql:17` constrains role to `('owner','admin','member')`. The app has a transfer-ownership flow (`community/[id]/manage/index.tsx`), and `set_community_plan` in `0095` requires `role = 'owner'`. The audit says there is no ownership to transfer.

2. **Two of the five permission toggles do not exist and were deliberately excluded.** `0012_community_permissions.sql` has `invite_members`, `approve_join_requests`, `create_posts`, and its header comment reads: *"Admin-only actions (create groups / create events) are NEVER columns here — they are enforced purely by community role."* The audit wants both as member toggles.

3. **Permission defaults are inverted.** `0016_wire_defaults.sql:28` creates the row with all toggles off; the audit wants posts, events and invites on by default.

4. **Creating a second community is capped.** `0023_create_community_extend.sql:1` caps owned communities at 1 for the MVP. UX-COMM-09 says "New community" is always available and plan limits do not apply.

5. **UX-GLOB-05 does not exist.** The global spec defines 01, 02, 03, 04, 06, 07, 08, 09, 10 — there is no 05. Search is UX-GLOB-08, and it specifies search as *its own screen reached from a header icon*, whereas this audit asks for inline search inputs inside tabs.

6. **UX-COMM-07 cites "Cards per UX-GLOB-04"**, but 04 is avatars and card orientation is 09.

7. **The member view and the community tab are currently different screens.** Today `(tabs)/community/index.tsx` lists communities and `community/[id]/(home)` is a pushed screen. UX-COMM-08 wants the tab itself to be the community, with a switcher and no back button.

8. **The review gate already matches** — `0069_community_review_gate.sql` requires 3 completed events. No change needed.
