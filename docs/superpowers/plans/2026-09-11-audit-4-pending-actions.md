# Pending Actions Sheet (E4, JM-38) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The organizer of a scheduled event sees "You have N pending actions" on the event detail; tapping it opens a checklist whose rows navigate to the screen that resolves each one.

**Architecture:** A pure function derives the rows from data the detail screen already holds plus one small courts query. A component renders the collapsed card and the modal checklist using the existing primitives. The detail screen mounts it for the organizer while the event is scheduled. Mobile only.

**Tech Stack:** TypeScript, vitest, react-native, expo-router, TanStack Query, i18next.

**Spec:** `docs/superpowers/specs/2026-09-11-audit-content-seed-design.md` section 4.

**Prerequisites:** Branch: `git fetch origin && git checkout -b feat/pending-actions origin/main`. No database change.

---

### Task 1: Pure derivation with tests

**Files:**
- Create: `apps/mobile/lib/pendingActions.ts`
- Create: `apps/mobile/lib/pendingActions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/lib/pendingActions.test.ts
import { describe, expect, it } from 'vitest';
import { pendingActions } from './pendingActions';

const base = {
  eventId: 'e1',
  specification: 'classic',
  numCourts: 1,
  confirmedCount: 4,
  confirmedTeamCount: 0,
  hasLocation: true,
  venueId: null as string | null,
  venueCourtCount: 0,
  assignedCourtCount: 0,
};

describe('pendingActions', () => {
  it('is empty for a fully set up classic event', () => {
    expect(pendingActions(base)).toEqual([]);
  });

  it('asks for the missing players and a location (the audit E4 shape)', () => {
    expect(pendingActions({ ...base, confirmedCount: 0, hasLocation: false })).toEqual([
      { key: 'addPlayers', count: 4, href: '/event/e1/manage' },
      { key: 'setLocation', count: 0, href: '/event/e1/edit' },
    ]);
  });

  it('asks for teams on a team event', () => {
    expect(pendingActions({ ...base, specification: 'team', confirmedTeamCount: 1 })).toEqual([
      { key: 'setUpTeams', count: 1, href: '/event/e1/manage' },
    ]);
  });

  it('asks to assign courts when a library venue has courts and none are picked', () => {
    expect(pendingActions({ ...base, venueId: 'v1', venueCourtCount: 3, assignedCourtCount: 0 })).toEqual([
      { key: 'assignCourts', count: 0, href: '/event/e1/edit' },
    ]);
    expect(pendingActions({ ...base, venueId: 'v1', venueCourtCount: 3, assignedCourtCount: 1 })).toEqual([]);
    expect(pendingActions({ ...base, venueId: 'v1', venueCourtCount: 0, assignedCourtCount: 0 })).toEqual([]);
  });

  it('never reports a negative player count', () => {
    expect(pendingActions({ ...base, confirmedCount: 9 })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm --filter mobile test -- pendingActions`
Expected: module not found.

- [ ] **Step 3: Implement**

```ts
// apps/mobile/lib/pendingActions.ts
/**
 * JM-38 / join-manage-event.md section 4.7: the setup tasks an organizer still has to do
 * before a scheduled event can start. Pure so it can be tested without rendering.
 */
export type PendingActionKey = 'addPlayers' | 'setUpTeams' | 'setLocation' | 'assignCourts';

export type PendingAction = {
  key: PendingActionKey;
  /** Players or teams still missing; 0 for the boolean rows. */
  count: number;
  href: string;
};

export type PendingActionsInput = {
  eventId: string;
  specification: string;
  numCourts: number;
  confirmedCount: number;
  confirmedTeamCount: number;
  hasLocation: boolean;
  venueId: string | null;
  venueCourtCount: number;
  assignedCourtCount: number;
};

export function pendingActions(i: PendingActionsInput): PendingAction[] {
  const rows: PendingAction[] = [];
  const manage = `/event/${i.eventId}/manage`;
  const edit = `/event/${i.eventId}/edit`;

  const missingPlayers = i.numCourts * 4 - i.confirmedCount;
  if (missingPlayers > 0) rows.push({ key: 'addPlayers', count: missingPlayers, href: manage });

  if (i.specification === 'team') {
    const missingTeams = i.numCourts * 2 - i.confirmedTeamCount;
    if (missingTeams > 0) rows.push({ key: 'setUpTeams', count: missingTeams, href: manage });
  }

  if (!i.hasLocation) rows.push({ key: 'setLocation', count: 0, href: edit });

  if (i.venueId != null && i.venueCourtCount > 0 && i.assignedCourtCount === 0) {
    rows.push({ key: 'assignCourts', count: 0, href: edit });
  }
  return rows;
}
```

- [ ] **Step 4: Run, expect pass, commit**

Run: `pnpm --filter mobile test -- pendingActions`
Expected: 5 passed.

```bash
git add apps/mobile/lib/pendingActions.ts apps/mobile/lib/pendingActions.test.ts
git commit -m "feat(mobile): derive an organizer's pending setup actions"
```

---

### Task 2: Courts query

**Files:**
- Modify: `packages/api/src/query-keys.ts` (event block, after `eventTeams`)
- Modify: `packages/api/src/events/queries.ts` (append after `useEventTeams`)

- [ ] **Step 1: Add the key**

```ts
  eventCourtSetup: (id: string) => ['event', id, 'court-setup'] as const,
```

- [ ] **Step 2: Add the query**

```ts
/**
 * How many courts the event's library venue offers and how many the event has picked.
 * Feeds the organizer's pending-actions "Assign courts" row; nothing else needs it.
 */
export const useEventCourtSetup = (id: string, venueId: string | null | undefined) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.eventCourtSetup(id),
    enabled: !!venueId,
    queryFn: async () => {
      const [venue, assigned] = await Promise.all([
        db.from('courts').select('id', { count: 'exact', head: true }).eq('venue_id', venueId!),
        db.from('event_courts').select('court_id', { count: 'exact', head: true }).eq('event_id', id),
      ]);
      if (venue.error) throw venue.error;
      if (assigned.error) throw assigned.error;
      return { venueCourtCount: venue.count ?? 0, assignedCourtCount: assigned.count ?? 0 };
    },
  });
};
```

- [ ] **Step 3: Typecheck and commit**

Run: `pnpm typecheck`

```bash
git add packages/api/src/query-keys.ts packages/api/src/events/queries.ts
git commit -m "feat(api): court setup counts for an event"
```

---

### Task 3: The sheet component

**Files:**
- Create: `apps/mobile/components/event/PendingActionsSheet.tsx`
- Modify: `apps/mobile/lib/i18n-mobile.ts` (`mobileEvent`, three locales; anchor `startCta` at lines 1668, 2108, 2548)

- [ ] **Step 1: Write the component**

```tsx
// apps/mobile/components/event/PendingActionsSheet.tsx
import { useT } from '@padel/i18n';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../../theme';
import { Card, ListRow, Text } from '../ui';
import type { PendingAction } from '@/lib/pendingActions';

type Props = { actions: PendingAction[] };

/**
 * JM-38: "You have N pending actions" card on the organizer's event detail. Tapping it opens a
 * checklist; each row navigates to the screen that resolves it. Renders nothing when empty.
 */
export function PendingActionsSheet({ actions }: Props) {
  const { t } = useT('event');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (actions.length === 0) return null;

  const label = (a: PendingAction) => {
    switch (a.key) {
      case 'addPlayers': return t('pendingAddPlayers', { count: a.count });
      case 'setUpTeams': return t('pendingSetUpTeams', { count: a.count });
      case 'setLocation': return t('pendingSetLocation');
      case 'assignCourts': return t('pendingAssignCourts');
    }
  };

  const go = (a: PendingAction) => {
    setOpen(false);
    router.push(a.href as Href);
  };

  return (
    <>
      <Card
        style={styles.card}
        onPress={() => setOpen(true)}
        accessibilityLabel={t('pendingActionsTitle', { count: actions.length })}
        testID="pending-actions-card"
      >
        <Text variant="bodyStrong">{t('pendingActionsTitle', { count: actions.length })}</Text>
        <Text variant="caption" tone="muted">{t('pendingActionsHint')}</Text>
      </Card>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel={t('pendingActionsClose')}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text variant="sectionTitle" style={styles.sheetTitle}>
              {t('pendingActionsTitle', { count: actions.length })}
            </Text>
            {actions.map((a) => (
              <ListRow
                key={a.key}
                variant="plain"
                title={label(a)}
                trailing={<Text variant="hint" tone="muted">›</Text>}
                onPress={() => go(a)}
                testID={`pending-action-${a.key}`}
              />
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 20, gap: 4 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
    paddingBottom: 32,
    paddingHorizontal: 8,
  },
  sheetTitle: { paddingHorizontal: 8, marginBottom: 8 },
});
```

If `ListRowVariant` does not include `'plain'`, check `apps/mobile/components/ui/ListRow.tsx` line 44 for the allowed values and use the bordered default by dropping the `variant` prop. If `colors.overlay` does not exist in `apps/mobile/theme/index.ts`, use the same backdrop colour the notifications menu uses (`apps/mobile/app/notifications/index.tsx` styles `backdrop`).

- [ ] **Step 2: Add the copy**

Next to `startCta` in each locale of `mobileEvent`:

pt-PT:
```ts
    pendingActionsTitle_one: 'Tens {{count}} ação pendente',
    pendingActionsTitle_other: 'Tens {{count}} ações pendentes',
    pendingActionsHint: 'Toca para ver o que falta antes de iniciar',
    pendingActionsClose: 'Fechar',
    pendingAddPlayers_one: 'Adicionar {{count}} jogador',
    pendingAddPlayers_other: 'Adicionar {{count}} jogadores',
    pendingSetUpTeams_one: 'Montar {{count}} equipa',
    pendingSetUpTeams_other: 'Montar {{count}} equipas',
    pendingSetLocation: 'Definir a localização',
    pendingAssignCourts: 'Atribuir campos',
```
pt-BR:
```ts
    pendingActionsTitle_one: 'Você tem {{count}} ação pendente',
    pendingActionsTitle_other: 'Você tem {{count}} ações pendentes',
    pendingActionsHint: 'Toque para ver o que falta antes de iniciar',
    pendingActionsClose: 'Fechar',
    pendingAddPlayers_one: 'Adicionar {{count}} jogador',
    pendingAddPlayers_other: 'Adicionar {{count}} jogadores',
    pendingSetUpTeams_one: 'Montar {{count}} dupla',
    pendingSetUpTeams_other: 'Montar {{count}} duplas',
    pendingSetLocation: 'Definir o local',
    pendingAssignCourts: 'Atribuir quadras',
```
en:
```ts
    pendingActionsTitle_one: 'You have {{count}} pending action',
    pendingActionsTitle_other: 'You have {{count}} pending actions',
    pendingActionsHint: 'Tap to see what is left before you can start',
    pendingActionsClose: 'Close',
    pendingAddPlayers_one: 'Add {{count}} player',
    pendingAddPlayers_other: 'Add {{count}} players',
    pendingSetUpTeams_one: 'Set up {{count}} team',
    pendingSetUpTeams_other: 'Set up {{count}} teams',
    pendingSetLocation: 'Set a location',
    pendingAssignCourts: 'Assign courts',
```

- [ ] **Step 3: Typecheck, lint, i18n**

Run: `pnpm --filter mobile typecheck && pnpm --filter mobile lint && pnpm i18n:check`

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/components/event/PendingActionsSheet.tsx apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(mobile): pending actions card and checklist sheet"
```

---

### Task 4: Mount it on the organizer's detail screen

**Files:**
- Modify: `apps/mobile/app/event/[id]/index.tsx` (imports; hooks after `useEventSeries`; derived block after `setupComplete`; render before the `{/* Chat */}` section)

- [ ] **Step 1: Imports**

Add `useEventCourtSetup,` to the `@padel/api` import list, and after the `useNow` import:

```ts
import { pendingActions } from '@/lib/pendingActions';
import { PendingActionsSheet } from '../../../components/event/PendingActionsSheet';
```

- [ ] **Step 2: Fetch the court counts**

After `const { data: series } = useEventSeries(id);` add:

```ts
  const { data: courtSetup } = useEventCourtSetup(id, event?.venue_id);
```

Note this hook runs before the early returns, which is required by the rules of hooks. `event` may be undefined there, hence the optional chain.

- [ ] **Step 3: Derive the rows**

After the `setupComplete` declaration add:

```ts
  // JM-38: what the organizer still has to do. Only meaningful while scheduled.
  const pending =
    isOrganizer && status === 'scheduled'
      ? pendingActions({
          eventId: id,
          specification: event.specification,
          numCourts: event.num_courts,
          confirmedCount: startConfirmedCount,
          confirmedTeamCount,
          hasLocation: event.has_location,
          venueId: event.venue_id,
          venueCourtCount: courtSetup?.venueCourtCount ?? 0,
          assignedCourtCount: courtSetup?.assignedCourtCount ?? 0,
        })
      : [];
```

`isOrganizer` and `status` are declared a few lines below `setupComplete` in the current file; move this block to just after `const status = event.status;` so both are in scope.

- [ ] **Step 4: Render**

Directly before the `{/* Chat */}` comment inside the `ScrollView`:

```tsx
        {/* Pending actions (JM-38) */}
        <PendingActionsSheet actions={pending} />
```

- [ ] **Step 5: Check**

Run: `pnpm --filter mobile typecheck && pnpm --filter mobile lint && pnpm i18n:check`

- [ ] **Step 6: Commit**

```bash
git add "apps/mobile/app/event/[id]/index.tsx"
git commit -m "feat(mobile): organizer sees pending actions on the event detail"
```

---

### Task 5: Simulator check and PR

- [ ] **Step 1: See it**

Seed the local stack (`pnpm dlx supabase@latest --workdir infra db reset && pnpm seed:e2e`), log in as `alex@padeljam.test` / `demo1234`, create an event through the wizard with no players and location skipped. Open it. Expected: a card "You have 2 pending actions"; tapping it lists "Add 4 players" and "Set a location"; tapping "Add 4 players" opens the manage screen; tapping "Set a location" opens the edit screen. Add four manual players and set a location: the card disappears.

- [ ] **Step 2: Repo checks**

Run: `pnpm lint && pnpm typecheck && pnpm i18n:check && pnpm test`

- [ ] **Step 3: PR**

```bash
git push -u origin feat/pending-actions
gh pr create --title "feat(mobile): pending actions sheet on the organizer's event detail (JM-38)" --body "$(cat <<'EOF'
Implements section 4 of docs/superpowers/specs/2026-09-11-audit-content-seed-design.md.

- pendingActions(): add players, set up teams, set a location, assign courts
- useEventCourtSetup(): venue court count vs picked courts
- PendingActionsSheet: collapsed card + modal checklist, rows navigate to manage/edit

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
