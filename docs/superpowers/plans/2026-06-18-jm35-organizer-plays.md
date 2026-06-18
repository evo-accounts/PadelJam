# JM-35 — Organizer Plays (Join/Leave as a player) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the event detail screen, let the organizer Join/Leave as a player without cancelling the event.

**Architecture:** UI-only change to the `isOrganizer` CTA branch in `apps/mobile/app/event/[id]/index.tsx`, reusing the existing `me`/`onJoin`/`onLeave` and the 5G-1 `joinClosed`/`leaveLocked`/`leaveByText` derivations + i18n. No migration, RPC, or `@padel/api` change (`join_event`/`leave_event` already work for the organizer).

**Tech Stack:** React Native / Expo Router, i18next.

Spec: `docs/superpowers/specs/2026-06-18-jm35-organizer-plays-design.md`.

---

### Task 1: Organizer Join/Leave-as-player CTA + i18n

**Files:**
- Modify: `apps/mobile/app/event/[id]/index.tsx`
- Modify: `apps/mobile/lib/i18n-mobile.ts`

- [ ] **Step 1: Add i18n keys**

In `apps/mobile/lib/i18n-mobile.ts`, in the `mobileEvent.en` block (near `organizerBadge`), add:

```ts
    organizerPlayingBadge: "You're organizing and going!",
    joinAsPlayerCta: 'Join as a player',
    leaveAsPlayerCta: 'Leave as a player',
```

(`organizerBadge`, `leaveByHint`, `manageCta`, `startCta`, `startSetupIncomplete` already exist.)

- [ ] **Step 2: Replace the `isOrganizer` CTA branch**

In `apps/mobile/app/event/[id]/index.tsx`, replace the entire `} else if (isOrganizer) { … }` branch
(currently lines ~307-337 — the block that renders the organizer badge + Manage + Start) with the version
below. It adds the playing/not-playing badge and the Join/Leave-as-player affordances; Manage + Start are
unchanged. This branch only runs when `status === 'scheduled'` (in_progress/completed are handled earlier),
so no extra status guard is needed.

```tsx
  } else if (isOrganizer) {
    // JM-35: the organizer can also play. `me` is their participant row (set when organizing_and_playing,
    // or after they Join as a player). Join/Leave respect the same 6h/12h cutoffs as players.
    const organizerJoin =
      me == null && !joinClosed ? (
        <Pressable
          style={[styles.btn, styles.secondaryBtn]}
          accessibilityRole="button"
          disabled={busy}
          onPress={
            event.specification === 'team'
              ? () => router.push(`/event/${id}/partner-requests` as Href)
              : onJoin
          }
        >
          {busy ? (
            <ActivityIndicator color="#0B1F3A" />
          ) : (
            <Text style={styles.secondaryLabel}>{t('joinAsPlayerCta')}</Text>
          )}
        </Pressable>
      ) : null;
    const organizerLeave =
      me != null && !leaveLocked ? (
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
              <Text style={styles.secondaryLabel}>{t('leaveAsPlayerCta')}</Text>
            )}
          </Pressable>
          <Text style={styles.leaveHint}>{t('leaveByHint', { when: leaveByText })}</Text>
        </>
      ) : null;
    cta = (
      <View style={styles.ctaCol}>
        <Text style={styles.ctaBadge}>
          {me != null ? t('organizerPlayingBadge') : t('organizerBadge')}
        </Text>
        <Pressable
          style={[styles.btn, styles.primaryBtn]}
          accessibilityRole="button"
          disabled={busy}
          onPress={() => router.push(`/event/${id}/manage` as Href)}
        >
          <Text style={styles.primaryLabel}>{t('manageCta')}</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.startBtn, !setupComplete && styles.btnDisabled]}
          accessibilityRole="button"
          disabled={busy || !setupComplete}
          onPress={onStart}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryLabel}>{t('startCta')}</Text>
          )}
        </Pressable>
        {!setupComplete ? (
          <Text style={styles.startHint}>
            {t('startSetupIncomplete', { needed: event.num_courts * 4 })}
          </Text>
        ) : null}
        {organizerJoin}
        {organizerLeave}
      </View>
    );
  }
```

(All referenced styles — `secondaryBtn`, `secondaryLabel`, `leaveHint`, `ctaCol`, `ctaBadge`, `btn`,
`primaryBtn`, `startBtn`, `btnDisabled`, `primaryLabel`, `startHint` — already exist in this file. `onJoin`,
`onLeave`, `me`, `joinClosed`, `leaveLocked`, `leaveByText`, `setupComplete`, `Href` are all already in
scope from earlier in the component.)

- [ ] **Step 3: Typecheck**

Run: `pnpm -w typecheck`
Expected: PASS (13/13).

- [ ] **Step 4: Commit**

```bash
git add "apps/mobile/app/event/[id]/index.tsx" apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(events): organizer can join/leave as a player (JM-35)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verification (whole slice)

1. **Types:** `pnpm -w typecheck` 13/13. No `@padel/api`/migration/SQL changes.
2. **App smoke (simulator, optional):** an `organizing_only` organizer's detail screen shows "You're
   organizing" + Manage/Start + **"Join as a player"**; tapping joins (they appear in the confirmed list)
   and the badge flips to "You're organizing and going!" with **"Leave as a player"**; leaving removes them
   and the event stays scheduled (not cancelled). Past the 6h join cutoff the Join button is hidden; past
   the 12h leave cutoff the Leave button is hidden.

## Notes for the implementer

- **No backend change** — `join_event`/`leave_event` already permit the organizer and never cancel the
  event; covered by `infra/supabase/tests/event_join.sql`.
- The branch runs only for `status === 'scheduled'` (earlier branches handle in_progress/completed), so the
  Join/Leave affordances are implicitly scheduled-only.
- Team-spec events: "Join as a player" routes to the existing `partner-requests` flow; "Leave as a player"
  uses `onLeave` (which already handles team partner demotion).
