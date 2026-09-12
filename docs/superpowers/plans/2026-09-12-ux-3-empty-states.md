# UX-GLOB-03 Empty States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every empty list or section in the mobile app renders the `EmptyState` primitive with an icon, a title naming what is missing, a description, and a CTA where one resolves the condition; error states get their own treatment and never read as "nothing here".

**Architecture:** The primitive already exists (`apps/mobile/components/ui/EmptyState.tsx`). This plan adds an `error` tone with a Retry action to it, then converts the 25 bare-text sites and the community tab's bespoke component. Icons are `SymbolView` names passed as the `icon` node with `accessibilityElementsHidden`.

**Tech Stack:** react-native, expo-symbols, the `EmptyState` primitive, i18next.

**Spec:** `docs/superpowers/specs/2026-09-12-ux-global-rules-design.md` section 3. **Depends on:** the foundations PR merged (for the search route used by one CTA, the search plan; use `/(tabs)/explore?tab=events` until then and switch in the search plan).

**Prerequisites:** `git fetch origin && git checkout -b feat/ux-empty-states origin/main`. Checks: `pnpm --filter mobile typecheck && pnpm --filter mobile lint && pnpm i18n:check && pnpm --filter mobile test`.

---

## The one pattern

```tsx
import { SymbolView } from 'expo-symbols';
import { EmptyState } from '../../components/ui';
import { colors } from '../../theme';

const emptyIcon = (name: string) => (
  <SymbolView name={{ ios: name, android: name, web: name }} size={40} tintColor={colors.mutedForeground} accessibilityElementsHidden importantForAccessibility="no" />
);

…
{rows.length === 0 ? (
  <EmptyState
    icon={emptyIcon('calendar')}
    title={t('emptyEventsTitle')}
    body={t('emptyEventsBody')}
    action={{ label: t('emptyEventsCta'), onPress: () => router.push(`/event/create?group=${id}` as never) }}
    testID="empty-events"
  />
) : ( …list… )}
```

Put `emptyIcon` in `apps/mobile/components/ui/emptyIcon.tsx` (exported from `index.ts`) so every site shares it. Query-result empties use `EmptyState` with title `t('noMatches')` and body `t('tryBroaderSearch')` from the `discovery` namespace, no CTA.

---

### Task 1: Error tone and the shared icon helper

**Files:**
- Modify: `apps/mobile/components/ui/EmptyState.tsx`
- Create: `apps/mobile/components/ui/emptyIcon.tsx`
- Modify: `apps/mobile/components/ui/index.ts`
- Modify: `apps/mobile/components/ui/Gallery.stories.tsx` (one error example)

- [ ] **Step 1: Add `tone`**

Props gain `tone?: 'default' | 'error'`. When `error`, the title uses `tone="destructive"`, the default icon (when none is passed) is `emptyIcon('exclamationmark.triangle')`, and the `action` is expected to be a Retry. No other change.

- [ ] **Step 2: `emptyIcon.tsx`** as shown above, plus the export.

- [ ] **Step 3: Gallery**: add `<EmptyState tone="error" title="Couldn't load events" body="Check your connection and try again." action={{ label: 'Retry', onPress: () => {} }} />` under the EmptyState section.

- [ ] **Step 4: Checks and commit** `feat(ui): EmptyState error tone and a shared decorative icon helper`.

---

### Task 2: Copy

**Files:**
- Modify: `apps/mobile/lib/i18n-mobile.ts` (each screen's namespace, three locales)

Add, per site below, three keys `<site>EmptyTitle`, `<site>EmptyBody`, and `<site>EmptyCta` when a CTA exists. English copy (write pt-PT and pt-BR equivalents in the same register the namespace already uses):

| Site key | Title | Body | CTA |
|---|---|---|---|
| events (My Events) | No events yet | Join or create one and it shows up here. | Find events |
| groupEvents (group detail) | No events yet | Create the first one to get things started. | Create event (managers only) |
| communityEvents | No events yet | Events from this community's groups appear here. | Create event (managers only) |
| communityGroups | No groups yet | Groups organise events and rankings. | Create group (managers only) |
| communityPosts | No posts yet | Share news, results or a photo with the community. | Write a post (members) |
| communityMembers / groupMembers | No members yet | Invite people to get the group going. | Invite (managers only) |
| chatNew (people you follow) | Nobody to message yet | Follow players to start conversations. | Find players |
| followers / following | No followers yet / Not following anyone yet | (descriptive line) | — |
| notifications | Nothing new | Invitations, results and follows appear here. | — |
| partnerRequests | No requests | Partner and join requests you receive appear here. | — |
| roster / invited / waiting (event manage) | Nobody here yet | (per tab) | Invite (organizer) |
| activity | No activity yet | Changes to this event are logged here. | — |
| blastsYours | No blasts sent | Your sent blasts appear here. | — |
| reviews | No reviews yet | Play in this community's events to review it. | — |
| comments | No comments yet | Be the first to comment. | — |
| explore rails / tabs (no data) | Nothing to explore yet | Check back soon. | — |
| explore (query) | No matches | Try a broader search. | — |
| wizard Step1Group | No groups to host this event | Join or create a group first. | — |
| wizard Step5Location | No venues match | Try another name or enter the address manually. | — |
| live standings/matches | No matches yet | The organizer starts the first round. | — |
| teamManage | No players to assign | Confirmed players appear here. | — |
| chat details media | No photos yet | Photos shared here appear in this album. | — |
| manage invite (search) | No matches | Try another name. | — |
| manage requests | No pending requests | Join requests appear here. | — |

- [ ] **Step 1: Add the keys in the three locales.**
- [ ] **Step 2:** `pnpm i18n:check` — no consumer yet, must still pass. Commit `feat(i18n): empty-state copy`.

---

### Task 3: Convert the 25 sites

**Files (each renders a bare `Text` today):**

`app/chat/new.tsx:53` · `app/chat/[cid]/details.tsx:68` · `app/group/[id]/members.tsx:64` (also fixes the wrong key) · `app/group/[id]/invite.tsx:107` · `app/(tabs)/events.tsx:46-48` · `app/explore/[type].tsx:79` · `components/explore/ExploreList.tsx:93-99` · `components/explore/SuggestionRail.tsx:43` · `app/profile/[id]/followers.tsx:25` · `app/profile/[id]/following.tsx:25` · `app/community/[id]/(home)/posts.tsx:38` · `events.tsx:51` · `groups.tsx:43` · `members.tsx:53` · `app/community/[id]/manage/invite.tsx:172,176` · `requests.tsx:70` · `members.tsx:118` · `app/community/[id]/reviews/index.tsx:138-139` · `app/notifications/index.tsx:78,80` · `app/notifications/partner-requests.tsx:33` · `app/event/[id]/blast.tsx:171` · `app/event/[id]/activity.tsx:69` · `app/event/[id]/partner-requests.tsx:153,194` · `app/event/[id]/live.tsx:384,452` · `components/community/CommentList.tsx:34` · `components/event/wizard/steps/Step1Group.tsx:54` · `Step5Location.tsx:106` · `components/event/TeamManage.tsx:191`

- [ ] **Step 1: Convert, one commit per directory**, using the pattern and the copy table. Where the bare text was `[styles.empty, isError && styles.error]`, split into two renders: `isError ? <EmptyState tone="error" title={t('loadError')} action={{ label: t('retry'), onPress: () => query.refetch() }} /> : <EmptyState …/>`. Where a `FlashList` is used, pass the `EmptyState` as `ListEmptyComponent` rather than branching around the list. Delete the orphaned `empty:`/`error:` styles.
- [ ] **Step 2: Manager-only CTAs** are gated on the same boolean the screen already uses to show its manage/create buttons.
- [ ] **Step 3: Checks after each directory; commits.**

---

### Task 4: The community tab

**Files:**
- Modify: `apps/mobile/components/community/EmptyState.tsx`

- [ ] **Step 1:** Replace its hand-rolled title/subtitle/create card with the primitive: `<EmptyState icon={emptyIcon('person.3')} title={t('emptyTitle')} body={t('emptySubtitle')} action={{ label: t('createCommunity'), onPress }} />` followed by the existing suggested-communities rail (unchanged). Keep the exported name and props so `app/(tabs)/community/index.tsx` is untouched.
- [ ] **Step 2:** Checks; commit `refactor(mobile): community empty state composes the primitive`.

---

### Task 5: Verification and PR

- [ ] **Step 1:** `pnpm lint && pnpm typecheck && pnpm i18n:check && pnpm test`; `grep -rn "styles.empty" apps/mobile/app apps/mobile/components` → only sites that still legitimately style a non-empty message (report any).
- [ ] **Step 2:** E2E: suites 03 (Home/Explore rails) and 09 (community tabs) — their empty assertions look for text such as "No matches"/"nothing yet"; update to the new titles.
- [ ] **Step 3:** Simulator walk as A2 (the brand-new account the audit seed leaves uncreated: sign up, then open every tab, chat, notifications, groups, explore): every empty screen shows icon + title + description, and a CTA where the table says so.
- [ ] **Step 4:** PR `feat/ux-empty-states` → main, spec section 3, listing the 25 sites. End with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
