# Edit Event (JM-24) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an organizer edit a scheduled event's mutable fields from one sectioned Edit screen.

**Architecture:** An organizer-gated `update_event(event_id, payload)` RPC updates the editable subset (never event_type/specification/num_courts/location); `updateEventSchema`/`buildUpdateEventPayload`/`useUpdateEvent` mirror the create equivalents; a new `edit.tsx` reuses the wizard's `Step4Scoring`, `Step8Preferences`, `DateTimePicker`, and `Stepper` over an `EventDraft`-shaped state, plus a small Details section.

**Tech Stack:** Postgres/Supabase RPC, zod, TanStack Query, React Native / Expo Router.

Spec: `docs/superpowers/specs/2026-06-18-edit-event-design.md`.

---

### Task 1: Migration `0078_update_event.sql` + SQL test

**Files:**
- Create: `infra/supabase/migrations/0078_update_event.sql`
- Create: `infra/supabase/tests/update_event.sql`

- [ ] **Step 1: Write the migration** — use the exact `update_event(p_event_id, p_payload)` SQL from the
  spec's "Migration `0078_update_event.sql`" section (organizer + `status='scheduled'` gate; standby
  capacity guard → `standby_below_roster`; standalone forces `is_private=true`; `UPDATE events SET` the
  editable subset only). Grant to authenticated. Confirm the `events_standalone_private`/`events_fee_complete`
  CHECKs exist (0040) so a bad payload is rejected server-side.

- [ ] **Step 2: Apply** — `export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token && pnpm dlx supabase@latest --workdir infra db reset` (clean, through `0078`).

- [ ] **Step 3: SQL test** — create `infra/supabase/tests/update_event.sql` (template: `infra/supabase/tests/event_blasts.sql`). Seed organizer U1 + non-organizer U2; as U1 create a community + reuse the general group; insert a **scheduled** event `ev` (group_id=g, organizer U1, all NOT-NULL cols, `allow_standby=true, standby_spots=2`). Helper to call: `perform update_event(ev, jsonb_build_object('name','New Name','description','d','starts_at', (now()+interval '2 days')::text, 'duration_minutes',90,'scoring_mode','points','scoring_value',24,'allow_standby',true,'standby_spots',2,'is_private',false,'entrance_fee_enabled',false,'players_submit_results',false,'organizer_role','organizing_only'))`. Assertions (PT001/`OK update_event`):
  1. As U1: the above call → `events.name='New Name'`, `scoring_value=24`, `starts_at` updated.
  2. As U2 (non-organizer jwt): the call → raises `forbidden`.
  3. Set `ev.status='in_progress'` (under role postgres) → as U1 the call raises `not_editable`; reset to scheduled.
  4. Insert a standby participant (`is_standby=true`) for ev; as U1 call with `allow_standby=false` (or `standby_spots=0`) → raises `standby_below_roster`.
  5. Standalone: insert a standalone scheduled event `ev2` (group_id=null, is_private=true, organizer U1); as U1 call `update_event(ev2, …'is_private',false…)` → succeeds but `events.is_private` for ev2 is still **true** (forced).
  6. End `raise notice 'OK update_event';` rollback.

- [ ] **Step 4: Run** — `docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/update_event.sql` → `OK update_event`, no PT001.

- [ ] **Step 5: Commit**

```bash
git add infra/supabase/migrations/0078_update_event.sql infra/supabase/tests/update_event.sql
git commit -m "feat(events): update_event RPC (organizer edits a scheduled event) (JM-24)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: types + schema + builder + hook

**Files:**
- Modify: `packages/db/src/database.types.ts`
- Modify: `packages/api/src/schemas.ts`
- Modify: `packages/api/src/client.ts`
- Modify: `packages/api/src/events/mutations.ts`

- [ ] **Step 1: Types** — in `database.types.ts` Functions block add:
  `update_event: { Args: { p_event_id: string; p_payload: Json }; Returns: undefined }`.

- [ ] **Step 2: Schema + builder** — in `packages/api/src/schemas.ts`, after `buildCreateEventPayload`, add the
  `updateEventSchema` from the spec (the editable subset, with the fee `.refine`) + `UpdateEventInput`, and:

```ts
export function buildUpdateEventPayload(input: UpdateEventInput): Record<string, unknown> {
  return {
    name: input.name,
    description: input.description ?? null,
    thumbnail_path: input.thumbnailPath ?? null,
    starts_at: input.startsAt,
    duration_minutes: input.durationMinutes,
    scoring_mode: input.scoringMode,
    scoring_value: input.scoringValue,
    allow_standby: input.allowStandby,
    standby_spots: input.standbySpots ?? null,
    is_private: input.isPrivate,
    entrance_fee_enabled: input.entranceFee.enabled,
    entrance_fee_amount: input.entranceFee.amount ?? null,
    entrance_fee_method: input.entranceFee.method ?? null,
    entrance_fee_mba_number: input.entranceFee.mbaNumber ?? null,
    players_submit_results: input.playersSubmitResults,
    organizer_role: input.organizerRole,
  };
}
```

- [ ] **Step 3: mapPgError** — in `packages/api/src/client.ts`, add `'not_editable'` and `'standby_below_roster'`
  to the `KNOWN` allow-list (`forbidden`/`event_not_found` already present).

- [ ] **Step 4: Hook** — in `packages/api/src/events/mutations.ts` add:

```ts
export const useUpdateEvent = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { values: UpdateEventInput; groupId: string | null }) => {
      const { error } = await db.rpc('update_event', {
        p_event_id: eventId,
        p_payload: buildUpdateEventPayload(input.values) as Json,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: qk.event(eventId) });
      qc.invalidateQueries({ queryKey: qk.myEvents('all') });
      qc.invalidateQueries({ queryKey: qk.myEvents('organizing') });
      if (input.groupId) qc.invalidateQueries({ queryKey: qk.events(input.groupId) });
    },
  });
};
```
Import `buildUpdateEventPayload, type UpdateEventInput` from `../schemas` (alongside the existing
`buildCreateEventPayload` import).

- [ ] **Step 5: Typecheck + test + commit** — `pnpm -w typecheck` (13/13), `pnpm --filter @padel/api test`.
  Confirm `index.ts` wildcard-exports `./schemas` + `./events/mutations` (they do). Then:
```bash
git add packages/db/src/database.types.ts packages/api/src/schemas.ts packages/api/src/client.ts packages/api/src/events/mutations.ts
git commit -m "feat(api): updateEventSchema + buildUpdateEventPayload + useUpdateEvent (JM-24)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Edit screen + manage entry + i18n

**Files:**
- Create: `apps/mobile/app/event/[id]/edit.tsx`
- Modify: `apps/mobile/app/event/[id]/manage.tsx`
- Modify: `apps/mobile/lib/i18n-mobile.ts`

- [ ] **Step 1: i18n** — in `mobileEvent.en` add: `editEventCta: 'Edit event'`, `editTitle: 'Edit event'`,
  `editDetailsSection: 'Details'`, `editNameLabel: 'Name'`, `editDescriptionLabel: 'Description'`,
  `editDateTimeSection: 'Date & time'`, `saveCta: 'Save changes'`, `not_editable: 'This event can no longer be edited.'`,
  `standby_below_roster: "Can't reduce standby below the current standby players."`, `name_required: 'A name is required.'`,
  `fee_requires_amount_and_method: 'Add a fee amount and method.'`. (Scoring/preferences field labels —
  `standbyLabel`, `privateLabel`, `feeLabel`, `organizerRoleLabel`, etc. — already exist from the wizard; the
  reused step components use them.)

- [ ] **Step 2: Create `edit.tsx`** — READ `apps/mobile/components/event/wizard/draft.ts` for the exact
  `EventDraft` type + `WizardStepProps`, and the reusable `DateTimePicker`/`Stepper` prop shapes. Build the
  screen seeding an `EventDraft`-shaped state from `useEvent(id)` and reusing the in-scope step components:

```tsx
import { updateEventSchema, useEvent, useUpdateEvent, type UpdateEventInput } from '@padel/api';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateTimePicker } from '@/components/event/wizard/DateTimePicker';
import { Stepper } from '@/components/event/wizard/Stepper';
import { Step4Scoring } from '@/components/event/wizard/steps/Step4Scoring';
import { Step8Preferences } from '@/components/event/wizard/steps/Step8Preferences';
import type { EventDraft } from '@/components/event/wizard/draft';

export default function EditEventScreen() {
  const { t } = useT('event');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: event, isLoading } = useEvent(id);
  const update = useUpdateEvent(id);

  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Seed the draft once from the event row (covers every field the reused steps read).
  const seeded = useMemo<EventDraft | null>(() => {
    if (!event) return null;
    return {
      groupId: event.group_id,
      eventType: event.event_type,
      specification: event.specification,
      scoringMode: event.scoring_mode,
      scoringValue: event.scoring_value,
      numCourts: event.num_courts,
      startsAt: event.starts_at,
      durationMinutes: event.duration_minutes,
      allowStandby: event.allow_standby,
      standbySpots: event.standby_spots ?? undefined,
      isPrivate: event.is_private,
      entranceFee: {
        enabled: event.entrance_fee_enabled,
        amount: event.entrance_fee_amount ?? undefined,
        method: event.entrance_fee_method ?? undefined,
        mbaNumber: event.entrance_fee_mba_number ?? undefined,
      },
      playersSubmitResults: event.players_submit_results,
      organizerRole: event.organizer_role,
      name: event.name,
      description: event.description ?? '',
      thumbnailPath: event.thumbnail_path ?? undefined,
    } as EventDraft;
  }, [event]);

  const d = draft ?? seeded;
  const patch = (partial: Partial<EventDraft>) => setDraft((prev) => ({ ...(prev ?? seeded!), ...partial }));

  if (isLoading || !d) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color="#0B1F3A" />
      </SafeAreaView>
    );
  }

  const onSave = () => {
    const parsed = updateEventSchema.safeParse({
      name: d.name,
      description: d.description?.trim() ? d.description : undefined,
      thumbnailPath: d.thumbnailPath,
      startsAt: d.startsAt,
      durationMinutes: d.durationMinutes,
      scoringMode: d.scoringMode,
      scoringValue: d.scoringValue,
      allowStandby: d.allowStandby,
      standbySpots: d.standbySpots,
      isPrivate: d.isPrivate,
      entranceFee: d.entranceFee,
      playersSubmitResults: d.playersSubmitResults,
      organizerRole: d.organizerRole,
    });
    if (!parsed.success) {
      setError(t(parsed.error.issues[0]?.message ?? 'name_required'));
      return;
    }
    setBusy(true);
    setError(null);
    update
      .mutateAsync({ values: parsed.data as UpdateEventInput, groupId: event!.group_id })
      .then(() => router.back())
      .catch((e) => setError(t(e instanceof Error ? e.message : 'unknown_error')))
      .finally(() => setBusy(false));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={12}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.topTitle}>{t('editTitle')}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Details */}
        <Text style={styles.section}>{t('editDetailsSection')}</Text>
        <Text style={styles.label}>{t('editNameLabel')}</Text>
        <TextInput style={styles.input} value={d.name} onChangeText={(name) => patch({ name })} maxLength={80} />
        <Text style={styles.label}>{t('editDescriptionLabel')}</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={d.description ?? ''}
          onChangeText={(description) => patch({ description })}
          maxLength={500}
          multiline
        />

        {/* Date & time */}
        <Text style={styles.section}>{t('editDateTimeSection')}</Text>
        <DateTimePicker value={d.startsAt} onChange={(startsAt) => patch({ startsAt })} />
        <Stepper
          label={t('durationLabel')}
          value={d.durationMinutes}
          onChange={(durationMinutes) => patch({ durationMinutes })}
          min={30}
          max={240}
          step={15}
        />

        {/* Scoring + Preferences (reused wizard steps) */}
        <Step4Scoring draft={d} patch={patch} />
        <Step8Preferences draft={d} patch={patch} />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={[styles.btn, busy && styles.btnDisabled]} disabled={busy} onPress={onSave} accessibilityRole="button">
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{t('saveCta')}</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6FA' },
  center: { alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#fff' },
  back: { fontSize: 32, color: '#0B1F3A', lineHeight: 32, width: 32 },
  topTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#0B1F3A', textAlign: 'center' },
  content: { padding: 16, gap: 16 },
  section: { fontSize: 13, fontWeight: '700', color: '#8A95A5', textTransform: 'uppercase', marginTop: 8 },
  label: { fontSize: 14, fontWeight: '600', color: '#0B1F3A' },
  input: { borderWidth: 1, borderColor: '#E6EAF0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: '#0B1F3A', backgroundColor: '#fff' },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  error: { color: '#D7263D', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  btn: { minHeight: 50, borderRadius: 12, backgroundColor: '#0B7BFF', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
```

If the reused `Step4Scoring`/`Step8Preferences` props differ from `{ draft, patch }` (check
`WizardStepProps` in `draft.ts`), adapt the call accordingly. If `EventDraft` field names differ from the
above (read `draft.ts`), use the real names. The screen relies on `Step8Preferences` already disabling the
private toggle for standalone (`draft.groupId === null`) — confirmed in that component.

- [ ] **Step 3: Manage entry** — in `apps/mobile/app/event/[id]/manage.tsx`, at the `TODO(Phase 6f)` slot
  (just above the Cancel-event button), add an "Edit event" button shown only when scheduled:
  ```tsx
  {event.status === 'scheduled' ? (
    <View style={styles.section}>
      <Pressable style={[styles.btn, styles.secondaryBtn]} accessibilityRole="button" onPress={() => router.push(`/event/${id}/edit` as never)}>
        <Text style={styles.secondaryLabel}>{t('editEventCta')}</Text>
      </Pressable>
    </View>
  ) : null}
  ```
  Update the comment to `{/* TODO(Phase 6f): edit Location & Courts (deferred). */}`. (Event routing is
  file-based — `edit.tsx` auto-registers.)

- [ ] **Step 4: Typecheck + commit** — `pnpm -w typecheck` (13/13). Then:
```bash
git add "apps/mobile/app/event/[id]/edit.tsx" "apps/mobile/app/event/[id]/manage.tsx" apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(events): edit-event screen + manage entry (JM-24)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verification (whole slice)

1. **DB:** `db reset` clean; `psql < infra/supabase/tests/update_event.sql` → `OK update_event`.
2. **Types/API:** `pnpm -w typecheck` 13/13; `pnpm --filter @padel/api test`.
3. **App smoke (simulator):** Manage on a scheduled event → "Edit event" → change name/time/scoring/
   preferences → Save → detail reflects it; the Edit button is hidden once the event is in progress/completed;
   standby can't be lowered below the current standby roster (inline error).

## Notes for the implementer

- **Reuse, don't rebuild:** `Step4Scoring` + `Step8Preferences` + `DateTimePicker` + `Stepper` are
  `{draft, patch}`/simple-prop components — render them directly. Do NOT reuse `Step7Schedule` (its
  recurrence toggle is out of scope) or `Step9Details` (thumbnail picker is out of scope) — the screen builds
  its own Details + Date/Time sections. `thumbnail_path` is passed through unchanged (no picker).
- `event_type`/`specification`/`num_courts`/location/`group_id`/`series` are immutable here — `update_event`
  never writes them and the screen never edits them.
- Migration `0078`; no new dependency.
