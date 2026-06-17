# Phase 5G-4 (Send Blast) + 5G-5 (CSV Export) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app tier-gated "Send a blast" composer (records an `event_blasts` row; no external delivery) and an "Export attendance (CSV)" action, both on the Manage screen of an event.

**Architecture:** 5G-4 adds `blast_templates` + `event_blasts` tables, a `send_event_blast` RPC (computes opt-in `sent_to_count`) and `can_customize_blast`, thin `@padel/api` hooks, and a `blast.tsx` screen branched by tier. 5G-5 is a vitest-tested `buildRosterCsv` util in `@padel/utils` plus a Manage button that writes the CSV and opens the native share sheet. One feature branch.

**Tech Stack:** Postgres/Supabase, TanStack Query, zod, React Native / Expo Router, expo-file-system, expo-sharing, vitest.

Spec: `docs/superpowers/specs/2026-06-17-phase5g45-blast-csv-design.md`.

---

### Task 1: Migration `0072_event_blasts.sql` + SQL test

**Files:**
- Create: `infra/supabase/migrations/0072_event_blasts.sql`
- Create: `infra/supabase/tests/event_blasts.sql`

- [ ] **Step 1: Write the migration**

Create `infra/supabase/migrations/0072_event_blasts.sql` with the exact SQL from the spec's "Migration
`0072_event_blasts.sql`" section: the `blast_templates` table + read RLS + 3 seed rows; the `event_blasts`
table + index + organizer-read RLS; `can_customize_blast(p_event_id)`; `send_event_blast(p_event_id,
p_source_template_id, p_title, p_description, p_image_path, p_channels)`; and the grants. Confirm
`community_has_feature(c uuid, key text)` and `event_group_community(e uuid)` exist (grep
`infra/supabase/migrations/0014_entitlement_fns.sql` and `0044_events_helpers_rls.sql`).

- [ ] **Step 2: Apply the migration**

Run: `export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token && pnpm dlx supabase@latest --workdir infra db reset`
Expected: applies through `0072` with no errors (seed rows inserted).

- [ ] **Step 3: Write the SQL test**

Create `infra/supabase/tests/event_blasts.sql` (template: `infra/supabase/tests/event_activity.sql` for the
auth-switch + `PT001` pattern; seed event + community under role `postgres`). Setup:
- Seed organizer U1 + non-organizer U2 + a third member M1 (all in `auth.users` + `profiles`).
- As U1, `create_community_with_personal_tenant('BlastC','club','PT','public')` → `cid` (U1 = owner). Insert
  a `groups` row `g` (community_id=cid) and a team-or-rotation event `ev` (group_id=g, organizer U1, all
  NOT-NULL cols from `0040`, `specification='classic'`, status='scheduled').
- Insert `event_participants` for M1 (status='confirmed') and an `user_settings` row for M1 with
  `notifications_email=true, notifications_whatsapp=false`.
- Insert a **standalone** event `ev2` (group_id=null, is_private=true, organizer U1).

Assertions (`raise notice 'OK …'`; failures `PT001`), run as U1 unless noted:
1. `select send_event_blast(ev, null, 'Hi', 'Body', null, array['email'])` → returns `1` (M1 opted in to
   email) and inserts one `event_blasts` row for `ev`.
2. `select send_event_blast(ev, null, 'Hi', 'Body', null, array['whatsapp'])` → returns `0` (M1 opted out of
   whatsapp).
3. `send_event_blast(ev2, null, 'Hi', 'Body', null, array['email'])` → raises `no_community`.
4. `send_event_blast(ev, null, 'Hi', 'Body', null, array[]::text[])` → raises `channels_required`.
5. As U2 (non-organizer jwt): `send_event_blast(ev, null, 'Hi', 'Body', null, array['email'])` → raises
   `forbidden` (nested begin/exception + sqlerrm check).
6. Read visibility: as U2, `select count(*) from event_blasts where event_id=ev` = 0; as U1, ≥ 1.
7. `can_customize_blast(ev)` — for the seeded `club`/`starter` plan, assert it returns a boolean without
   error (its value depends on the seeded plan's `custom_broadcasts` feature; assert `is not null`). Then,
   to verify the true path, insert a `community_subscriptions` row for `cid` with `plan_id='community_pro'`
   (status='active') and assert `can_customize_blast(ev)` = true.
8. End `raise notice 'OK event_blasts';` then `rollback;`.

- [ ] **Step 4: Run the SQL test**

Run: `docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/event_blasts.sql`
Expected: `OK event_blasts`, no `PT001`, no error.

- [ ] **Step 5: Commit**

```bash
git add infra/supabase/migrations/0072_event_blasts.sql infra/supabase/tests/event_blasts.sql
git commit -m "feat(events): event_blasts + blast_templates + send_event_blast RPC (5G-4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Types + query keys + blastSchema + API hooks

**Files:**
- Modify: `packages/db/src/database.types.ts`
- Modify: `packages/api/src/query-keys.ts`
- Modify: `packages/api/src/schemas.ts`
- Modify: `packages/api/src/client.ts` (mapPgError allow-list)
- Modify: `packages/api/src/events/queries.ts`
- Modify: `packages/api/src/events/mutations.ts`

- [ ] **Step 1: Hand-add types**

In `packages/db/src/database.types.ts`:
- Add `blast_templates` Row (`id, title, description, image_path, category: string | null, is_default,
  is_active, created_at`) + Insert/Update, no relationships.
- Add `event_blasts` Row (`id, event_id, sender_id, source_template_id: string | null, title, description,
  image_path: string | null, channels: string[], send_to, sent_to_count, sent_at`) + Insert/Update +
  Relationships (`event_id→events`, `sender_id→profiles`, `source_template_id→blast_templates`).
- Functions: `can_customize_blast: { Args: { p_event_id: string }; Returns: boolean }` and
  `send_event_blast: { Args: { p_event_id: string; p_source_template_id: string | null; p_title: string; p_description: string; p_image_path: string | null; p_channels: string[] }; Returns: number }`.

- [ ] **Step 2: Query keys**

In `packages/api/src/query-keys.ts`, add:

```ts
  blastTemplates: ['blast-templates'] as const,
  eventBlasts: (id: string) => ['event', id, 'blasts'] as const,
  canCustomizeBlast: (id: string) => ['event', id, 'can-customize-blast'] as const,
```

- [ ] **Step 3: blastSchema**

In `packages/api/src/schemas.ts`, add:

```ts
export const BLAST_CHANNELS = ['email', 'whatsapp'] as const;
export const blastSchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(1000),
  channels: z.array(z.enum(BLAST_CHANNELS)).min(1),
});
export type BlastInput = z.infer<typeof blastSchema>;
```

- [ ] **Step 4: mapPgError allow-list**

In `packages/api/src/client.ts`, add `'no_community'`, `'channels_required'`, `'invalid_channel'`,
`'blast_incomplete'` to the `KNOWN` array (the same array 5F/5G-2 extended).

- [ ] **Step 5: Query hooks**

In `packages/api/src/events/queries.ts`, add:

```ts
export interface BlastTemplate {
  id: string;
  title: string;
  description: string;
  image_path: string;
  category: string | null;
  is_default: boolean;
}
export interface EventBlast {
  id: string;
  title: string;
  description: string;
  channels: string[];
  sent_to_count: number;
  sent_at: string;
  source_template_id: string | null;
  image_path: string | null;
}

export const useBlastTemplates = () => {
  const db = useDb();
  return useQuery({
    queryKey: qk.blastTemplates,
    queryFn: async () => {
      const { data, error } = await db
        .from('blast_templates')
        .select('id, title, description, image_path, category, is_default')
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })
        .returns<BlastTemplate[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
};

export const useEventBlasts = (eventId: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.eventBlasts(eventId),
    queryFn: async () => {
      const { data, error } = await db
        .from('event_blasts')
        .select('id, title, description, channels, sent_to_count, sent_at, source_template_id, image_path')
        .eq('event_id', eventId)
        .order('sent_at', { ascending: false })
        .returns<EventBlast[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
};

export const useCanCustomizeBlast = (eventId: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.canCustomizeBlast(eventId),
    queryFn: async () => {
      const { data, error } = await db.rpc('can_customize_blast', { p_event_id: eventId });
      if (error) throw error;
      return data ?? false;
    },
  });
};
```

- [ ] **Step 6: Send mutation**

In `packages/api/src/events/mutations.ts`, add:

```ts
export const useSendBlast = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      sourceTemplateId: string | null;
      title: string;
      description: string;
      imagePath: string | null;
      channels: ('email' | 'whatsapp')[];
    }) => {
      const { data, error } = await db.rpc('send_event_blast', {
        p_event_id: eventId,
        p_source_template_id: input.sourceTemplateId,
        p_title: input.title,
        p_description: input.description,
        p_image_path: input.imagePath,
        p_channels: input.channels,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      return data as number;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.eventBlasts(eventId) });
    },
  });
};
```

- [ ] **Step 7: Typecheck + test**

Run: `pnpm -w typecheck` (13/13) and `pnpm --filter @padel/api test`. Confirm `packages/api/src/index.ts`
wildcard-exports `./events/queries`, `./events/mutations`, `./schemas` (it does) so the new symbols export.

- [ ] **Step 8: Commit**

```bash
git add packages/db/src/database.types.ts packages/api/src/query-keys.ts packages/api/src/schemas.ts packages/api/src/client.ts packages/api/src/events/queries.ts packages/api/src/events/mutations.ts
git commit -m "feat(api): blast templates/blasts queries, send mutation, blastSchema (5G-4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Blast screen + manage entry + i18n

**Files:**
- Create: `apps/mobile/app/event/[id]/blast.tsx`
- Modify: `apps/mobile/app/event/[id]/manage.tsx`
- Modify: `apps/mobile/lib/i18n-mobile.ts`

- [ ] **Step 1: i18n keys**

In `apps/mobile/lib/i18n-mobile.ts`, `mobileEvent.en`, add:

```ts
    sendBlastCta: 'Send a blast',
    blastTitle: 'Send a blast',
    blastTemplatesTab: 'Templates',
    blastYourBlastsTab: 'Your blasts',
    blastYourEmpty: "You haven't sent any blasts yet. Pick a template to start.",
    blastCustomizeTitle: 'Customize blast',
    blastTitleLabel: 'Title',
    blastDescLabel: 'Message',
    blastChannelEmail: 'Email',
    blastChannelWhatsapp: 'WhatsApp',
    blastSendToLabel: 'Send to',
    blastSendToAll: 'All members',
    blastSendCta: 'Send blast',
    blastSentTitle: 'Blast sent',
    blastSentBody: 'Recorded for {{count}} members.',
    blastChannelsRequired: 'Pick at least one channel.',
    no_community: 'Blasts are only available on community events.',
    channels_required: 'Pick at least one channel.',
    blast_incomplete: 'Add a title and message.',
```

- [ ] **Step 2: Create `blast.tsx`**

Create `apps/mobile/app/event/[id]/blast.tsx`:

```tsx
import {
  blastSchema,
  useBlastTemplates,
  useCanCustomizeBlast,
  useEventBlasts,
  useSendBlast,
  type BlastTemplate,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Channel = 'email' | 'whatsapp';

export default function BlastScreen() {
  const { t } = useT('event');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: canCustomize, isLoading: loadingTier } = useCanCustomizeBlast(id);
  const { data: templates } = useBlastTemplates();
  const { data: yourBlasts } = useEventBlasts(id);
  const sendBlast = useSendBlast(id);

  const [tab, setTab] = useState<'templates' | 'yours'>('templates');
  const [editing, setEditing] = useState<{ template: BlastTemplate | null; title: string; description: string } | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleChannel = (c: Channel) =>
    setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const defaultTemplate = (templates ?? []).find((tpl) => tpl.is_default) ?? (templates ?? [])[0] ?? null;

  const openCustomize = (tpl: BlastTemplate) => {
    setEditing({ template: tpl, title: tpl.title, description: tpl.description });
    setChannels([]);
    setError(null);
  };

  const submit = async (args: {
    template: BlastTemplate | null;
    title: string;
    description: string;
  }) => {
    const parsed = blastSchema.safeParse({ title: args.title, description: args.description, channels });
    if (!parsed.success) {
      setError(t('blastChannelsRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const count = await sendBlast.mutateAsync({
        sourceTemplateId: args.template?.id ?? null,
        title: parsed.data.title,
        description: parsed.data.description,
        imagePath: args.template?.image_path ?? null,
        channels: parsed.data.channels,
      });
      setEditing(null);
      setSentCount(count);
    } catch (e) {
      setError(t(e instanceof Error ? e.message : 'unknown_error'));
    } finally {
      setBusy(false);
    }
  };

  // --- Sent confirmation ---
  if (sentCount != null) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <View style={styles.sentBox}>
          <Text style={styles.sentTitle}>{t('blastSentTitle')}</Text>
          <Text style={styles.sentBody}>{t('blastSentBody', { count: sentCount })}</Text>
          <Pressable style={[styles.btn, styles.primaryBtn]} onPress={() => router.back()} accessibilityRole="button">
            <Text style={styles.primaryLabel}>{t('back')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (loadingTier) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color="#0B1F3A" />
      </SafeAreaView>
    );
  }

  const channelRow = (
    <View style={styles.channelRow}>
      {(['email', 'whatsapp'] as const).map((c) => (
        <Pressable
          key={c}
          style={[styles.channel, channels.includes(c) ? styles.channelOn : null]}
          onPress={() => toggleChannel(c)}
          accessibilityRole="button"
        >
          <Text style={[styles.channelText, channels.includes(c) ? styles.channelTextOn : null]}>
            {t(c === 'email' ? 'blastChannelEmail' : 'blastChannelWhatsapp')}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={12}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.topTitle}>{t('blastTitle')}</Text>
        <View style={{ width: 32 }} />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!canCustomize ? (
        // --- Starter: read-only default template + channels + send ---
        <ScrollView contentContainerStyle={styles.content}>
          {defaultTemplate ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{defaultTemplate.title}</Text>
              <Text style={styles.cardBody}>{defaultTemplate.description}</Text>
            </View>
          ) : null}
          <Text style={styles.label}>{t('blastSendToLabel')}</Text>
          <Text style={styles.readonly}>{t('blastSendToAll')}</Text>
          {channelRow}
          <Pressable
            style={[styles.btn, styles.primaryBtn, (busy || !defaultTemplate || channels.length === 0) && styles.btnDisabled]}
            disabled={busy || !defaultTemplate || channels.length === 0}
            onPress={() =>
              defaultTemplate &&
              submit({ template: defaultTemplate, title: defaultTemplate.title, description: defaultTemplate.description })
            }
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryLabel}>{t('blastSendCta')}</Text>}
          </Pressable>
        </ScrollView>
      ) : (
        // --- Basic/Pro: tabs + customize modal ---
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.tabs}>
            {(['templates', 'yours'] as const).map((tb) => (
              <Pressable key={tb} style={[styles.tab, tab === tb ? styles.tabOn : null]} onPress={() => setTab(tb)} accessibilityRole="button">
                <Text style={[styles.tabText, tab === tb ? styles.tabTextOn : null]}>
                  {t(tb === 'templates' ? 'blastTemplatesTab' : 'blastYourBlastsTab')}
                </Text>
              </Pressable>
            ))}
          </View>

          {tab === 'templates' ? (
            (templates ?? []).map((tpl) => (
              <Pressable key={tpl.id} style={styles.card} onPress={() => openCustomize(tpl)} accessibilityRole="button">
                <Text style={styles.cardTitle}>{tpl.title}</Text>
                <Text style={styles.cardBody} numberOfLines={2}>{tpl.description}</Text>
              </Pressable>
            ))
          ) : (yourBlasts ?? []).length === 0 ? (
            <Text style={styles.empty}>{t('blastYourEmpty')}</Text>
          ) : (
            (yourBlasts ?? []).map((b) => (
              <Pressable
                key={b.id}
                style={styles.card}
                onPress={() =>
                  setEditing({
                    template: b.source_template_id
                      ? (templates ?? []).find((tp) => tp.id === b.source_template_id) ?? null
                      : null,
                    title: b.title,
                    description: b.description,
                  })
                }
                accessibilityRole="button"
              >
                <Text style={styles.cardTitle}>{b.title}</Text>
                <Text style={styles.cardBody} numberOfLines={1}>{b.description}</Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}

      {/* Customize modal (Basic/Pro) */}
      <Modal visible={editing != null} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t('blastCustomizeTitle')}</Text>
            <Text style={styles.label}>{t('blastTitleLabel')}</Text>
            <TextInput
              style={styles.input}
              value={editing?.title ?? ''}
              maxLength={80}
              onChangeText={(v) => setEditing((s) => (s ? { ...s, title: v } : s))}
            />
            <Text style={styles.label}>{t('blastDescLabel')}</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={editing?.description ?? ''}
              maxLength={1000}
              multiline
              onChangeText={(v) => setEditing((s) => (s ? { ...s, description: v } : s))}
            />
            <Text style={styles.label}>{t('blastSendToLabel')}</Text>
            <Text style={styles.readonly}>{t('blastSendToAll')}</Text>
            {channelRow}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              style={[styles.btn, styles.primaryBtn, busy && styles.btnDisabled]}
              disabled={busy}
              onPress={() => editing && submit(editing)}
              accessibilityRole="button"
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryLabel}>{t('blastSendCta')}</Text>}
            </Pressable>
            <Pressable style={[styles.btn, styles.secondaryBtn]} onPress={() => setEditing(null)} accessibilityRole="button">
              <Text style={styles.secondaryLabel}>{t('cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6FA' },
  center: { alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#fff' },
  back: { fontSize: 32, color: '#0B1F3A', lineHeight: 32, width: 32 },
  topTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#0B1F3A', textAlign: 'center' },
  content: { padding: 16, gap: 12 },
  error: { color: '#D7263D', fontSize: 14, fontWeight: '600', textAlign: 'center', paddingHorizontal: 16, paddingTop: 8 },

  tabs: { flexDirection: 'row', backgroundColor: '#EEF1F6', borderRadius: 10, padding: 3 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabOn: { backgroundColor: '#fff' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#6B7685' },
  tabTextOn: { color: '#0B1F3A' },

  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0B1F3A' },
  cardBody: { fontSize: 14, color: '#6B7685' },
  empty: { fontSize: 15, color: '#6B7685', textAlign: 'center', paddingVertical: 24 },

  label: { fontSize: 13, fontWeight: '700', color: '#8A95A5', textTransform: 'uppercase' },
  readonly: { fontSize: 15, color: '#0B1F3A', fontWeight: '600' },
  channelRow: { flexDirection: 'row', gap: 10 },
  channel: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: '#E6EAF0' },
  channelOn: { backgroundColor: '#0B7BFF', borderColor: '#0B7BFF' },
  channelText: { fontSize: 15, fontWeight: '600', color: '#0B1F3A' },
  channelTextOn: { color: '#fff' },

  input: { minHeight: 48, borderRadius: 12, backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: '#E6EAF0', paddingHorizontal: 14, paddingTop: 12, fontSize: 16, color: '#0B1F3A' },
  inputMulti: { minHeight: 100, textAlignVertical: 'top' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#F4F6FA', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 10, maxHeight: '90%' },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#0B1F3A' },

  sentBox: { paddingHorizontal: 32, alignItems: 'center', gap: 12 },
  sentTitle: { fontSize: 22, fontWeight: '700', color: '#0B1F3A' },
  sentBody: { fontSize: 16, color: '#6B7685', textAlign: 'center' },

  btn: { minHeight: 48, paddingHorizontal: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnDisabled: { opacity: 0.5 },
  primaryBtn: { backgroundColor: '#0B7BFF' },
  primaryLabel: { fontSize: 16, fontWeight: '700', color: '#fff' },
  secondaryBtn: { backgroundColor: '#F0F3F8' },
  secondaryLabel: { fontSize: 16, fontWeight: '600', color: '#0B1F3A' },
});
```

- [ ] **Step 3: Add the manage entry point**

In `apps/mobile/app/event/[id]/manage.tsx`, add a "Send a blast" button (only for community events) in the
section area near the Activity-log button:

```tsx
{event.group_id != null ? (
  <View style={styles.section}>
    <Pressable
      style={[styles.btn, styles.secondaryBtn]}
      accessibilityRole="button"
      onPress={() => router.push(`/event/${id}/blast` as never)}
    >
      <Text style={styles.secondaryLabel}>{t('sendBlastCta')}</Text>
    </Pressable>
  </View>
) : null}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm -w typecheck` (13/13). Confirm `cancel`/`back` exist in `mobileEvent.en` (they do).

- [ ] **Step 5: Commit**

```bash
git add "apps/mobile/app/event/[id]/blast.tsx" "apps/mobile/app/event/[id]/manage.tsx" apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(events): send-blast screen (tier-gated) + manage entry (5G-4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `buildRosterCsv` util (TDD)

**Files:**
- Create: `packages/utils/src/rosterCsv.ts`
- Test: `packages/utils/src/rosterCsv.test.ts`
- Modify: `packages/utils/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/utils/src/rosterCsv.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildRosterCsv, rosterCsvFilename, type CsvParticipant } from './rosterCsv';

const member: CsvParticipant = {
  user_id: 'u1', guest_name: null, status: 'confirmed', is_standby: false,
  joined_at: '2026-06-01T10:00:00Z', confirmed_at: '2026-06-01T11:00:00Z',
  has_paid: true, paid_at: '2026-06-01T12:00:00Z', profiles: { full_name: 'Ana, Silva' },
};
const guest: CsvParticipant = {
  user_id: null, guest_name: 'Bob "B"', status: 'invited', is_standby: true,
  joined_at: '2026-06-02T10:00:00Z', confirmed_at: null,
  has_paid: false, paid_at: null, profiles: null,
};

describe('buildRosterCsv', () => {
  it('emits the header then one row per participant', () => {
    const csv = buildRosterCsv([member], { entrance_fee_enabled: true, entrance_fee_amount: 5 });
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('name,user_type,status,is_standby,joined_at,confirmed_at,has_paid,paid_at,fee_amount');
    expect(lines).toHaveLength(2);
  });
  it('derives user_type and fee, and escapes commas/quotes', () => {
    const csv = buildRosterCsv([member, guest], { entrance_fee_enabled: true, entrance_fee_amount: 5 });
    const rows = csv.trim().split('\n');
    expect(rows[1]).toContain('"Ana, Silva",member,confirmed,false,');
    expect(rows[1]).toContain(',true,2026-06-01T12:00:00Z,5');
    expect(rows[2]).toContain('"Bob ""B""",manual,invited,true,');
    expect(rows[2]).toContain(',false,,5');
  });
  it('uses fee 0 when the event has no entrance fee', () => {
    const csv = buildRosterCsv([member], { entrance_fee_enabled: false, entrance_fee_amount: null });
    expect(csv.trim().split('\n')[1].endsWith(',0')).toBe(true);
  });
});

describe('rosterCsvFilename', () => {
  it('slugifies the event name with the date', () => {
    expect(rosterCsvFilename('Friday Night Padel!', '2026-06-17')).toBe('friday-night-padel-2026-06-17.csv');
  });
});
```

- [ ] **Step 2: Run the test (fails)**

Run: `pnpm --filter @padel/utils test`
Expected: FAIL — `Cannot find module './rosterCsv'`.

- [ ] **Step 3: Implement**

Create `packages/utils/src/rosterCsv.ts`:

```ts
export interface CsvParticipant {
  user_id: string | null;
  guest_name: string | null;
  status: string;
  is_standby: boolean;
  joined_at: string;
  confirmed_at: string | null;
  has_paid: boolean;
  paid_at: string | null;
  profiles: { full_name: string | null } | null;
}
export interface CsvEvent {
  entrance_fee_enabled: boolean;
  entrance_fee_amount: number | null;
}

const HEADER = 'name,user_type,status,is_standby,joined_at,confirmed_at,has_paid,paid_at,fee_amount';

/** Quote a field if it contains a comma, double-quote, or newline; double internal quotes. */
function esc(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Build the attendance/revenue CSV (JM-47). Member email/mobile are intentionally excluded. */
export function buildRosterCsv(participants: CsvParticipant[], event: CsvEvent): string {
  const fee = event.entrance_fee_enabled ? (event.entrance_fee_amount ?? 0) : 0;
  const rows = participants.map((p) => {
    const name = p.profiles?.full_name ?? p.guest_name ?? '';
    const userType = p.user_id ? 'member' : 'manual';
    return [
      esc(name),
      userType,
      p.status,
      String(p.is_standby),
      p.joined_at ?? '',
      p.confirmed_at ?? '',
      String(p.has_paid),
      p.paid_at ?? '',
      String(fee),
    ].join(',');
  });
  return [HEADER, ...rows].join('\n');
}

/** "{slug}-{yyyy-MM-dd}.csv" from an event name + ISO date string (YYYY-MM-DD). */
export function rosterCsvFilename(eventName: string, isoDate: string): string {
  const slug = eventName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'event';
  return `${slug}-${isoDate}.csv`;
}
```

- [ ] **Step 4: Re-export + run tests**

Append to `packages/utils/src/index.ts`: `export * from './rosterCsv';`
Run: `pnpm --filter @padel/utils test` — PASS. Then `pnpm -w typecheck` — PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/utils/src/rosterCsv.ts packages/utils/src/rosterCsv.test.ts packages/utils/src/index.ts
git commit -m "feat(utils): buildRosterCsv attendance/revenue export (5G-5)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: CSV export button on the manage screen

**Files:**
- Modify: `apps/mobile/app/event/[id]/manage.tsx`
- Modify: `apps/mobile/lib/i18n-mobile.ts`

- [ ] **Step 1: i18n keys**

In `mobileEvent.en`, add: `exportCsvCta: 'Export attendance (CSV)'`, `exportUnavailable: 'Sharing is not available; the CSV was copied to your clipboard.'`

- [ ] **Step 2: Add the export handler + button**

In `apps/mobile/app/event/[id]/manage.tsx`:
- Imports (top): `import { buildRosterCsv, rosterCsvFilename } from '@padel/utils';`,
  `import * as FileSystem from 'expo-file-system';`, `import * as Sharing from 'expo-sharing';`,
  `import * as Clipboard from 'expo-clipboard';`
- Add an export handler (near the other `on…` handlers; `run` + `event`/`participants` are in scope):

```tsx
  const onExportCsv = () =>
    run(async () => {
      const csv = buildRosterCsv(participants, {
        entrance_fee_enabled: event.entrance_fee_enabled,
        entrance_fee_amount: event.entrance_fee_amount,
      });
      const filename = rosterCsvFilename(event.name, new Date().toISOString().slice(0, 10));
      const uri = FileSystem.documentDirectory + filename;
      await FileSystem.writeAsStringAsync(uri, csv);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: filename });
      } else {
        await Clipboard.setStringAsync(csv);
        Alert.alert(t('exportUnavailable'));
      }
    });
```

- Add the button in the section area (near Duplicate):

```tsx
  <View style={styles.section}>
    <Pressable style={[styles.btn, styles.secondaryBtn]} accessibilityRole="button" disabled={busy} onPress={onExportCsv}>
      <Text style={styles.secondaryLabel}>{t('exportCsvCta')}</Text>
    </Pressable>
  </View>
```

(`Alert` is already imported in `manage.tsx`.)

- [ ] **Step 3: Typecheck**

Run: `pnpm -w typecheck` (13/13). `expo-file-system`/`expo-sharing`/`expo-clipboard` are already deps.

- [ ] **Step 4: Commit**

```bash
git add "apps/mobile/app/event/[id]/manage.tsx" apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(events): export attendance CSV from manage screen (5G-5)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verification (whole slice)

1. **DB:** `db reset` clean; `psql < infra/supabase/tests/event_blasts.sql` → `OK event_blasts`.
2. **Types/API/utils:** `pnpm -w typecheck` 13/13; `pnpm --filter @padel/api test`; `pnpm --filter @padel/utils test` (rosterCsv).
3. **App smoke (simulator):** on a community event as organizer — "Send a blast" (basic/pro: tabs +
   customize modal; starter: read-only) → send → "Blast sent" with count; standalone event hides the
   button. "Export attendance (CSV)" → native share sheet with a `text/csv` file.

## Notes for the implementer

- Blast `sent_to_count` reflects opted-in members; `user_settings` defaults channels to `false`, so expect
  low/zero counts in fresh data — this is correct (JM-44).
- The blast entry is hidden on standalone events (`event.group_id == null`); the RPC re-checks `no_community`.
- No new npm dependency; migration `0072` (next after `0071`).
- The starter path sends the default template's own title/description (read-only); basic/pro sends edited
  values via the modal. Both carry the template's `image_path`.
