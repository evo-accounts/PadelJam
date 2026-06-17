# Phase 5H — Match Timer + Share Results / CM-39 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-event organizer-controlled match Timer (synced countdown, time-mode events) and a Share-Results flow that posts an event result to the community feed (CM-39, rendered as a live result card) and/or shares a text summary.

**Architecture:** 5H-A: `event_timer` table + `set_event_timer` RPC + realtime + a `TimerTab` component in `live.tsx`. 5H-B: `post_event_result` + `event_result_summary` RPCs, a `ShareResultsModal` in the finish flow, and dynamic `kind='result'` rendering in `PostCard`. Round-gen is already built (out of scope).

**Tech Stack:** Postgres/Supabase, TanStack Query, React Native / Expo Router, expo-sharing, Supabase realtime.

Spec: `docs/superpowers/specs/2026-06-17-phase5h-timer-share-results-design.md`.

---

### Task 1: Migration `0074_event_timer.sql` + SQL test

**Files:**
- Create: `infra/supabase/migrations/0074_event_timer.sql`
- Create: `infra/supabase/tests/event_timer.sql`

- [ ] **Step 1: Write the migration** — use the exact SQL from the spec's "Migration `0074_event_timer.sql`"
  section (the `event_timer` table + read RLS + realtime publication + `set_event_timer(p_event_id, p_action)`
  RPC + grant). Confirm `is_event_organizer(e,u)` and `event_is_visible(e,u)` exist.

- [ ] **Step 2: Apply** — `export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token && pnpm dlx supabase@latest --workdir infra db reset` (clean, through `0074`).

- [ ] **Step 3: SQL test** — create `infra/supabase/tests/event_timer.sql` (template: `infra/supabase/tests/event_blasts.sql`). Seed organizer U1 + non-organizer U2 + an event `ev` (organizer U1, `scoring_mode='time'`, `scoring_value=15`, status='in_progress', NOT-NULL cols). Assertions (as U1 unless noted):
  1. `perform set_event_timer(ev,'start')` → a row exists with `status='running'`, `duration_seconds=900` (15*60), `started_at` not null.
  2. `perform set_event_timer(ev,'pause')` → `status='paused'`, `paused_at` not null.
  3. `perform set_event_timer(ev,'resume')` → `status='running'`, `paused_at` null.
  4. `perform set_event_timer(ev,'reset')` → `status='idle'`, `started_at` null.
  5. As U2 (non-organizer jwt): `set_event_timer(ev,'start')` → raises `forbidden` (nested begin/exception + sqlerrm check).
  6. End `raise notice 'OK event_timer';` rollback.

- [ ] **Step 4: Run** — `docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/event_timer.sql` → `OK event_timer`, no PT001.

- [ ] **Step 5: Commit**

```bash
git add infra/supabase/migrations/0074_event_timer.sql infra/supabase/tests/event_timer.sql
git commit -m "feat(events): event_timer table + set_event_timer RPC (5H-A)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Migration `0075_event_result_post.sql` + SQL test

**Files:**
- Create: `infra/supabase/migrations/0075_event_result_post.sql`
- Create: `infra/supabase/tests/event_result_post.sql`

- [ ] **Step 1: Write the migration** — use the exact SQL from the spec's "Migration `0075_event_result_post.sql`"
  section (the `community_posts.result_event_id` FK; `post_event_result(p_event_id)`; `event_result_summary(p_event_id)`;
  grants). Confirm `event_group_community(e)`, `is_community_member(c)`, `standings(uuid)` exist.

- [ ] **Step 2: Apply** — `db reset` (clean, through `0075`).

- [ ] **Step 3: SQL test** — create `infra/supabase/tests/event_result_post.sql`. Seed organizer U1 + member M1 + non-member U2. As U1, `create_community_with_personal_tenant(...)` → cid; reuse the general group g; insert a **completed** event `ev` (group_id=g, organizer U1, status='completed', NOT-NULL cols) with M1 as a confirmed participant (add a played match + scores so standings has rows, OR accept empty standings — the summary may be empty but post still works). Also a standalone completed event `ev2` (group_id=null, is_private=true, organizer U1). Assertions:
  1. As U1: `post_event_result(ev)` returns a uuid; a `community_posts` row exists with `kind='result'`, `result_event_id=ev`, `community_id=cid`.
  2. As U1: `post_event_result(ev)` again → `already_posted`.
  3. As U1: `post_event_result(ev2)` → `no_community`.
  4. Seed a scheduled event `ev3` (U1) → `post_event_result(ev3)` → `not_completed`.
  5. As U2 (non-organizer): `post_event_result(ev)` → `forbidden`.
  6. `event_result_summary(ev)` as M1 (community member) returns ≥0 rows without error; as U2 (non-member) returns 0 rows.
  7. End `raise notice 'OK event_result_post';` rollback.

- [ ] **Step 4: Run** — `psql < infra/supabase/tests/event_result_post.sql` → `OK event_result_post`.

- [ ] **Step 5: Commit**

```bash
git add infra/supabase/migrations/0075_event_result_post.sql infra/supabase/tests/event_result_post.sql
git commit -m "feat(events): post_event_result + event_result_summary RPCs + result_event_id FK (5H-B)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Types + query keys + mapPgError + API hooks

**Files:**
- Modify: `packages/db/src/database.types.ts`
- Modify: `packages/api/src/query-keys.ts`
- Modify: `packages/api/src/client.ts`
- Modify: `packages/api/src/events/queries.ts`
- Modify: `packages/api/src/events/mutations.ts`
- Modify: `packages/api/src/events/realtime.ts`
- Modify: `packages/api/src/communities/queries.ts`

- [ ] **Step 1: Types** — in `database.types.ts` add: `event_timer` Row/Insert/Update (event_id, duration_seconds, started_at, paused_at, status, updated_at); the `community_posts` Relationships gain `result_event_id → events` (optional); Functions: `set_event_timer: { Args: { p_event_id: string; p_action: string }; Returns: undefined }`, `post_event_result: { Args: { p_event_id: string }; Returns: string }`, `event_result_summary: { Args: { p_event_id: string }; Returns: { rank: number; name: string; points: number }[] }`.

- [ ] **Step 2: Query keys** — in `query-keys.ts` add:
```ts
  eventTimer: (id: string) => ['event', id, 'timer'] as const,
  eventResultSummary: (id: string) => ['event', id, 'result-summary'] as const,
```

- [ ] **Step 3: mapPgError** — in `client.ts`, add `'invalid_action'` (if absent), `'not_completed'`, `'no_community'` (if absent), `'already_posted'` to the `KNOWN` allow-list.

- [ ] **Step 4: Realtime** — in `events/realtime.ts`, add a subscription for `event_timer` (filtered `event_id=eq.<id>`) that invalidates `qk.eventTimer(eventId)`:
```ts
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_timer', filter },
        () => {
          qc.invalidateQueries({ queryKey: qk.eventTimer(eventId) });
        },
      )
```
(insert before `.subscribe()`).

- [ ] **Step 5: Queries** — in `events/queries.ts` add:
```ts
export interface EventTimerRow {
  duration_seconds: number;
  started_at: string | null;
  paused_at: string | null;
  status: 'idle' | 'running' | 'paused';
}
export const useEventTimer = (eventId: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.eventTimer(eventId),
    queryFn: async () => {
      const { data, error } = await db
        .from('event_timer')
        .select('duration_seconds, started_at, paused_at, status')
        .eq('event_id', eventId)
        .maybeSingle()
        .returns<EventTimerRow | null>();
      if (error) throw error;
      return data;
    },
  });
};

export interface ResultPlacement { rank: number; name: string; points: number }
export const useEventResultSummary = (eventId: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.eventResultSummary(eventId),
    queryFn: async () => {
      const { data, error } = await db.rpc('event_result_summary', { p_event_id: eventId });
      if (error) throw error;
      return (data ?? []) as ResultPlacement[];
    },
  });
};
```

- [ ] **Step 6: Mutations** — in `events/mutations.ts` add:
```ts
export const useSetEventTimer = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: 'start' | 'pause' | 'resume' | 'reset') => {
      const { error } = await db.rpc('set_event_timer', { p_event_id: eventId, p_action: action });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.eventTimer(eventId) });
    },
  });
};

export const usePostEventResult = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (communityId: string) => {
      const { data, error } = await db.rpc('post_event_result', { p_event_id: eventId });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      qc.invalidateQueries({ queryKey: qk.posts(communityId) });
      return data as string;
    },
  });
};
```
(`qk.posts` already exists for community feeds.)

- [ ] **Step 7: Extend community posts type** — in `communities/queries.ts` `useCommunityPosts`, add `result_event_id: string | null` to the `.returns<>()` row type (the `select('*')` already fetches it). `kind` is already in the type.

- [ ] **Step 8: Verify + commit** — `pnpm -w typecheck` (13/13), `pnpm --filter @padel/api test`. Then:
```bash
git add packages/db/src/database.types.ts packages/api/src/query-keys.ts packages/api/src/client.ts packages/api/src/events/queries.ts packages/api/src/events/mutations.ts packages/api/src/events/realtime.ts packages/api/src/communities/queries.ts
git commit -m "feat(api): timer + result-post hooks, realtime, result_event_id (5H)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Timer tab UI

**Files:**
- Create: `apps/mobile/components/event/TimerTab.tsx`
- Modify: `apps/mobile/app/event/[id]/live.tsx`
- Modify: `apps/mobile/lib/i18n-mobile.ts`

- [ ] **Step 1: i18n** — in `mobileEvent.en` add: `timerTab: 'Timer'`, `timerStart: 'Start'`, `timerPause: 'Pause'`, `timerResume: 'Resume'`, `timerReset: 'Reset'`, `timerIdle: 'Not started'`, `timerDone: "Time's up"`.

- [ ] **Step 2: Create `TimerTab.tsx`**

```tsx
import { useEventTimer, useSetEventTimer } from '@padel/api';
import { useT } from '@padel/i18n';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useNow } from '@/lib/useNow';

function fmt(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, '0')}`;
}

export function TimerTab({ eventId, isOrganizer }: { eventId: string; isOrganizer: boolean }) {
  const { t } = useT('event');
  const { data: timer } = useEventTimer(eventId);
  const setTimer = useSetEventTimer(eventId);
  const nowMs = useNow(1000); // tick every second for the countdown

  const status = timer?.status ?? 'idle';
  const duration = timer?.duration_seconds ?? 0;
  let remaining = duration;
  if (timer?.started_at) {
    if (status === 'running') {
      remaining = duration - (nowMs - Date.parse(timer.started_at)) / 1000;
    } else if (status === 'paused' && timer.paused_at) {
      remaining = duration - (Date.parse(timer.paused_at) - Date.parse(timer.started_at)) / 1000;
    }
  }
  const done = status !== 'idle' && remaining <= 0;

  const act = (a: 'start' | 'pause' | 'resume' | 'reset') => {
    if (setTimer.isPending) return;
    setTimer.mutate(a);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.clock}>{done ? '0:00' : status === 'idle' ? fmt(duration) : fmt(remaining)}</Text>
      <Text style={styles.state}>
        {done ? t('timerDone') : status === 'idle' ? t('timerIdle') : ''}
      </Text>
      {isOrganizer ? (
        <View style={styles.controls}>
          {setTimer.isPending ? (
            <ActivityIndicator color="#0B1F3A" />
          ) : (
            <>
              {status === 'idle' ? (
                <Pressable style={[styles.btn, styles.primary]} onPress={() => act('start')} accessibilityRole="button">
                  <Text style={styles.primaryLabel}>{t('timerStart')}</Text>
                </Pressable>
              ) : null}
              {status === 'running' ? (
                <Pressable style={[styles.btn, styles.primary]} onPress={() => act('pause')} accessibilityRole="button">
                  <Text style={styles.primaryLabel}>{t('timerPause')}</Text>
                </Pressable>
              ) : null}
              {status === 'paused' ? (
                <Pressable style={[styles.btn, styles.primary]} onPress={() => act('resume')} accessibilityRole="button">
                  <Text style={styles.primaryLabel}>{t('timerResume')}</Text>
                </Pressable>
              ) : null}
              {status !== 'idle' ? (
                <Pressable style={[styles.btn, styles.secondary]} onPress={() => act('reset')} accessibilityRole="button">
                  <Text style={styles.secondaryLabel}>{t('timerReset')}</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 48, gap: 16 },
  clock: { fontSize: 72, fontWeight: '800', color: '#0B1F3A', fontVariant: ['tabular-nums'] },
  state: { fontSize: 15, color: '#6B7685', minHeight: 20 },
  controls: { flexDirection: 'row', gap: 12, marginTop: 16 },
  btn: { minHeight: 48, paddingHorizontal: 28, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: '#0B7BFF' },
  primaryLabel: { fontSize: 16, fontWeight: '700', color: '#fff' },
  secondary: { backgroundColor: '#F0F3F8' },
  secondaryLabel: { fontSize: 16, fontWeight: '600', color: '#0B1F3A' },
});
```

(Confirm `apps/mobile/lib/useNow.ts` exports `useNow(intervalMs?)`; it does, and accepts an interval — pass `1000`.)

- [ ] **Step 3: Wire into `live.tsx`**
  - Import `import { TimerTab } from '@/components/event/TimerTab';`
  - Extend the tab state union (line 72) to include `'timer'`:
    `useState<'overview' | 'matches' | 'leaderboard' | 'timer' | null>(null)`.
  - Add `const isTimed = event.scoring_mode === 'time';`
  - In the content ScrollView, add a branch: when `effectiveTab === 'timer'`, render
    `<TimerTab eventId={id} isOrganizer={isOrganizer} />` (add it to the `effectiveTab === ... ? ... :` chain,
    e.g. as the final `: effectiveTab === 'timer' ? (<TimerTab .../>) : (leaderboard)`).
  - In the segment bar (after the Matches segment, before Leaderboard), add — gated on `isTimed`:
    ```tsx
    {isTimed ? (
      <Pressable style={[styles.segment, effectiveTab === 'timer' && styles.segmentActive]} accessibilityRole="button" onPress={() => setTab('timer')}>
        <Text style={[styles.segmentText, effectiveTab === 'timer' && styles.segmentTextActive]}>{t('timerTab')}</Text>
      </Pressable>
    ) : null}
    ```

- [ ] **Step 4: Typecheck + commit** — `pnpm -w typecheck` (13/13). Then:
```bash
git add "apps/mobile/components/event/TimerTab.tsx" "apps/mobile/app/event/[id]/live.tsx" apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(events): match timer tab (5H-A)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Share-results modal

**Files:**
- Create: `apps/mobile/components/event/ShareResultsModal.tsx`
- Modify: `apps/mobile/app/event/[id]/live.tsx`
- Modify: `apps/mobile/lib/i18n-mobile.ts`

- [ ] **Step 1: i18n** — in `mobileEvent.en` add: `shareResultsCta: 'Share results'`, `shareResultsTitle: 'Share results'`, `postToFeedCta: 'Post to community feed'`, `shareExternalCta: 'Share…'`, `resultPosted: 'Posted to the community feed.'`, `already_posted: 'Results are already posted to the feed.'`, `not_completed: 'Finish the event first.'`.

- [ ] **Step 2: Create `ShareResultsModal.tsx`**

```tsx
import { usePostEventResult } from '@padel/api';
import { useT } from '@padel/i18n';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export function ShareResultsModal({
  visible,
  onClose,
  eventId,
  communityId,
  summaryText,
}: {
  visible: boolean;
  onClose: () => void;
  eventId: string;
  communityId: string | null;
  summaryText: string;
}) {
  const { t } = useT('event');
  const postResult = usePostEventResult(eventId);
  const [posted, setPosted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPost = () => {
    if (!communityId || postResult.isPending) return;
    setError(null);
    postResult
      .mutateAsync(communityId)
      .then(() => setPosted(true))
      .catch((e) => setError(t(e instanceof Error ? e.message : 'unknown_error')));
  };

  const onShare = async () => {
    if (await Sharing.isAvailableAsync()) {
      // expo-sharing shares files/URLs; for a plain text summary, fall back to clipboard.
      await Clipboard.setStringAsync(summaryText);
    } else {
      await Clipboard.setStringAsync(summaryText);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t('shareResultsTitle')}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {communityId ? (
            <Pressable
              style={[styles.btn, styles.primary, (posted || postResult.isPending) && styles.disabled]}
              disabled={posted || postResult.isPending}
              onPress={onPost}
              accessibilityRole="button"
            >
              {postResult.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryLabel}>{posted ? t('resultPosted') : t('postToFeedCta')}</Text>
              )}
            </Pressable>
          ) : null}
          <Pressable style={[styles.btn, styles.secondary]} onPress={onShare} accessibilityRole="button">
            <Text style={styles.secondaryLabel}>{t('shareExternalCta')}</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#0B1F3A' },
  error: { color: '#D7263D', fontSize: 14, fontWeight: '600' },
  btn: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: '#0B7BFF' },
  primaryLabel: { fontSize: 16, fontWeight: '700', color: '#fff' },
  secondary: { backgroundColor: '#F0F3F8' },
  secondaryLabel: { fontSize: 16, fontWeight: '600', color: '#0B1F3A' },
  disabled: { opacity: 0.5 },
});
```

Note: `expo-sharing` shares files/URLs, not raw strings; sharing a plain text summary uses the clipboard
fallback (copies the summary). This keeps the external-share path dependency-free; an image/file share is a
documented follow-up.

- [ ] **Step 3: Wire into `live.tsx`**
  - Import `import { ShareResultsModal } from '@/components/event/ShareResultsModal';`
  - Add state `const [shareOpen, setShareOpen] = useState(false);`
  - Build the summary text from existing standings + names (the screen already has `standings` and
    `nameById`): 
    ```ts
    const resultsSummary = [`🏆 ${event.name}`, ...standings.map((s) => `${s.rank}. ${nameById.get(s.entity_id) ?? '—'} (${s.points})`)].join('\n');
    ```
  - In `onFinish`, after `setFinishOpen(false)` (replace the `Alert.alert(t('finishedTitle'))`), open the
    share modal: `setShareOpen(true);`
  - On the completed **Overview** tab (the `effectiveTab === 'overview'` block), add a "Share results"
    button: `<Pressable style={[styles.btn, styles.shareBtn]} onPress={() => setShareOpen(true)} accessibilityRole="button"><Text style={styles.shareLabel}>{t('shareResultsCta')}</Text></Pressable>` (reuse/define a button style).
  - The modal needs the **community id** (not the group id) to invalidate the feed cache and to decide
    whether to show the post button. Derive it from the event's group: add `useGroup` to the `@padel/api`
    import and call `const { data: group } = useGroup(event.group_id ?? '');` with the other hooks (it
    returns the group incl. `community_id`; an empty id yields no data, which is fine for standalone
    events). Then render the modal before the closing `</SafeAreaView>`:
    ```tsx
    <ShareResultsModal
      visible={shareOpen}
      onClose={() => setShareOpen(false)}
      eventId={id}
      communityId={event.group_id ? (group?.community_id ?? null) : null}
      summaryText={resultsSummary}
    />
    ```
    `ShareResultsModal` shows the "Post to community feed" button only when `communityId != null`.

- [ ] **Step 4: Typecheck + commit** — `pnpm -w typecheck` (13/13). Then:
```bash
git add "apps/mobile/components/event/ShareResultsModal.tsx" "apps/mobile/app/event/[id]/live.tsx" apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(events): share-results modal (post to feed + external) (5H-B)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Result-post rendering in the community feed

**Files:**
- Modify: `apps/mobile/components/community/PostCard.tsx`
- Modify: `apps/mobile/lib/i18n-mobile.ts`

- [ ] **Step 1: i18n** — in the `mobileCommunity.en` block add: `resultCardTitle: 'Event result'`, `viewEventCta: 'View event'`, `resultUnavailable: 'Result unavailable'`.

- [ ] **Step 2: Extend the `CommunityPost` type + render the result card**

In `apps/mobile/components/community/PostCard.tsx`:
- Add to the `CommunityPost` type: `kind?: string; result_event_id?: string | null;`
- Add imports: `import { useEventResultSummary } from '@padel/api';`, `import { useRouter } from 'expo-router';`
- At the top of the component body, after the existing derivations, render the result card when applicable.
  Add a small inner component to keep hooks unconditional:

```tsx
function ResultBody({ eventId }: { eventId: string }) {
  const { t } = useT('community');
  const router = useRouter();
  const { data: rows } = useEventResultSummary(eventId);
  const top = (rows ?? []).slice(0, 3);
  return (
    <View style={styles.result}>
      <Text style={styles.resultTitle}>{t('resultCardTitle')}</Text>
      {top.length === 0 ? (
        <Text style={styles.resultRow}>{t('resultUnavailable')}</Text>
      ) : (
        top.map((r) => (
          <Text key={r.rank} style={styles.resultRow}>{`${r.rank}. ${r.name} · ${r.points}`}</Text>
        ))
      )}
      <Pressable onPress={() => router.push(('/event/' + eventId) as never)} accessibilityRole="button">
        <Text style={styles.resultLink}>{t('viewEventCta')}</Text>
      </Pressable>
    </View>
  );
}
```

- In the card JSX, replace the body/image block with a conditional: when `post.kind === 'result' &&
  post.result_event_id`, render `<ResultBody eventId={post.result_event_id} />`; otherwise the existing
  `{post.body ? … }{post.image_path ? …}`.
- Add styles: `result: { backgroundColor: '#F4F6FA', borderRadius: 12, padding: 12, gap: 4 }, resultTitle: { fontSize: 12, fontWeight: '800', color: '#6B4EFF', textTransform: 'uppercase' }, resultRow: { fontSize: 15, color: '#0B1F3A', fontWeight: '500' }, resultLink: { fontSize: 14, fontWeight: '700', color: '#0B7BFF', marginTop: 4 }`.

- [ ] **Step 3: Typecheck + commit** — `pnpm -w typecheck` (13/13). Then:
```bash
git add "apps/mobile/components/community/PostCard.tsx" apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(communities): render result posts as a result card (CM-39)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verification (whole slice)

1. **DB:** `db reset` clean; `psql < infra/supabase/tests/event_timer.sql` → `OK event_timer`; `psql < infra/supabase/tests/event_result_post.sql` → `OK event_result_post`.
2. **Types/API:** `pnpm -w typecheck` 13/13; `pnpm --filter @padel/api test`.
3. **App smoke (simulator):** a `scoring_mode='time'` event shows a Timer tab; organizer Start/Pause/Resume/
   Reset and the countdown ticks/syncs; finishing a community event opens Share results → Post to feed →
   the post renders as a result card (top placements + View event) in the community feed; external Share
   copies the summary.

## Notes for the implementer

- **Timer control is organizer-only** server-side (`set_event_timer` gate); non-organizers only see the
  read-only countdown (the `TimerTab` hides controls when `!isOrganizer`).
- `set_event_timer` derives duration from `events.scoring_value * 60` (time-mode minutes). Verify the
  create wizard stores the time limit in minutes; if it stores seconds, drop the `*60`.
- **Documented follow-up:** external Share currently copies the text summary to the clipboard
  (expo-sharing needs a file/URL). A proper share-sheet of a results image/file is a follow-up.
- Migrations `0074`/`0075` (next after `0073`); no new npm dependency.
- Round generation (americano/mexicano/up&down) is already implemented — do not touch it.
