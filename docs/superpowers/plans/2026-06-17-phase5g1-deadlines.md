# Phase 5G-1 — Event Deadlines & Countdowns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the fixed 6h-join / 12h-leave deadlines on the event detail screen — a live "time left to join" countdown, a "joining closed" state, and a "Message organizer" DM in place of Leave past the leave cutoff.

**Architecture:** Pure deadline/format logic in `@padel/utils` (vitest-tested); a 30s-ticking `useNow()` hook in the mobile app feeds pure deadline math into the event detail screen's CTA branches. No backend — the cutoffs are already enforced by the roster RPCs; this only makes them visible.

**Tech Stack:** TypeScript, vitest (`@padel/utils`), React Native / Expo Router, Stream Chat (`messaging` DM channel), i18next.

Spec: `docs/superpowers/specs/2026-06-17-phase5g1-deadlines-design.md`.

---

### Task 1: Pure deadline + countdown logic in `@padel/utils`

**Files:**
- Create: `packages/utils/src/eventDeadlines.ts`
- Test: `packages/utils/src/eventDeadlines.test.ts`
- Modify: `packages/utils/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/utils/src/eventDeadlines.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  JOIN_CUTOFF_MS,
  LEAVE_CUTOFF_MS,
  deadlineState,
  formatCountdown,
} from './eventDeadlines';

const START = '2026-06-20T18:00:00.000Z';
const START_MS = Date.parse(START);

describe('deadlineState', () => {
  it('join is open just before the 6h cutoff, closed just after', () => {
    const justBefore = deadlineState(START, START_MS - JOIN_CUTOFF_MS - 60_000);
    expect(justBefore.joinClosed).toBe(false);
    const justAfter = deadlineState(START, START_MS - JOIN_CUTOFF_MS + 60_000);
    expect(justAfter.joinClosed).toBe(true);
    expect(justBefore.joinCutoffMs).toBe(START_MS - JOIN_CUTOFF_MS);
  });

  it('leave is open just before the 12h cutoff, locked just after', () => {
    const justBefore = deadlineState(START, START_MS - LEAVE_CUTOFF_MS - 60_000);
    expect(justBefore.leaveLocked).toBe(false);
    const justAfter = deadlineState(START, START_MS - LEAVE_CUTOFF_MS + 60_000);
    expect(justAfter.leaveLocked).toBe(true);
    expect(justBefore.leaveCutoffMs).toBe(START_MS - LEAVE_CUTOFF_MS);
  });

  it('fails open on an unparseable start time', () => {
    const s = deadlineState('not-a-date', START_MS);
    expect(s.joinClosed).toBe(false);
    expect(s.leaveLocked).toBe(false);
  });
});

describe('formatCountdown', () => {
  it('returns empty for zero or negative', () => {
    expect(formatCountdown(0)).toBe('');
    expect(formatCountdown(-5000)).toBe('');
  });
  it('sub-minute shows <1m', () => {
    expect(formatCountdown(30_000)).toBe('<1m');
  });
  it('minutes only under an hour', () => {
    expect(formatCountdown(5 * 60_000)).toBe('5m');
  });
  it('hours and minutes under a day', () => {
    expect(formatCountdown(90 * 60_000)).toBe('1h 30m');
  });
  it('days and hours at or above a day', () => {
    expect(formatCountdown((26 * 60) * 60_000)).toBe('1d 2h');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @padel/utils test`
Expected: FAIL — `Cannot find module './eventDeadlines'`.

- [ ] **Step 3: Implement the module**

Create `packages/utils/src/eventDeadlines.ts`:

```ts
/** Players may join up to 6h before start; leave up to 12h before. Both are fixed (JM-18). */
export const JOIN_CUTOFF_MS = 6 * 60 * 60 * 1000;
export const LEAVE_CUTOFF_MS = 12 * 60 * 60 * 1000;

export interface DeadlineState {
  joinCutoffMs: number;
  leaveCutoffMs: number;
  joinClosed: boolean;
  leaveLocked: boolean;
}

/**
 * Derive the join/leave cutoffs (absolute epoch ms) and whether each has passed at `nowMs`.
 * Fails open (nothing closed/locked) when `startsAtIso` cannot be parsed — the server RPCs
 * remain the source of truth.
 */
export function deadlineState(startsAtIso: string, nowMs: number): DeadlineState {
  const startMs = Date.parse(startsAtIso);
  if (Number.isNaN(startMs)) {
    return { joinCutoffMs: NaN, leaveCutoffMs: NaN, joinClosed: false, leaveLocked: false };
  }
  const joinCutoffMs = startMs - JOIN_CUTOFF_MS;
  const leaveCutoffMs = startMs - LEAVE_CUTOFF_MS;
  return {
    joinCutoffMs,
    leaveCutoffMs,
    joinClosed: nowMs > joinCutoffMs,
    leaveLocked: nowMs > leaveCutoffMs,
  };
}

/** Compact, English-first countdown: "2d 4h", "1h 30m", "5m", "<1m"; "" when expired. */
export function formatCountdown(msRemaining: number): string {
  if (msRemaining <= 0) return '';
  const totalMinutes = Math.floor(msRemaining / 60_000);
  if (totalMinutes < 1) return '<1m';
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days >= 1) return `${days}d ${hours}h`;
  if (hours >= 1) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
```

- [ ] **Step 4: Re-export from the package index**

Modify `packages/utils/src/index.ts` — append:

```ts
export * from './eventDeadlines';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @padel/utils test`
Expected: PASS — all `deadlineState` + `formatCountdown` cases green.

- [ ] **Step 6: Typecheck**

Run: `pnpm -w typecheck`
Expected: PASS (13 packages).

- [ ] **Step 7: Commit**

```bash
git add packages/utils/src/eventDeadlines.ts packages/utils/src/eventDeadlines.test.ts packages/utils/src/index.ts
git commit -m "feat(utils): event deadline state + countdown formatter (5G-1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `useNow` ticking hook (mobile)

**Files:**
- Create: `apps/mobile/lib/useNow.ts`

No unit test (the mobile app has no test runner); verified by typecheck + use in Task 3.

- [ ] **Step 1: Create the hook**

Create `apps/mobile/lib/useNow.ts`:

```ts
import { useEffect, useState } from 'react';

/**
 * Current epoch milliseconds, refreshed on a fixed interval (default 30s) so that
 * time-derived UI (countdowns, deadline states) stays live. Must be called
 * unconditionally with other hooks (Rules of Hooks); all deadline math stays pure.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm -w typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/lib/useNow.ts
git commit -m "feat(mobile): useNow ticking hook for live deadline UI (5G-1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Wire deadlines into the event detail screen

**Files:**
- Modify: `apps/mobile/app/event/[id]/index.tsx`
- Modify: `apps/mobile/lib/i18n-mobile.ts` (the `mobileEvent.en` block, near line 1110)

The screen's full current contents are known; make these precise edits. The CTA-building `if/else`
chain runs only when `status === 'scheduled'` for the relevant branches.

- [ ] **Step 1: Add imports**

At the top of `apps/mobile/app/event/[id]/index.tsx`, add three imports (place near the existing
imports; keep import grouping consistent):

```ts
import { deadlineState, formatCountdown } from '@padel/utils';
import { streamClient } from '@/lib/streamClient';
import { useNow } from '@/lib/useNow';
```

- [ ] **Step 2: Call `useNow` with the other hooks (before the early returns)**

Immediately after `const [error, setError] = useState<string | null>(null);` (the last hook call,
~line 83), add:

```ts
  // Ticking clock so the join countdown + deadline-gated CTAs stay live.
  const nowMs = useNow();
```

- [ ] **Step 3: Derive deadline state (after `event` is known non-null)**

Immediately after `const badge = badgeStyles(status);` (~line 162), add:

```ts
  // --- Deadlines (JM-18..21): 6h join cutoff, 12h leave cutoff, both derived from starts_at ---
  const { joinCutoffMs, leaveCutoffMs, joinClosed, leaveLocked } = deadlineState(
    event.starts_at,
    nowMs,
  );
  const joinCountdownText = formatCountdown(joinCutoffMs - nowMs);
  const leaveByText = formatWhen(new Date(leaveCutoffMs).toISOString());
```

- [ ] **Step 4: Add the `onMessageOrganizer` action**

Immediately after the `onStart` handler block (ends ~line 207, before `// --- Adaptive CTA content ---`), add:

```ts
  const onMessageOrganizer = () =>
    run(async () => {
      const channel = streamClient.channel('messaging', {
        members: [uid!, event.organizer_id],
      });
      await channel.watch();
      router.push(('/chat/' + channel.cid) as never);
    });

  // Past the leave cutoff: a confirmed/standby player can no longer self-leave (JM-19) —
  // offer a DM to the organizer instead. Before the cutoff: Leave + a "leave by" hint.
  const leaveOrContact = leaveLocked ? (
    <View style={styles.ctaCol}>
      <Text style={styles.deadlineNotice}>{t('leaveLockedBody')}</Text>
      <Pressable
        style={[styles.btn, styles.secondaryBtn]}
        accessibilityRole="button"
        disabled={busy}
        onPress={onMessageOrganizer}
      >
        {busy ? (
          <ActivityIndicator color="#0B1F3A" />
        ) : (
          <Text style={styles.secondaryLabel}>{t('messageOrganizerCta')}</Text>
        )}
      </Pressable>
    </View>
  ) : (
    <>
      <Pressable
        style={[styles.btn, styles.secondaryBtn]}
        accessibilityRole="button"
        disabled={busy}
        onPress={onLeave}
      >
        {busy ? (
          <ActivityIndicator color="#0B1F3A" />
        ) : (
          <Text style={styles.secondaryLabel}>{t('leaveCta')}</Text>
        )}
      </Pressable>
      <Text style={styles.leaveHint}>{t('leaveByHint', { when: leaveByText })}</Text>
    </>
  );
```

- [ ] **Step 5: Replace the standby Leave button with `leaveOrContact`**

In the `} else if (me.is_standby) {` branch, replace the inner `showJoinLeave ? (<Pressable …Leave…/>) : null`
(current lines ~298-311) so the body reads:

```tsx
      cta = (
        <View style={styles.ctaCol}>
          <Text style={styles.ctaBadge}>{t('standbyBadge')}</Text>
          {showJoinLeave ? leaveOrContact : null}
        </View>
      );
```

- [ ] **Step 6: Replace the confirmed Leave button with `leaveOrContact`**

In the following `} else {` branch (the confirmed "going" case, current lines ~315-333), replace the inner
`showJoinLeave ? (<Pressable …Leave…/>) : null` so the body reads:

```tsx
      cta = (
        <View style={styles.ctaCol}>
          <Text style={styles.ctaBadge}>{t('goingBadge')}</Text>
          {showJoinLeave ? leaveOrContact : null}
        </View>
      );
```

- [ ] **Step 7: Gate the invited accept/decline path on `joinClosed`**

Replace the entire `} else if (myInvite && showJoinLeave) {` block (current lines ~335-373) with:

```tsx
  } else if (myInvite && showJoinLeave) {
    if (joinClosed) {
      cta = <Text style={styles.deadlineNotice}>{t('joiningClosed')}</Text>;
    } else {
      const inviterRow =
        participants.find((p) => p.user_id === myInvite.invited_by) ?? null;
      const inviterName = inviterRow?.profiles?.full_name ?? null;
      cta = (
        <View style={styles.ctaCol}>
          <Text style={styles.ctaBadge}>
            {inviterName != null
              ? t('invitedBanner', { name: inviterName })
              : t('invitedBannerGeneric')}
          </Text>
          <View style={styles.ctaRow}>
            <Pressable
              style={[styles.btn, styles.secondaryBtn, styles.btnFlex]}
              accessibilityRole="button"
              disabled={busy}
              onPress={onDecline}
            >
              {busy ? (
                <ActivityIndicator color="#0B1F3A" />
              ) : (
                <Text style={styles.secondaryLabel}>{t('declineCta')}</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.btn, styles.primaryBtn, styles.btnFlex]}
              accessibilityRole="button"
              disabled={busy}
              onPress={onAccept}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryLabel}>{t('acceptCta')}</Text>
              )}
            </Pressable>
          </View>
        </View>
      );
    }
  } else if (showJoinLeave) {
```

(Note: this replacement keeps the trailing `} else if (showJoinLeave) {` line that begins the next branch — do not duplicate it.)

- [ ] **Step 8: Replace the join branch with countdown + closed handling**

Replace the body of the final `} else if (showJoinLeave) {` block (current lines ~375-417, the
team-join / waitlist / join cases) with:

```tsx
    if (joinClosed) {
      cta = <Text style={styles.deadlineNotice}>{t('joiningClosed')}</Text>;
    } else if (event.specification === 'team') {
      cta = (
        <View style={styles.ctaCol}>
          <Text style={styles.countdown}>{t('joinCountdown', { time: joinCountdownText })}</Text>
          <Pressable
            style={[styles.btn, styles.primaryBtn]}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => router.push(`/event/${id}/partner-requests` as Href)}
          >
            <Text style={styles.primaryLabel}>{t('teamJoinCta')}</Text>
          </Pressable>
        </View>
      );
    } else {
      const joinLabel = totalIn >= totalCapacity ? t('waitlistCta') : t('joinCta');
      cta = (
        <View style={styles.ctaCol}>
          <Text style={styles.countdown}>{t('joinCountdown', { time: joinCountdownText })}</Text>
          <Pressable
            style={[styles.btn, styles.primaryBtn]}
            accessibilityRole="button"
            disabled={busy}
            onPress={onJoin}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryLabel}>{joinLabel}</Text>
            )}
          </Pressable>
        </View>
      );
    }
  }
```

(This merges the previous waitlist-vs-join branches into one — both call `onJoin`; only the label differs.
Ensure exactly one closing `}` ends the `else if (showJoinLeave)` block.)

- [ ] **Step 9: Add the new styles**

In the `StyleSheet.create({...})` at the bottom, add (next to `ctaBadge`/`error`):

```ts
  countdown: { fontSize: 14, fontWeight: '600', color: '#0B7BFF', textAlign: 'center' },
  deadlineNotice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7685',
    textAlign: 'center',
    paddingVertical: 8,
  },
  leaveHint: { fontSize: 13, color: '#6B7685', textAlign: 'center' },
```

- [ ] **Step 10: Add the i18n keys**

In `apps/mobile/lib/i18n-mobile.ts`, inside the `mobileEvent.en` object (near the existing
`leaveCta`/`joinCta`/`goingBadge` keys, ~line 1110), add:

```ts
    joinCountdown: '{{time}} left to join',
    joiningClosed: 'Joining closed',
    leaveLockedBody: 'Past the drop-out deadline — message the organizer to leave.',
    messageOrganizerCta: 'Message organizer',
    leaveByHint: 'You can leave until {{when}}',
```

- [ ] **Step 11: Typecheck**

Run: `pnpm -w typecheck`
Expected: PASS (13 packages). Fix any JSX-balance errors from Steps 7-8 (the most likely failure point —
verify brace/paren balance of the CTA chain).

- [ ] **Step 12: Commit**

```bash
git add "apps/mobile/app/event/[id]/index.tsx" apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(events): join countdown, joining-closed + message-organizer deadline UI (5G-1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verification (whole slice)

1. **Unit:** `pnpm --filter @padel/utils test` — `eventDeadlines` cases green.
2. **Types:** `pnpm -w typecheck` — 13/13.
3. **App smoke (simulator, optional but recommended):** start Metro, open a scheduled event as a
   non-organizer; confirm:
   - a joinable viewer sees the "{time} left to join" line above Join;
   - an event with `starts_at` < 6h away shows "Joining closed" and no Join button;
   - a confirmed player on an event with `starts_at` < 12h away sees "Message organizer" (tapping opens a
     DM) instead of Leave; > 12h away sees Leave + "You can leave until …".

## Notes for the implementer

- **Rules of Hooks:** `useNow()` MUST be added in Step 2 (with the other hooks, before the `isLoading` /
  `event == null` early returns). Do not move it below them.
- **Server is the source of truth:** do not remove the existing `{error}` line or the `run()` wrapper —
  a tap exactly at a cutoff still relies on the RPC raising `event_closed` / `leave_deadline_passed`.
- **No package.json change:** `@padel/utils` is already a mobile dependency.
- The `event` namespace is English-only (registered for `en` only), so keys go in `mobileEvent.en` alone.
