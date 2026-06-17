# Phase 5G-4 (Send Blast) + 5G-5 (CSV Export) — Design

*Padel Jam • 2026-06-17 • Brainstormed design / spec*

## Goal

Two Manage-hub features, built together on one branch:
- **5G-4 Send blast (JM-41–45):** an in-app "Send a blast" composer for events that belong to a
  community, tier-gated (Starter = read-only default template; Basic/Pro = customizable). Sending
  **records an `event_blasts` row** with a computed `sent_to_count`; external delivery is deferred.
- **5G-5 CSV export (JM-46/47):** an "Export attendance (CSV)" action on the Manage screen that builds the
  roster CSV client-side and opens the native share sheet. The "email me the CSV" option is deferred.

## Scope decisions (from the brainstorm)

1. **External delivery deferred** (Phase 5 decision #3): `send_event_blast` computes `sent_to_count` and
   inserts the row; it does NOT email/WhatsApp anyone.
2. **Blast image: deferred upload** — the blast carries the chosen template's `image_path`; no custom image
   file-picker/upload. Title + description + channels remain editable on Basic/Pro.
3. **CSV: Download-only** — `expo-sharing` native share sheet. "Send CSV to my email" (needs an email edge
   function + SMTP/Resend) is deferred. With one option, the export is a direct action (no pick-one sheet).
4. `sent_to_count` reflects members who have opted **in** to a selected channel; since `user_settings`
   defaults email/WhatsApp to `false`, counts are realistically low until members opt in (correct JM-44
   behavior).

## Verified context

- Highest migration is `0071`; blast uses **`0072`** (CSV needs no migration).
- Tier model: `community_plan(c) → 'starter'|'basic'|'community_pro'` ([0014_entitlement_fns.sql:1](../../../infra/supabase/migrations/0014_entitlement_fns.sql#L1));
  `community_has_feature(c, 'custom_broadcasts')` is true for basic/pro, false for starter
  ([0013_seed_plans.sql:31](../../../infra/supabase/migrations/0013_seed_plans.sql#L31)).
- `user_settings(notifications_email, notifications_whatsapp)` default **false**
  ([0057_user_settings.sql](../../../infra/supabase/migrations/0057_user_settings.sql)).
- `event_group_community(e) → community_id` ([0044_events_helpers_rls.sql:32](../../../infra/supabase/migrations/0044_events_helpers_rls.sql#L32));
  `is_event_organizer(e, u)` exists. Standalone events have `group_id = null`.
- `useEventParticipants` returns per row: `status, is_standby, joined_at, confirmed_at, has_paid, paid_at,
  user_id, guest_name, profiles.full_name` ([packages/api/src/events/queries.ts](../../../packages/api/src/events/queries.ts)).
  Fee is flat on the event: `events.entrance_fee_enabled` + `entrance_fee_amount`.
- `expo-file-system`, `expo-sharing`, `expo-clipboard` are installed (share pattern in
  [created.tsx:67](../../../apps/mobile/app/(tabs)/community/created.tsx#L67)).
- `@padel/utils` has vitest (`phone.test.ts`, `eventDeadlines.test.ts`).
- `manage.tsx` is organizer-only; bottom has Activity-log + Duplicate buttons — the entry points slot there.
- **No** existing blast UI/code anywhere; **no** email infra (no SMTP/Resend in `config.toml`).

---

## 5G-4 — Send Blast

### Migration `0072_event_blasts.sql`

```sql
create table blast_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  image_path text not null,
  category text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table blast_templates enable row level security;
create policy "blast_templates: read" on blast_templates for select
  using (auth.uid() is not null and is_active);
-- no client write policy (curated by service role / seed)

create table event_blasts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  source_template_id uuid references blast_templates(id),
  title text not null,
  description text not null,
  image_path text,
  channels text[] not null,
  send_to text not null default 'all_members' check (send_to in ('all_members')),
  sent_to_count integer not null,
  sent_at timestamptz not null default now()
);
create index event_blasts_event_idx on event_blasts(event_id, sent_at desc);
alter table event_blasts enable row level security;
create policy "event_blasts: read" on event_blasts for select
  using (is_event_organizer(event_id, auth.uid()));
-- inserts only via send_event_blast (SECURITY DEFINER)

-- Seed generic system templates (image_path is a placeholder asset key; the UI renders a styled card).
insert into blast_templates (title, description, image_path, category, is_default) values
  ('Event reminder', 'Don''t forget — our event is coming up. See you on court!', 'templates/reminder.png', 'reminder', true),
  ('Last call', 'A few spots are still open. Grab yours before it fills up!', 'templates/lastcall.png', 'reminder', false),
  ('Results are in', 'Great games today — check out the final standings in the app.', 'templates/recap.png', 'recap', false);

create or replace function can_customize_blast(p_event_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select event_group_community(p_event_id) is not null
     and community_has_feature(event_group_community(p_event_id), 'custom_broadcasts');
$$;

create or replace function send_event_blast(
  p_event_id uuid, p_source_template_id uuid, p_title text, p_description text,
  p_image_path text, p_channels text[]
) returns integer
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_count int; v_ch text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  if event_group_community(p_event_id) is null then raise exception 'no_community' using errcode='P0001'; end if;
  if coalesce(array_length(p_channels,1),0) = 0 then raise exception 'channels_required' using errcode='P0001'; end if;
  foreach v_ch in array p_channels loop
    if v_ch not in ('email','whatsapp') then raise exception 'invalid_channel' using errcode='P0001'; end if;
  end loop;
  if coalesce(btrim(p_title),'')='' or coalesce(btrim(p_description),'')='' then
    raise exception 'blast_incomplete' using errcode='P0001'; end if;

  -- Count members opted-in to >=1 selected channel (guests have no settings -> skipped; JM-44).
  select count(distinct ep.user_id) into v_count
  from event_participants ep
  join user_settings us on us.user_id = ep.user_id
  where ep.event_id = p_event_id
    and ep.user_id is not null
    and ep.status in ('invited','interested','confirmed','waiting_list')
    and ( ('email' = any(p_channels) and us.notifications_email)
       or ('whatsapp' = any(p_channels) and us.notifications_whatsapp) );

  insert into event_blasts (event_id, sender_id, source_template_id, title, description, image_path, channels, sent_to_count)
  values (p_event_id, v_user, p_source_template_id, btrim(p_title), btrim(p_description),
          p_image_path, p_channels, coalesce(v_count,0));
  return coalesce(v_count,0);
end; $$;

grant execute on function can_customize_blast(uuid), send_event_blast(uuid, uuid, text, text, text, text[]) to authenticated;
```

- `database.types.ts`: hand-add `blast_templates` + `event_blasts` Row types and the two RPCs.
- **SQL test `event_blasts.sql`**: organizer on a community event → `send_event_blast` inserts a row and
  `sent_to_count` counts only opted-in members (toggle a `user_settings` row to verify); a standalone event
  → `no_community`; empty channels → `channels_required`; a non-organizer → `forbidden`; read visibility =
  organizer only. `can_customize_blast` true for a basic/pro community, false for starter. `PT001`/`OK`.

### `@padel/api`

- `qk`: `blastTemplates: ['blast-templates']`, `eventBlasts: (id) => ['event', id, 'blasts']`,
  `canCustomizeBlast: (id) => ['event', id, 'can-customize-blast']`.
- `useBlastTemplates()` — `blast_templates` where `is_active`, ordered `is_default desc, created_at`.
- `useEventBlasts(eventId)` — `event_blasts` for the event, newest first.
- `useCanCustomizeBlast(eventId)` — `rpc('can_customize_blast')`.
- `useSendBlast(eventId)` — `rpc('send_event_blast', …)`, returns `sent_to_count`; invalidates
  `qk.eventBlasts(eventId)`.
- `blastSchema` (zod): `title` trim 1–80, `description` trim 1–1000, `channels` non-empty array of
  `'email'|'whatsapp'`.

### Mobile

- **`manage.tsx`**: a "Send a blast" button (near Activity-log), rendered only when `event.group_id != null`
  (standalone hidden, JM-41) → `router.push('/event/${id}/blast')`.
- **New `apps/mobile/app/event/[id]/blast.tsx`**:
  - `useCanCustomizeBlast(id)`.
  - **Customizable (basic/pro):** a Templates/Your-blasts segmented toggle. Templates = grid from
    `useBlastTemplates` (styled card: title + description preview); Your blasts = `useEventBlasts` rows
    (title, sent date, `sent_to_count`). Selecting either opens the **Customize modal** (prefilled
    title/description, editable; channel checkboxes Email/WhatsApp ≥1; Send-to = All members read-only) →
    `useSendBlast` with `source_template_id` + the template's `image_path`.
  - **Starter:** the default template (`is_default`) rendered read-only (title/description labels) + channel
    checkboxes → Send with that template's id/title/description/image_path.
  - On success → a "Blast sent" state showing `t('blastSentBody', { count })`.
- **i18n** (`event` namespace): `sendBlastCta`, `blastTemplatesTab`, `blastYourBlastsTab`, `blastYourEmpty`,
  `blastCustomizeTitle`, `blastTitleLabel`, `blastDescLabel`, `blastChannelEmail`, `blastChannelWhatsapp`,
  `blastSendToLabel`, `blastSendToAll`, `blastSendCta`, `blastSentTitle`, `blastSentBody` ("Recorded for
  {{count}} members."), `blastChannelsRequired`, plus error keys `no_community`/`channels_required`/
  `blast_incomplete` mapped in `mapPgError`'s allow-list.

---

## 5G-5 — CSV Export

### `@padel/utils/rosterCsv.ts` (vitest-tested)

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
export interface CsvEvent { entrance_fee_enabled: boolean; entrance_fee_amount: number | null; }

export function buildRosterCsv(participants: CsvParticipant[], event: CsvEvent): string;
```

- Header: `name,user_type,status,is_standby,joined_at,confirmed_at,has_paid,paid_at,fee_amount`.
- Per row: `name = profiles.full_name ?? guest_name ?? ''`; `user_type = user_id ? 'member' : 'manual'`;
  booleans as `true`/`false`; nulls as empty; `fee_amount = event.entrance_fee_enabled ?
  (entrance_fee_amount ?? 0) : 0`. **No email/mobile** (JM-47).
- CSV-escape: wrap a field in double quotes and double internal quotes if it contains `,` `"` or a newline.
- Unit tests: a member + a guest row, fee on/off, escaping a name with a comma/quote, null timestamps.
- Export from the package index.

A filename helper too: `rosterCsvFilename(eventName, isoDate) → '{slug}-{yyyy-MM-dd}.csv'` (slugify name).

### Mobile

- **`manage.tsx`**: an **"Export attendance (CSV)"** button (near Duplicate). On press:
  `const csv = buildRosterCsv(participants, event)` → `FileSystem.writeAsStringAsync(documentDirectory +
  filename, csv)` → `Sharing.shareAsync(uri, { mimeType: 'text/csv' })` (guarded by
  `Sharing.isAvailableAsync()`; fallback `Clipboard.setStringAsync(csv)`), wrapped in the existing `run()`
  error handler. i18n: `exportCsvCta`, `exportUnavailable`.

---

## Error handling

- `send_event_blast` raises `forbidden`/`no_community`/`channels_required`/`invalid_channel`/
  `blast_incomplete` (P0001), surfaced via `mapPgError` + the screen's error UI.
- CSV: `Sharing.isAvailableAsync()` false → copy to clipboard + notice; build/write failure → `run()` Alert.
- Blast entry point hidden on standalone events; the RPC re-checks `no_community` as defense.

## Testing

- **DB:** `db reset` clean; `event_blasts.sql` → `OK event_blasts`.
- **Types/API:** `pnpm -w typecheck` (13/13); `pnpm --filter @padel/api test`; `pnpm --filter @padel/utils
  test` (rosterCsv).
- **App smoke (simulator):** on a community event as organizer — open Send a blast (basic/pro: tabs +
  customize modal; starter: read-only) → send → "Blast sent" with count; standalone event hides the entry
  point. Export attendance (CSV) → native share sheet with a `text/csv` file.

## Explicitly out of scope

Custom blast image upload; "Send CSV to my email" (email edge function + SMTP/Resend); actual blast
delivery; blast quick-action on the event-detail screen; Share / Add-to-calendar / Cancel action rows (6f);
PT/PT-BR copy (English-only `event` namespace).

## Conventions followed

Additive migration `0072`; RPCs `security definer set search_path = public` + grants; SQL test `PT001`/`OK`;
hand-edited `database.types.ts`; thin `@padel/api` hooks + `qk` + a zod schema; pure CSV logic in
`@padel/utils` with vitest (mirrors `eventDeadlines`); `useT('event')`; reuse
`community_plan`/`community_has_feature`/`event_group_community`/`is_event_organizer`, the `run()` wrapper,
and the `expo-sharing` pattern.
