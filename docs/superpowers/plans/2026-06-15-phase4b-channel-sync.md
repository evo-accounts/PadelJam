# Phase 4B — Automatic Group/Event Channels + Membership Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provision Stream channels for groups + private/standalone events and reconcile their membership to the DB on open, reached via a Chat entry on the group/event screens.

**Architecture:** A `SECURITY DEFINER` SQL RPC (`chat_channel_spec`) authorizes the caller + returns the channel name + member ids; an `ensure-channel` edge function calls it as the caller, then upserts the Stream channel (custom `group`/`event` type, deterministic id = entity uuid) and full-reconciles members via the `stream-chat` server SDK. A `useEnsureChannel` mutation backs Chat buttons on the group/event screens. Reuses Phase 4A's client/provider/conversation/list.

**Tech Stack:** Supabase (RPC + SQL test + Deno edge fn, `npm:stream-chat`), `@padel/api` (TanStack Query), Expo Router + React Native, `@padel/i18n`.

**Spec:** `docs/superpowers/specs/2026-06-15-phase4b-channel-sync-design.md`

**Setup prerequisite (user, one-time, NOT code):** in the Stream dashboard create channel types **`group`** and **`event`** (clone built-in `team`). Until then, `ensure-channel` errors on the dev build. Documented in the edge fn `.env.example`.

**Verification posture (agreed, same as 4A):** SQL test + edge-fn boot + `pnpm -w typecheck` here; actual Stream channel create/member-sync is dev-build-only (deferred).

---

## File Structure
- **Create** `infra/supabase/migrations/0065_chat_channel_spec.sql` — the authorization/membership RPC.
- **Create** `infra/supabase/tests/chat_channel_spec.sql` — member/non-member/no_chat.
- **Modify** `packages/db/src/database.types.ts` — hand-add the `chat_channel_spec` function type.
- **Create** `infra/supabase/functions/ensure-channel/index.ts` — upsert + reconcile the Stream channel.
- **Create** `infra/supabase/functions/ensure-channel/.env.example` — Stream vars + dashboard-type note.
- **Create** `packages/api/src/chat/mutations.ts` — `useEnsureChannel`.
- **Modify** `packages/api/src/index.ts` — export `chat/mutations`.
- **Modify** `apps/mobile/app/group/[id]/index.tsx` — Chat button.
- **Modify** `apps/mobile/app/event/[id]/index.tsx` — Chat button (private/standalone only).
- **Modify** `apps/mobile/lib/i18n-mobile.ts` — add `openChat`/`chatUnavailable` to the `chat` namespace.

---

## Task 1: chat_channel_spec RPC

**Files:**
- Create: `infra/supabase/migrations/0065_chat_channel_spec.sql`
- Create: `infra/supabase/tests/chat_channel_spec.sql`
- Modify: `packages/db/src/database.types.ts`

- [ ] **Step 1: Create the migration**

Write `infra/supabase/migrations/0065_chat_channel_spec.sql`:

```sql
-- 0065_chat_channel_spec.sql
-- Authorizes a caller for a group/event chat and returns its Stream channel spec
-- (name + member ids). Used by the ensure-channel edge function. (Phase 4B)
create or replace function chat_channel_spec(p_kind text, p_id uuid)
returns table (name text, member_ids uuid[])
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_private boolean; v_group uuid;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = 'P0001'; end if;

  if p_kind = 'group' then
    if not exists (select 1 from group_members where group_id = p_id and user_id = v_uid) then
      raise exception 'forbidden' using errcode = 'P0001';
    end if;
    return query
      select g.name,
             (select coalesce(array_agg(gm.user_id), '{}'::uuid[])
                from group_members gm where gm.group_id = p_id)
      from groups g where g.id = p_id;

  elsif p_kind = 'event' then
    select e.is_private, e.group_id into v_private, v_group
      from events e where e.id = p_id and e.deleted_at is null;
    if not found then raise exception 'event_not_found' using errcode = 'P0001'; end if;
    -- Only private or standalone (group-less) events have their own chat.
    if not (v_private or v_group is null) then raise exception 'no_chat' using errcode = 'P0001'; end if;
    if not (exists (select 1 from event_participants where event_id = p_id and user_id = v_uid)
            or exists (select 1 from events where id = p_id and organizer_id = v_uid)) then
      raise exception 'forbidden' using errcode = 'P0001';
    end if;
    return query
      select e.name,
             (select coalesce(array_agg(ep.user_id), '{}'::uuid[])
                from event_participants ep where ep.event_id = p_id and ep.user_id is not null)
      from events e where e.id = p_id;

  else
    raise exception 'invalid_kind' using errcode = 'P0001';
  end if;
end; $$;
grant execute on function chat_channel_spec(text, uuid) to authenticated;
```

- [ ] **Step 2: Hand-add the function type**

In `packages/db/src/database.types.ts` `Functions` block:

```ts
      chat_channel_spec: {
        Args: { p_kind: string; p_id: string }
        Returns: { name: string; member_ids: string[] }[]
      }
```

- [ ] **Step 3: Write the SQL test**

Create `infra/supabase/tests/chat_channel_spec.sql`:

```sql
-- chat_channel_spec: group member gets {name, members}; non-member -> forbidden;
-- a non-private group event -> no_chat.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('f1000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cc1@x.com'),
  ('f1000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cc2@x.com')
  on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('f1000001-0000-0000-0000-000000000001','cc1@x.com','+351900070001','Member CC'),
  ('f1000002-0000-0000-0000-000000000002','cc2@x.com','+351900070002','Outsider CC')
  on conflict do nothing;

do $$
declare a constant uuid := 'f1000001-0000-0000-0000-000000000001';
  b constant uuid := 'f1000002-0000-0000-0000-000000000002';
  v_tenant uuid; v_comm uuid; v_group uuid; v_event uuid;
  v_name text; v_members uuid[];
begin
  insert into tenants (type, name, country) values ('community', 'CC Tenant', 'PT') returning id into v_tenant;
  insert into communities (tenant_id, name, type, privacy) values (v_tenant, 'CC Community', 'club', 'public') returning id into v_comm;
  insert into groups (community_id, name) values (v_comm, 'CC Group') returning id into v_group;
  insert into group_members (group_id, user_id) values (v_group, a);
  -- a non-private group event (no own chat)
  insert into events (organizer_id, group_id, event_type, specification, scoring_mode, scoring_value,
                      manual_location_name, has_location, num_courts, is_private, starts_at,
                      duration_minutes, organizer_role, name, status)
    values (a, v_group, 'americano', 'mixed', 'points', 24, 'Court CC', true, 2, false, now() + interval '1 day',
            90, 'organizing_and_playing', 'CC Event', 'scheduled')
    returning id into v_event;

  -- member 'a' gets the group spec
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', a), true);
  select name, member_ids into v_name, v_members from chat_channel_spec('group', v_group);
  if v_name <> 'CC Group' or not (a = any(v_members)) then
    raise exception using errcode='PT001', message=format('group spec wrong name=%s members=%s', v_name, v_members); end if;

  -- non-member 'b' -> forbidden
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', b), true);
  begin
    perform name from chat_channel_spec('group', v_group);
    raise exception using errcode='PT001', message='expected forbidden for non-member';
  exception when others then
    if sqlerrm <> 'forbidden' then raise exception using errcode='PT001', message='wrong err (group): '||sqlerrm; end if;
  end;

  -- non-private group event -> no_chat (even for the organizer 'a')
  perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', a), true);
  begin
    perform name from chat_channel_spec('event', v_event);
    raise exception using errcode='PT001', message='expected no_chat for non-private group event';
  exception when others then
    if sqlerrm <> 'no_chat' then raise exception using errcode='PT001', message='wrong err (event): '||sqlerrm; end if;
  end;

  raise notice 'OK chat_channel_spec';
end $$;
rollback;
```

> If the `events`/`communities`/`groups`/`tenants` inserts hit a constraint, read the failing column from the psql error and add a valid value (the columns here mirror the working `notifications.sql` / `my_groups.sql` test inserts). Do not drop required columns.

- [ ] **Step 4: Run migration + test**

```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/chat_channel_spec.sql
```
Expected: `NOTICE: OK chat_channel_spec`, no `PT001`.

- [ ] **Step 5: Typecheck db**

Run: `pnpm --filter @padel/db typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add infra/supabase/migrations/0065_chat_channel_spec.sql infra/supabase/tests/chat_channel_spec.sql packages/db/src/database.types.ts
git commit -m "feat(chat): chat_channel_spec RPC (authorize + member ids) + test"
```

---

## Task 2: ensure-channel edge function

**Files:**
- Create: `infra/supabase/functions/ensure-channel/index.ts`
- Create: `infra/supabase/functions/ensure-channel/.env.example`

- [ ] **Step 1: Write the edge function**

Create `infra/supabase/functions/ensure-channel/index.ts`:

```ts
// Upserts the Stream channel for a group/event and reconciles its members to the current DB
// membership (full add+remove). Authorization + member list come from chat_channel_spec, called
// AS THE CALLER so its SECURITY DEFINER auth check uses the caller's auth.uid().
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { StreamChat } from 'npm:stream-chat';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const key = Deno.env.get('STREAM_API_KEY');
  const secret = Deno.env.get('STREAM_API_SECRET');
  if (!key || !secret) return json({ error: 'stream_not_configured' }, 500);

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) return new Response('Unauthorized', { status: 401 });

  let body: { kind?: string; id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const kind = body.kind;
  const id = body.id;
  if ((kind !== 'group' && kind !== 'event') || !id) return json({ error: 'bad_request' }, 400);

  // Authorize + fetch the channel spec as the caller.
  const { data: spec, error: specErr } = await userClient.rpc('chat_channel_spec', {
    p_kind: kind,
    p_id: id,
  });
  if (specErr) {
    const m = specErr.message ?? '';
    if (m.includes('forbidden')) return json({ error: 'forbidden' }, 403);
    if (m.includes('no_chat')) return json({ error: 'no_chat' }, 409);
    return json({ error: 'spec_failed' }, 500);
  }
  const row = Array.isArray(spec) ? spec[0] : spec;
  if (!row) return json({ error: 'not_found' }, 404);
  const name: string = row.name;
  const memberIds: string[] = row.member_ids ?? [];

  try {
    const server = StreamChat.getInstance(key, secret);
    const channel = server.channel(kind, id, {
      name,
      created_by_id: user.id,
      members: memberIds,
    });
    await channel.create(); // get-or-create
    await channel.update({ name });

    // Full reconcile.
    const res = await channel.queryMembers({});
    const current = res.members.map((m) => m.user_id).filter((x): x is string => !!x);
    const toAdd = memberIds.filter((x) => !current.includes(x));
    const toRemove = current.filter((x) => !memberIds.includes(x));
    if (toAdd.length) await channel.addMembers(toAdd);
    if (toRemove.length) await channel.removeMembers(toRemove);

    return json({ cid: channel.cid });
  } catch (e) {
    return json({ error: 'stream_failed', detail: String(e) }, 500);
  }
});
```

- [ ] **Step 2: Write the env example**

Create `infra/supabase/functions/ensure-channel/.env.example`:

```
# Same Stream credentials as the stream-token function.
STREAM_API_KEY=
STREAM_API_SECRET=
# PREREQUISITE: in the Stream dashboard, create channel types `group` and `event`
# (clone the built-in `team` type). ensure-channel creates channels of these types.
```

- [ ] **Step 3: Verify the function boots (confirms npm:stream-chat loads in Deno)**

```bash
cd /Users/joaopaulos4/Cursor/PadelJam
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
( pnpm dlx supabase@latest --workdir infra functions serve ensure-channel --no-verify-jwt >/tmp/ensurefn.log 2>&1 & )
sleep 25
cat /tmp/ensurefn.log
pkill -f "functions serve" || true
```
Expected: the log shows the function served with NO import/parse error for `npm:stream-chat`.
**If `npm:stream-chat` fails to load in Deno:** STOP and report — the fallback is hand-rolled Stream
REST calls (server JWT signed with the secret; `POST /channels/{type}/{id}/query` to upsert, `POST
/channels/{type}/{id}` with `add_members`/`remove_members` to reconcile). Surface this to the controller
rather than guessing.

- [ ] **Step 4: Commit**

```bash
git add infra/supabase/functions/ensure-channel/index.ts infra/supabase/functions/ensure-channel/.env.example
git commit -m "feat(chat): ensure-channel edge function (upsert + reconcile members)"
```

---

## Task 3: useEnsureChannel hook

**Files:**
- Create: `packages/api/src/chat/mutations.ts`
- Modify: `packages/api/src/index.ts`

- [ ] **Step 1: Create the mutation**

Create `packages/api/src/chat/mutations.ts`:

```ts
import { useMutation } from '@tanstack/react-query';
import { useDb } from '../client';

export type EnsureChannelInput = { kind: 'group' | 'event'; id: string };

// Ensures the Stream channel for a group/event exists + has the right members, returns its cid.
export const useEnsureChannel = () => {
  const db = useDb();
  return useMutation({
    mutationFn: async (input: EnsureChannelInput) => {
      const { data, error } = await db.functions.invoke('ensure-channel', { body: input });
      if (error) throw error;
      return data as { cid: string };
    },
  });
};
```

- [ ] **Step 2: Re-export**

In `packages/api/src/index.ts`, add after `export * from './chat/queries';`:

```ts
export * from './chat/mutations';
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @padel/api typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/chat/mutations.ts packages/api/src/index.ts
git commit -m "feat(api): useEnsureChannel mutation"
```

---

## Task 4: group/event Chat buttons + i18n

**Files:**
- Modify: `apps/mobile/lib/i18n-mobile.ts`
- Modify: `apps/mobile/app/group/[id]/index.tsx`
- Modify: `apps/mobile/app/event/[id]/index.tsx`

- [ ] **Step 1: Add i18n keys**

In `apps/mobile/lib/i18n-mobile.ts`, add to the existing `mobileChat.en` object (after `startError`):

```ts
    openChat: 'Open chat',
    chatUnavailable: "Chat isn't available for this yet.",
```

- [ ] **Step 2: Add the Chat button to the group screen**

In `apps/mobile/app/group/[id]/index.tsx`: import the hook and add a Chat action near the other group
actions. Add to the `@padel/api` import: `useEnsureChannel`. Add near the top of the component
(after the existing hooks):

```tsx
  const ensureChannel = useEnsureChannel();
  const openGroupChat = async () => {
    if (ensureChannel.isPending) return;
    try {
      const { cid } = await ensureChannel.mutateAsync({ kind: 'group', id });
      router.push(('/chat/' + cid) as never);
    } catch {
      /* surfaced via ensureChannel.isError below */
    }
  };
```

Render a Chat button among the group actions (match the screen's existing button styling; this is a
minimal `Pressable`):

```tsx
      <Pressable
        onPress={openGroupChat}
        disabled={ensureChannel.isPending}
        accessibilityRole="button"
        style={{ paddingVertical: 12, paddingHorizontal: 16, backgroundColor: '#0B7BFF', borderRadius: 12, alignItems: 'center', marginTop: 8 }}
      >
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{t('openChat', { ns: 'chat' })}</Text>
      </Pressable>
      {ensureChannel.isError ? (
        <Text style={{ color: '#D7263D', fontSize: 13, marginTop: 6 }}>{t('chatUnavailable', { ns: 'chat' })}</Text>
      ) : null}
```

> Place these inside the screen's existing scrollable content, near the other group actions (Share, etc.). `t` here is the group screen's `useT('group')` instance; the `{ ns: 'chat' }` override pulls the chat-namespace keys. `router` already exists on this screen.

- [ ] **Step 3: Add the Chat button to the event screen (private/standalone only)**

In `apps/mobile/app/event/[id]/index.tsx`: add `useEnsureChannel` to the `@padel/api` import. After
the existing hooks/derived values (where `event` is available):

```tsx
  const ensureChannel = useEnsureChannel();
  const hasOwnChat = !!event && (event.is_private || event.group_id == null);
  const openEventChat = async () => {
    if (ensureChannel.isPending) return;
    try {
      const { cid } = await ensureChannel.mutateAsync({ kind: 'event', id });
      router.push(('/chat/' + cid) as never);
    } catch {
      /* surfaced via ensureChannel.isError below */
    }
  };
```

Render the button only when `hasOwnChat`, near the other event actions:

```tsx
      {hasOwnChat ? (
        <>
          <Pressable
            onPress={openEventChat}
            disabled={ensureChannel.isPending}
            accessibilityRole="button"
            style={{ paddingVertical: 12, paddingHorizontal: 16, backgroundColor: '#0B7BFF', borderRadius: 12, alignItems: 'center', marginTop: 8 }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{t('openChat', { ns: 'chat' })}</Text>
          </Pressable>
          {ensureChannel.isError ? (
            <Text style={{ color: '#D7263D', fontSize: 13, marginTop: 6 }}>{t('chatUnavailable', { ns: 'chat' })}</Text>
          ) : null}
        </>
      ) : null}
```

> `event` is the `useEvent(id)` result; `is_private`/`group_id` are on it (verify the field names in `packages/db` if typecheck complains). `router` + `t` (`useT('event')`) already exist on this screen. `id` is the `useLocalSearchParams` id.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter mobile typecheck`
Expected: PASS. (`useEvent` does `select('*')`, so `event.is_private` + `event.group_id` are present and typed — verified.)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/i18n-mobile.ts 'apps/mobile/app/group/[id]/index.tsx' 'apps/mobile/app/event/[id]/index.tsx'
git commit -m "feat(mobile): group/event Chat buttons (ensure channel + open)"
```

- [ ] **Step 6: Dev-build smoke (deferred — document, don't run here)**

With the Stream `group`/`event` channel types created in the dashboard + secrets set: open a group →
Chat → a `group` channel is created with the group's members, opens the conversation; leave the group
on another account → reopen → that member is removed. Repeat for a private/standalone event.

---

## Verification gate (whole phase)

```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
pnpm dlx supabase@latest --workdir infra db reset
docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/chat_channel_spec.sql  # OK chat_channel_spec
pnpm --filter @padel/api typecheck
pnpm -w typecheck
# ensure-channel boots (Task 2 Step 3). Stream channel create/sync is dev-build-only (deferred).
```

---

## Self-Review

**Spec coverage:**
- Group channel (members = group_members) → Task 1 (`chat_channel_spec` group branch) + Task 2 (upsert `group` channel). ✓
- Private/standalone event channel (members = participants) → Task 1 (event branch, `is_private OR group_id is null`, guests excluded) + Task 2. ✓
- Lazy reconcile-on-open + full add/remove → Task 2 (`ensure-channel` create + queryMembers diff + add/removeMembers). ✓
- Authorization (caller must be a member) → Task 1 (`forbidden`), surfaced 403 in Task 2. ✓
- Custom `group`/`event` channel types + deterministic id (entity uuid) → Task 2; dashboard prerequisite documented (env example + plan header). ✓
- `useEnsureChannel` → Task 3. ✓
- Chat entry on group + event screens (event: private/standalone only) → Task 4. ✓
- Reuses 4A conversation/list (channel appears in the member's list; `/chat/[cid]` watches it) — no new screen. ✓

**Placeholder scan:** none — complete SQL/TS in every step. The REST fallback note (Task 2 Step 3) is a real contingency, not a placeholder.

**Type consistency:** `EnsureChannelInput { kind, id }` (Task 3) matches the edge fn body (Task 2) and the screen calls (Task 4). `chat_channel_spec` Args/Returns (Task 1 types) match the RPC (Task 1 SQL) and the edge fn's `rpc('chat_channel_spec', { p_kind, p_id })` + `row.name`/`row.member_ids` read. The cid returned (`channel.cid` = `group:<uuid>`/`event:<uuid>`) round-trips through the 4A `/chat/[cid]` screen (which splits `type:id` and watches). i18n `openChat`/`chatUnavailable` (Task 4) used via `{ ns: 'chat' }` on the group/event screens.

**Known unknown (flagged):** `npm:stream-chat` loading in Deno (Task 2 Step 3 boot check; hand-rolled REST fallback documented). `event.is_private`/`event.group_id` presence is confirmed (`useEvent` selects `*`).
