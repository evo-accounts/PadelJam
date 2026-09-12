# UX-GLOB-09 Card Orientation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Horizontally scrolling sections use vertical cards; full list screens use full-width horizontal cards; a vertical card never appears stacked in a vertical list, and a full-width card never sits in a rail.

**Architecture:** `EventCard`, `GroupCard` and `CommunityCard` gain an `orientation` prop rendering two layouts of the same content. The two `GroupCard` components merge. `ExploreList` renders horizontal cards one per row; Home and Explore rails render vertical ones. `PlayerCard` gains a horizontal form for the People list.

**Tech Stack:** react-native, the `Avatar` primitive, `FlashList`.

**Spec:** `docs/superpowers/specs/2026-09-12-ux-global-rules-design.md` section 8. **Depends on:** the avatars PR merged (`Avatar` in `PlayerCard`); otherwise independent.

**Prerequisites:** `git fetch origin && git checkout -b feat/ux-card-orientation origin/main`.

---

## The orientation contract

```tsx
type Orientation = 'vertical' | 'horizontal';
// vertical:   fixed width (railWidth prop, default per card), image/avatar on top, text below, action at the bottom
// horizontal: full width, image/avatar left (52 px), text middle, chevron or action right
```
Each card keeps one source of truth for its content (name, subtitle lines, badges) and switches only the arrangement:

```tsx
export function EventCard({ event, onPress, orientation = 'horizontal', railWidth = 260 }: Props) {
  const content = { title: event.name, when: formatWhen(event.starts_at), where: venueLine(event), badge: statusBadge(event) };
  return orientation === 'vertical' ? (
    <Card onPress={onPress} style={[styles.vertical, { width: railWidth }]} testID={`event-card-${event.id}`}>
      <View style={styles.thumbTop} /> {/* or the thumbnail image when present */}
      <Text variant="bodyStrong" numberOfLines={2}>{content.title}</Text>
      <Text variant="caption" tone="muted">{content.when}</Text>
      {content.badge}
    </Card>
  ) : (
    <Card onPress={onPress} style={styles.horizontal} testID={`event-card-${event.id}`}>
      <View style={styles.thumbLeft} />
      <View style={styles.body}>
        <Text variant="bodyStrong" numberOfLines={1}>{content.title}</Text>
        <Text variant="caption" tone="muted">{content.when} · {content.where}</Text>
      </View>
      {content.badge}
      <Text variant="hint" tone="muted" accessibilityElementsHidden importantForAccessibility="no">›</Text>
    </Card>
  );
}
```

---

### Task 1: `EventCard` orientation

**Files:** `apps/mobile/components/event/EventCard.tsx` (currently horizontal only, no chevron).

- [ ] **Step 1:** Add `orientation` and `railWidth` as above; horizontal gains the chevron. Default stays `horizontal` so existing list screens are unchanged.
- [ ] **Step 2:** Rails switch to vertical: `app/(tabs)/index.tsx:71-77,167-174` (`railItem` wrapper removed; pass `orientation="vertical"`), `app/(tabs)/explore.tsx:125-129` (drop the `{width: 280}` wrapper).
- [ ] **Step 3:** Checks; commit `feat(mobile): EventCard has vertical and horizontal orientations; rails use vertical`.

---

### Task 2: One `GroupCard`

**Files:** `apps/mobile/components/group/GroupCard.tsx` (horizontal, `onPress`), `apps/mobile/components/explore/GroupCard.tsx` (vertical, `onOpen`) → delete the latter.

- [ ] **Step 1:** Add `orientation` to `group/GroupCard.tsx` with the vertical layout copied from the explore one (72 px thumb on top, name below, width 160). Its prop stays `onPress`.
- [ ] **Step 2:** Update importers of `components/explore/GroupCard` (`app/(tabs)/explore.tsx:159`, `app/(tabs)/index.tsx:195-199`, `components/explore/ExploreList.tsx`) to the merged component; rename `onOpen` → `onPress`. Home's "My Groups" section (`(tabs)/index.tsx:85-96`) and `app/groups/index.tsx:67-81` replace their `ListRow`s with `<GroupCard orientation="horizontal" …/>`; the Home group rail at `:195-199` is a vertical stack → it becomes a horizontal list of horizontal cards (or a rail of vertical ones if it is a "See all" section; check which it is and follow the rule).
- [ ] **Step 3:** Delete `components/explore/GroupCard.tsx`; `grep -rn "explore/GroupCard" apps/mobile` → none. Commit `refactor(mobile): one GroupCard with both orientations`.

---

### Task 3: `CommunityCard` and `PlayerCard`

**Files:** `apps/mobile/components/explore/CommunityCard.tsx` (vertical only), `apps/mobile/components/community/SuggestedCommunityCard.tsx` (vertical; leave as the rail card and have `CommunityCard` reuse it or vice versa), `apps/mobile/components/explore/PlayerCard.tsx` (vertical only).

- [ ] **Step 1:** `CommunityCard` gains `orientation`; horizontal = 52 px thumb left, name + location middle, the existing "Request to join"/"Join" action right.
- [ ] **Step 2:** `PlayerCard` gains `orientation`; horizontal = `Avatar size="md"` left, name + location middle, chevron right.
- [ ] **Step 3:** Checks; commit `feat(mobile): CommunityCard and PlayerCard orientations`.

---

### Task 4: Lists use horizontal cards

**Files:** `apps/mobile/components/explore/ExploreList.tsx:66-79,90` (drop `numColumns`; render `orientation="horizontal"` for all kinds), `app/explore/[type].tsx` (if not already folded into `ExploreList` by the search plan, do it here), `app/(tabs)/events.tsx:57`, `app/community/[id]/(home)/events.tsx:72`, `app/community/[id]/(home)/groups.tsx:60`, `app/group/[id]/index.tsx:257` (these are already horizontal `EventCard`/`GroupCard`s; confirm and add the chevron by virtue of Task 1).

- [ ] **Step 1:** Make the edits; `FlashList` `estimatedItemSize` updated to the horizontal card height.
- [ ] **Step 2:** E2E suite 03 counts rails/"See all"; suite 09/10 tap cards by name — labels are unchanged. Run 03, 09, 10.
- [ ] **Step 3:** Commit `feat(mobile): list screens use full-width horizontal cards`.

---

### Task 5: Verification and PR

- [ ] `pnpm lint && pnpm typecheck && pnpm test`; suites 03, 09, 10.
- [ ] Simulator against the audit seed: Explore's Communities and Groups tabs show full-width rows; Home rails show vertical cards; no narrow card stacked vertically anywhere; no full-width card in a rail.
- [ ] PR `feat/ux-card-orientation` → main, spec section 8. End with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
