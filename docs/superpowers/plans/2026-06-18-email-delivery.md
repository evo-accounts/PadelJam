# Email Delivery (Resend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email the roster CSV to the organizer (JM-46) and deliver the blast email channel to opted-in members, via Resend.

**Architecture:** Server-side, organizer-gated RPCs (`event_roster_csv`, `blast_email_recipients`) are the source of truth; two Deno edge functions (`send-roster-csv`, `send-blast`) call them as the caller and send via a shared Resend helper. `send_event_blast` is re-created to also return the new blast id so the client can invoke delivery after recording.

**Tech Stack:** Postgres/Supabase RPCs, Supabase Edge Functions (Deno), Resend REST API, TanStack Query, React Native.

Spec: `docs/superpowers/specs/2026-06-18-email-delivery-design.md`.

**Externally-blocked:** real sending needs `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (+ a verified domain). Locally a missing key → graceful 500. Edge functions are Deno (outside `pnpm -w typecheck`) — verified by review + the documented `supabase functions serve` smoke. Automated gates: the SQL tests + `pnpm -w typecheck` + api tests.

---

### Task 1: Migration `0076` — CSV RPC, recipient RPC, blast return + tests

**Files:**
- Create: `infra/supabase/migrations/0076_email_delivery.sql`
- Create: `infra/supabase/tests/email_delivery.sql`
- Modify: `infra/supabase/tests/event_blasts.sql`

- [ ] **Step 1: Write the migration**

Create `infra/supabase/migrations/0076_email_delivery.sql`. Confirm `is_event_organizer(e,u)`,
`event_group_community(e)` exist (used in 0072). Then:

```sql
-- Email-delivery helpers. CSV + recipient list are organizer-gated SECURITY DEFINER (single source of
-- truth; edge functions call these as the caller). send_event_blast re-created to also return the new id.

-- CSV field escaper: quote + double internal quotes when the value has a comma/quote/newline.
create or replace function _csv_field(p text) returns text
language sql immutable as $$
  select case when p ~ '[",\n]' then '"' || replace(p, '"', '""') || '"' else coalesce(p, '') end;
$$;
revoke execute on function _csv_field(text) from public;

-- JM-46/47: organizer-only roster CSV (no member email/mobile). Mirrors @padel/utils buildRosterCsv.
create or replace function event_roster_csv(p_event_id uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_fee numeric; v_body text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  v_fee := case when v_ev.entrance_fee_enabled then coalesce(v_ev.entrance_fee_amount, 0) else 0 end;

  select string_agg(
           _csv_field(coalesce(pr.full_name, ep.guest_name, '')) || ',' ||
           (case when ep.user_id is not null then 'member' else 'manual' end) || ',' ||
           ep.status || ',' || lower(ep.is_standby::text) || ',' ||
           coalesce(ep.joined_at::text,'') || ',' || coalesce(ep.confirmed_at::text,'') || ',' ||
           lower(ep.has_paid::text) || ',' || coalesce(ep.paid_at::text,'') || ',' || v_fee::text,
           E'\n' order by ep.joined_at asc)
    into v_body
  from event_participants ep
  left join profiles pr on pr.id = ep.user_id
  where ep.event_id = p_event_id;

  return 'name,user_type,status,is_standby,joined_at,confirmed_at,has_paid,paid_at,fee_amount'
         || coalesce(E'\n' || v_body, '');
end; $$;

-- Distinct emails of members opted-in to the blast's email channel (organizer-only). Reads auth.users.
create or replace function blast_email_recipients(p_blast_id uuid) returns table (email text)
language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_event uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select event_id into v_event from event_blasts where id = p_blast_id;
  if v_event is null then raise exception 'blast_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(v_event, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;

  return query
  select distinct au.email
  from event_participants ep
  join user_settings us on us.user_id = ep.user_id and us.notifications_email
  join auth.users au on au.id = ep.user_id
  where ep.event_id = v_event
    and ep.user_id is not null
    and ep.status in ('invited','interested','confirmed','waiting_list')
    and au.email is not null;
end; $$;

-- Re-create send_event_blast to ALSO return the new blast id (was: returns integer). Body unchanged
-- except the final RETURN. (Different return type => must DROP first.)
drop function if exists send_event_blast(uuid, uuid, text, text, text, text[]);
create function send_event_blast(
  p_event_id uuid, p_source_template_id uuid, p_title text, p_description text,
  p_image_path text, p_channels text[]
) returns table (blast_id uuid, sent_to_count integer)
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_count int; v_ch text; v_id uuid;
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

  select count(distinct ep.user_id) into v_count
  from event_participants ep
  join user_settings us on us.user_id = ep.user_id
  where ep.event_id = p_event_id and ep.user_id is not null
    and ep.status in ('invited','interested','confirmed','waiting_list')
    and ( ('email' = any(p_channels) and us.notifications_email)
       or ('whatsapp' = any(p_channels) and us.notifications_whatsapp) );

  insert into event_blasts (event_id, sender_id, source_template_id, title, description, image_path, channels, sent_to_count)
  values (p_event_id, v_user, p_source_template_id, btrim(p_title), btrim(p_description),
          p_image_path, p_channels, coalesce(v_count,0))
  returning id into v_id;

  return query select v_id, coalesce(v_count,0);
end; $$;

grant execute on function event_roster_csv(uuid), blast_email_recipients(uuid),
  send_event_blast(uuid, uuid, text, text, text, text[]) to authenticated;
```

- [ ] **Step 2: Apply** — `export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token && pnpm dlx supabase@latest --workdir infra db reset` (clean, through `0076`).

- [ ] **Step 3: SQL test for the new functions**

Create `infra/supabase/tests/email_delivery.sql` (template: `event_blasts.sql`). Seed organizer U1 +
non-organizer U2 + member M1. As U1 `create_community_with_personal_tenant(...)` → cid; reuse the general
group g; insert a completed-or-scheduled event `ev` (group_id=g, organizer U1) + M1 confirmed participant +
an `user_settings` row for M1 with `notifications_email=true`. Assertions:
1. As U1: `select event_roster_csv(ev)` returns text whose first line is the exact header and which contains
   one data row (member, fee column). A name containing a comma is wrapped in quotes (seed a guest via
   `add_manual_participant` or insert with `guest_name='Smith, Jo'` and assert the row contains `"Smith, Jo"`).
2. As U2 (non-organizer jwt): `event_roster_csv(ev)` raises `forbidden`.
3. Record a blast: `select blast_id from send_event_blast(ev, null, 'Hi','Body', null, array['email']) ` →
   capture `v_blast`. As U1: `select count(*) from blast_email_recipients(v_blast)` = 1 (M1 opted-in). As U2:
   `blast_email_recipients(v_blast)` raises `forbidden`.
4. End `raise notice 'OK email_delivery';` rollback.

- [ ] **Step 4: Update `event_blasts.sql` for the new return shape**

In `infra/supabase/tests/event_blasts.sql`, `send_event_blast` now returns a row. Replace the
`select send_event_blast(...)` integer assertions: read the count via
`select sent_to_count into n from send_event_blast(ev, null, 'Hi','Body', null, array['email']);` (and
`array['whatsapp']` → 0). The `forbidden`/`no_community`/`channels_required` raise-assertions are unchanged
(the function still raises before returning). Keep `OK event_blasts`.

- [ ] **Step 5: Run both tests**

```
docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/email_delivery.sql
docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/event_blasts.sql
```
Expected: `OK email_delivery` and `OK event_blasts`, no `PT001`.

- [ ] **Step 6: Commit**

```bash
git add infra/supabase/migrations/0076_email_delivery.sql infra/supabase/tests/email_delivery.sql infra/supabase/tests/event_blasts.sql
git commit -m "feat(delivery): event_roster_csv + blast_email_recipients RPCs; send_event_blast returns id (email delivery)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `database.types.ts`

**Files:**
- Modify: `packages/db/src/database.types.ts`

- [ ] **Step 1: Update the Functions block**

- Replace `send_event_blast`'s Returns: it now returns a set of rows →
  `send_event_blast: { Args: { p_event_id: string; p_source_template_id: string | null; p_title: string; p_description: string; p_image_path: string | null; p_channels: string[] }; Returns: { blast_id: string; sent_to_count: number }[] }`.
- Add `event_roster_csv: { Args: { p_event_id: string }; Returns: string }`.
- Add `blast_email_recipients: { Args: { p_blast_id: string }; Returns: { email: string }[] }`.

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm -w typecheck`. This will surface the `useSendBlast` return-shape mismatch (it does
`return data as number`) — that's fixed in Task 4; if the api package alone must stay green now, you may
temporarily read `data?.[0]?.sent_to_count` in `useSendBlast` here, but it's cleaner to do the full hook
change in Task 4. Either way end Task 2 with the **db package** typechecking; note the expected api/mobile
breakage for Task 4. Commit:
```bash
git add packages/db/src/database.types.ts
git commit -m "feat(db): types for email-delivery RPCs + send_event_blast row return

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Edge functions + config + setup doc

**Files:**
- Create: `infra/supabase/functions/_shared/email.ts`
- Create: `infra/supabase/functions/send-roster-csv/index.ts`
- Create: `infra/supabase/functions/send-blast/index.ts`
- Modify: `infra/supabase/config.toml`, `.env.example`
- Create: `docs/superpowers/email-delivery-setup.md`

- [ ] **Step 1: Shared Resend helper**

Create `infra/supabase/functions/_shared/email.ts`:

```ts
// Thin Resend REST wrapper. RESEND_API_KEY unset -> throws 'email_not_configured' (caller -> 500).
const API = 'https://api.resend.com/emails';

type Attachment = { filename: string; content: string /* base64 */ };
type Mail = { to: string; subject: string; html: string; attachments?: Attachment[] };

function keyOrThrow(): { key: string; from: string } {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM_EMAIL');
  if (!key || !from) throw new Error('email_not_configured');
  return { key, from };
}

export async function sendEmail(mail: Mail): Promise<void> {
  const { key, from } = keyOrThrow();
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: mail.to, subject: mail.subject, html: mail.html, attachments: mail.attachments }),
  });
  if (!res.ok) throw new Error(`resend_failed:${res.status}`);
}

export async function sendBatchEmails(mails: Omit<Mail, 'attachments'>[]): Promise<void> {
  const { key, from } = keyOrThrow();
  // Resend batch caps at 100 per request; chunk.
  for (let i = 0; i < mails.length; i += 100) {
    const chunk = mails.slice(i, i + 100).map((m) => ({ from, to: m.to, subject: m.subject, html: m.html }));
    const res = await fetch(`${API}/batch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) throw new Error(`resend_failed:${res.status}`);
  }
}
```

- [ ] **Step 2: `send-roster-csv`**

Create `infra/supabase/functions/send-roster-csv/index.ts` (mirror `complete-account`'s JWT-auth):

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding/base64';
import { sendEmail } from '../_shared/email.ts';

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const authHeader = req.headers.get('Authorization') ?? '';
  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const client = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) return new Response('Unauthorized', { status: 401 });
  if (!user.email) return json({ error: 'no_email' }, 400);

  let body: { event_id?: string };
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON body' }, 400); }
  if (!body.event_id) return json({ error: 'event_id required' }, 400);

  const { data: csv, error } = await client.rpc('event_roster_csv', { p_event_id: body.event_id });
  if (error) return json({ error: error.message }, error.message?.includes('forbidden') ? 403 : 400);

  try {
    await sendEmail({
      to: user.email,
      subject: 'Padel Jam — attendance & revenue',
      html: '<p>Your event roster CSV is attached.</p>',
      attachments: [{ filename: 'roster.csv', content: encodeBase64(csv as string) }],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'send_failed';
    // Surface the unconfigured case as 200 data so the client can show a friendly message
    // (functions.invoke only throws on non-2xx).
    if (msg === 'email_not_configured') return json({ ok: false, error: 'email_not_configured' }, 200);
    return json({ error: msg }, 500);
  }
  return json({ ok: true });
});
```

- [ ] **Step 3: `send-blast`**

Create `infra/supabase/functions/send-blast/index.ts`:

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendBatchEmails } from '../_shared/email.ts';

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const authHeader = req.headers.get('Authorization') ?? '';
  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const client = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userErr } = await client.auth.getUser();
  if (userErr || !user) return new Response('Unauthorized', { status: 401 });

  let body: { blast_id?: string };
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON body' }, 400); }
  if (!body.blast_id) return json({ error: 'blast_id required' }, 400);

  // Load the blast (RLS: organizer-readable) for its title/description.
  const { data: blast, error: bErr } = await client
    .from('event_blasts')
    .select('title, description, channels')
    .eq('id', body.blast_id)
    .maybeSingle();
  if (bErr || !blast) return json({ error: 'blast_not_found' }, 404);
  if (!(blast.channels as string[]).includes('email')) return json({ ok: true, sent: 0 });

  // Recipient emails (organizer-gated RPC; reads auth.users server-side).
  const { data: recipients, error: rErr } = await client.rpc('blast_email_recipients', { p_blast_id: body.blast_id });
  if (rErr) return json({ error: rErr.message }, rErr.message?.includes('forbidden') ? 403 : 400);

  const list = (recipients ?? []) as { email: string }[];
  if (list.length === 0) return json({ ok: true, sent: 0 });

  const html = `<h2>${blast.title}</h2><p>${blast.description}</p>`;
  try {
    await sendBatchEmails(list.map((r) => ({ to: r.email, subject: blast.title as string, html })));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'send_failed' }, 500);
  }
  return json({ ok: true, sent: list.length });
});
```

- [ ] **Step 4: Config secrets + env**

In `infra/supabase/config.toml`, under `[edge_runtime]`, add (uncomment) a secrets block:
```toml
[edge_runtime.secrets]
RESEND_API_KEY = "env(RESEND_API_KEY)"
RESEND_FROM_EMAIL = "env(RESEND_FROM_EMAIL)"
```
In `.env.example` add `RESEND_API_KEY=` and `RESEND_FROM_EMAIL=`.

- [ ] **Step 5: Setup doc** — create `docs/superpowers/email-delivery-setup.md`: Resend account → verify a
  sending domain → API key → set `RESEND_API_KEY`/`RESEND_FROM_EMAIL` (local `.env` + cloud function
  secrets) → `pnpm dlx supabase@latest --workdir infra functions serve` to smoke-test → test Email-me-the-CSV
  (attachment arrives) and a blast email (opted-in members receive it). Note WhatsApp + push are deferred.

- [ ] **Step 6: Verify config parses + commit**

Run `db reset` (config.toml must still parse). Edge fns are Deno (not in `pnpm -w typecheck`); confirm they
import cleanly by review (optionally `deno check` if available). Commit:
```bash
git add infra/supabase/functions/_shared/email.ts infra/supabase/functions/send-roster-csv infra/supabase/functions/send-blast infra/supabase/config.toml .env.example docs/superpowers/email-delivery-setup.md
git commit -m "feat(delivery): Resend email edge functions (send-roster-csv, send-blast) + config (email delivery)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `@padel/api` + mobile wiring + i18n

**Files:**
- Modify: `packages/api/src/events/mutations.ts`
- Modify: `apps/mobile/app/event/[id]/manage.tsx`
- Modify: `apps/mobile/lib/i18n-mobile.ts`

- [ ] **Step 1: Update `useSendBlast` (read row + fire delivery)**

In `packages/api/src/events/mutations.ts`, replace the `useSendBlast` body so it reads the new row return
and invokes `send-blast` when the email channel is selected (the RPC now returns
`{ blast_id, sent_to_count }[]`). It still returns a `number` (the count) so `blast.tsx` is unchanged:

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
      const row = data?.[0] ?? { blast_id: null, sent_to_count: 0 };
      // Deliver the email channel best-effort (the row is already recorded). Use the supabase
      // client's `functions.invoke` — it injects the project URL + the caller's auth automatically.
      if (input.channels.includes('email') && row.blast_id) {
        try {
          await db.functions.invoke('send-blast', { body: { blast_id: row.blast_id } });
        } catch {
          /* delivery is best-effort; the blast is recorded regardless */
        }
      }
      return row.sent_to_count;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.eventBlasts(eventId) });
    },
  });
};
```
No `SUPABASE_URL` plumbing — `db.functions.invoke` (supabase-js) uses the client's configured URL and the
current session's auth header.

- [ ] **Step 2: Add `useSendRosterCsvEmail`**

In `packages/api/src/events/mutations.ts`, add:

```ts
export const useSendRosterCsvEmail = (eventId: string) => {
  const db = useDb();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await db.functions.invoke('send-roster-csv', {
        body: { event_id: eventId },
      });
      // `send-roster-csv` returns 200 `{ ok:false, error:'email_not_configured' }` for the unconfigured
      // case (so it arrives as `data`, not a thrown FunctionsHttpError); other failures set `error`.
      if (error) throw new Error('csv_email_failed');
      if (data && data.ok === false) {
        throw new Error(data.error === 'email_not_configured' ? 'email_not_configured' : 'csv_email_failed');
      }
    },
  });
};
```

- [ ] **Step 3: Manage screen — "Email me the CSV"**

In `apps/mobile/app/event/[id]/manage.tsx`: add `const sendCsvEmail = useSendRosterCsvEmail(id);`. Change the
single Export button's `onPress` to open an `Alert.alert` action sheet (JM-46 two options):
```tsx
const onExport = () => {
  Alert.alert(t('exportSheetTitle'), undefined, [
    { text: t('exportCsvCta'), onPress: onExportCsv },
    { text: t('emailCsvCta'), onPress: () => run(async () => {
        await sendCsvEmail.mutateAsync();
        Alert.alert(t('csvEmailed'));
      }) },
    { text: t('cancel'), style: 'cancel' },
  ]);
};
```
Point the existing export button at `onExport` (keep the existing `onExportCsv` download handler as the
"Download" action). `run` maps a thrown `email_not_configured` via i18n.

- [ ] **Step 4: i18n** — in `mobileEvent.en` add: `exportSheetTitle: 'Export attendance'`,
  `emailCsvCta: 'Email me the CSV'`, `csvEmailed: 'Sent to your email.'`,
  `email_not_configured: 'Email delivery isn’t set up yet.'`, `csv_email_failed: 'Could not email the CSV. Please try again.'`
  (keep the existing `exportCsvCta: 'Download CSV'`/`exportUnavailable`).

- [ ] **Step 5: Typecheck + tests + commit**

Run: `pnpm -w typecheck` (13/13) and `pnpm --filter @padel/api test`. Then:
```bash
git add packages/api/src/events/mutations.ts "apps/mobile/app/event/[id]/manage.tsx" apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(delivery): email-the-CSV + blast email delivery wiring (email delivery)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verification (whole slice)

1. **DB:** `db reset` clean; `email_delivery.sql` → `OK email_delivery`; `event_blasts.sql` → `OK event_blasts`.
2. **Types/API:** `pnpm -w typecheck` 13/13; `pnpm --filter @padel/api test`.
3. **Edge functions:** code review + (optional) `supabase functions serve` smoke; they return
   `email_not_configured` (500) until `RESEND_API_KEY` is set — expected pre-setup.
4. **Manual (post-key, per `docs/superpowers/email-delivery-setup.md`):** Email-me-the-CSV → email with the
   attachment; a blast with the email channel → opted-in members receive it.

## Notes for the implementer

- **Edge functions are Deno**, not part of `pnpm -w typecheck`. Don't try to add them to a TS project; verify
  by review (and `deno check infra/supabase/functions/**/index.ts` if Deno is installed).
- **No service-role key** is needed in either function — both call organizer-gated RPCs as the caller, and
  `send-roster-csv` emails the caller's own `user.email`.
- `send_event_blast` return type changed (integer → row); Task 2 types + Task 4 hook + the two SQL tests all
  move together. `blast.tsx` stays unchanged (the hook still returns a `number`).
- **WhatsApp channel and push are deferred** — `send-blast` intentionally only handles the email channel.
- Migration `0076`; secrets via `config.toml` env-interpolation (never commit real keys).
