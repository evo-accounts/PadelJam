# UX Audit — Community: implementation plan

Companion to `2026-09-14-ux-community.md`, written after mapping the current screens and data model. Read that first for the 24 items and the decisions already taken.

## What the exploration changed about the shape of this work

Three things are bigger than the audit's wording suggests, and one is smaller.

**The non-member experience does not exist.** `(home)` renders for anyone, with no membership branch and no join affordance anywhere. `join.tsx` is a separate modal reachable only from Explore and the suggested rail, and only public and request-to-join communities surface it — a private community shows a Join button guaranteed to fail into an inline error. So UX-COMM-04/05/06 are not a re-layout; the state machine (member, non-member public, non-member request, non-member private, requested, invited) has to be built.

**Removing the owner role is blocked by the plan cap.** `enforce_member_caps` raises when a row with role `admin` is written and the community is at its `co_organizers` limit, which is **0** on starter. Owners escape only because their role is not literally `admin`. The backfill would break every starter community and then make community creation impossible, because the create function inserts its own creator. The cap's meaning has to change in the same migration.

**Four audit behaviours have no server support at all.** Cancelling a pending request (no `cancelled` status, no delete policy), declining an invitation (status allows only pending/accepted), capturing rules acceptance (recorded for about a third of joins, on the wrong table, never read), and hiding archived content from members (not enforced at any layer — a member can read archived communities today).

**Smaller than expected**: the default group on create already exists, and the review gate already requires three completed events.

## Pull requests

Ordered by dependency. Items 1 and 2 must land before any screen work that reads roles or permissions.

### 1 — `feat(db)`: two roles, five permissions, no cap
Migration 0098. Backfill owners to admins, drop the value from the constraint, and fix `is_community_admin` / `is_group_admin`. **Change the co-organizer cap semantics in the same migration** so the backfill and `create_community_with_personal_tenant` both survive; counting admins beyond the first is the natural reading. Delete `transfer_ownership`. Add `create_groups` and `create_events` to `community_permissions`, flip the defaults to the audit's matrix, and enforce the new toggles in `can_create_group`, `can_create_event`, their RPCs and the groups insert policy. Lift `can_create_community`, keeping the zero-argument signature so the client query and generated types survive. `set_community_plan` accepts any admin.

Also needed here, because the owner role was doing the work: **a last-admin guard that actually exists.** Today demotion writes straight through row-level security, which cannot count survivors, and `remove_member` has no guard at all. This needs a trigger or a move to an RPC, covering leave, demote, remove and account deletion.

Rewrites, not tweaks: `community_manage.sql` is built entirely on transfer-ownership, and the three seeds work around the one-community cap.

### 2 — `feat(db)`: the four missing behaviours
Migration 0099. A `cancelled` status and a cancel RPC for join requests. A `declined` status and a decline RPC for invitations. Rules acceptance recorded once on the membership row, written by `add_member_to_community` so every join path captures it rather than one in three. Archived visibility enforced for members in row-level security rather than only in client filters.

Two repairs while in the same functions: unarchiving currently resurrects groups that were archived individually beforehand, and the archive count reports all groups rather than affected ones, which is the number UX-COMM-24 wants to show.

One pre-existing bug fixed here: a member granted approval permission can accept requests but cannot see the queue, because the read policy is admin-only.

### 3 — `feat(ui)`: the widgets four screens each reinvented
Promote a segmented control, a radio-card group, a labelled switch row and a star rating into `components/ui`, then delete the per-screen copies. Replace the three hand-rolled submit buttons with `Button loading`. **Add the lint rule for literal `fontSize` and `borderRadius`** — the config enforces colours but not sizes, which is why thirty files drifted, and without it they will drift back.

### 4 — `feat(mobile)`: the Community tab becomes the community (07, 08, 09)
The tab currently lists communities and pushes into one. It becomes the community itself, with the switcher in the header and no back button. `CommunityHero` is replaced outright rather than adapted: it is bespoke, re-queries its own data, and has no membership awareness, which is exactly where the join action must live. The identity block moves to About. The no-community screen gets the create action in the header and the archived section.

### 5 — `feat(mobile)`: preview, rules acceptance and joining (04, 05, 06)
The state machine above. **The preview stays a full screen**, against the audit's wording, per your decision. Everything else in the item is adopted: attribute widgets rather than chips, the plain-language privacy line, the pinned action, per-privacy behaviour, and the rules toggle gating the join.

### 6 — `feat(mobile)`: the five tabs (10, 11, 12)
Composer entry pinned at the top of Posts, replacing the floating button. Create actions move to the top of Events and Groups. Members gains search, the requests entry and tappable rows. About gains the identity block and the tappable rating row.

### 7 — `feat(mobile)`: reviews (13)
Score distribution chart, sort and filter as sheets rather than inline pills, and the two distinct empty states.

### 8 — `feat(mobile)`: the two menus and the two forms (14, 15, 16, 17)
Member overflow sheet and admin settings sheet. Settings and permissions get close buttons, fixed save actions, and permissions gains the two new toggles with their explanatory blocks.

### 9 — `feat(mobile)`: managing groups and members (18, 19, 20, 21)
Manage groups does not exist and is new, including the only surface where archived groups are visible, which also needs the query filters relaxed. Manage members and the Members tab become one component. Member actions gain the last-admin rule. The requests entry stops being conditional on privacy, which today strands pending requests when a community changes to public.

### 10 — `feat(mobile)`: invite, leave, archive (22, 23, 24)
Invite is a rewrite rather than an edit: raw input, an inline profile query in the component, two hand-rolled checkbox implementations and a close glyph baked into a chip label. Leave reverses its order so the condition is checked before the confirmation. Archive and unarchive get accurate counts and the read-only archived view.

### 11 — `feat(mobile)`: create and created (01, 02, 03)
Create becomes a task flow with a location picker, preset images, the rules card and a fixed disabled-until-valid action. Created gets the illustration and the corrected actions, including the currently disabled create-event button and the manage button that today opens the feed instead. The QR code becomes a sheet.

## Verification

Every pull request runs lint, typecheck, the i18n check and unit tests, and the database ones add tests to `infra/supabase/tests`.

**Budget explicitly for end-to-end churn.** Suites 09 and 11 assert on exact visible label text and on accessibility element types: the composer body must stay a text area, the permission switches are addressed positionally by index, the invite search must stay a plain text field rather than becoming a labelled one. Roughly nine of eleven admin tests and five of seven community tests need edits. Several carry comments documenting previous multi-minute mystery failures caused by exactly this coupling.

## Still needs a decision

**Jammer+ derivation.** It is currently granted to community *owners* on a plan that includes it. With owners gone, the natural translation grants it to every admin of such a community, which widens a paid entitlement as a side effect of a role change. The alternative is to narrow it deliberately, for example to the community creator. This should be chosen rather than inherited.
