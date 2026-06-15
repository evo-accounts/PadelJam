# Phase 4B — Automatic Group/Event Channels + Membership Sync — Design

*Padel Jam • 2026-06-15 • Brainstormed design / spec*

## Goal

Provision Stream Chat channels for **groups**, **private events**, and **standalone events**, and
keep each channel's membership in step with the DB (HN-10/11). Reached via a **Chat** entry on the
group/event screens. Builds on Phase 4A (client/provider/conversation/list already exist) — once a
user is added as a Stream member of an auto channel, it appears in their 4A chat list automatically.

## Scope decisions (made with the user)
1. **Lazy reconcile-on-open.** An idempotent `ensure-channel` edge function upserts the Stream
   channel and reconciles its members to the **current DB membership** each time a user opens the
   group/event chat. Catches every join/leave RPC path (it reads the DB live) without wiring into
   any of them. Trade-off: a membership change mid-session appears on the next open, not instantly
   (a DB-trigger→webhook upgrade is the documented path to real-time).
2. **Full reconcile** — the ensure fn both **adds** DB members missing from the channel and
   **removes** channel members no longer in the DB ("membership tracks the parent").
3. **Custom Stream channel types `group` and `event`** (direct chats keep `messaging` from 4A).
   **Prerequisite (user, one-time):** create the `group` and `event` channel types in the Stream
   dashboard before the dev-build smoke (see "Setup prerequisite" below). cids are `group:<uuid>` /
   `event:<uuid>`; the 4A conversation (`/chat/[cid]`) and list screens already handle any type.
4. **Verification:** scaffold posture (same as 4A) — SQL test + edge-fn boot + typecheck here; the
   actual channel create/member-sync is verified on a dev build.

## Setup prerequisite (user action, documented — not code)
In the Stream dashboard, create two channel types: **`group`** and **`event`** (clone the built-in
`team` type, which supports many members + add/remove + a `name`). Until they exist, `ensure-channel`
will error when creating a `group`/`event` channel on the dev build. Documented in the edge fn's
`.env.example` / a README note. (The 4A `messaging` type is built-in; no config needed.)

## Verified rules (from `Requirements/home.md` §5.1 + schema)
- **Group chat:** every group; members = `group_members(group_id)`.
- **Private event chat:** events where `is_private = true`; members = `event_participants` (with a `user_id`).
- **Standalone event chat:** events where `group_id is null`; same membership rule.
- A **non-private event inside a group** has **no own chat** (it uses the group chat) — so the event
  branch only provisions when `is_private OR group_id is null`.
- `events` has `is_private boolean` + `group_id uuid null` + `events_standalone_private` CHECK
  (`group_id is not null OR is_private = true`), and `events.name`. Guests (`event_participants` with
  null `user_id`) are excluded.

## Architecture

```
chat_channel_spec(p_kind, p_id)  -- SECURITY DEFINER SQL RPC
  authorizes caller is a member (group_members / event_participant|organizer);
  enforces event must be private|standalone (else 'no_chat');
  returns { name text, member_ids uuid[] }  -- all members, guests excluded
  raises 'forbidden' if caller not a member

ensure-channel edge fn (POST { kind, id }):
  verify caller JWT → call chat_channel_spec AS the caller (403 on forbidden / no_chat)
  → StreamChat server SDK (npm:stream-chat, KEY+SECRET):
      channelType = kind === 'group' ? 'group' : 'event'
      channelId   = id   // the entity uuid; the channel TYPE namespaces it → deterministic
      upsert channel { name, created_by_id: caller, members: member_ids }
      full reconcile: query current members → addMembers(missing) + removeMembers(stale)
  → { cid }   // "group:<uuid>" / "event:<uuid>"  (Stream cid = "<type>:<id>")

@padel/api: useEnsureChannel()  // invoke('ensure-channel', { body: { kind, id } }) → { cid }

mobile:
  group/[id]/index.tsx   "Chat" button → useEnsureChannel({kind:'group', id}) → /chat/<cid>
  event/[id]/index.tsx   "Chat" button (only if is_private || !group_id) → ensure(event) → /chat/<cid>
```

## Components

### `infra/supabase/migrations/0065_chat_channel_spec.sql`
`chat_channel_spec(p_kind text, p_id uuid)` → `returns table (name text, member_ids uuid[])`,
`language plpgsql stable security definer set search_path = public`, `grant execute … to authenticated`.
- `p_kind = 'group'`: if not `exists (group_members where group_id = p_id and user_id = auth.uid())` → `raise 'forbidden'`. Return `groups.name` + `array_agg(group_members.user_id)`.
- `p_kind = 'event'`: load the event; if not (`is_private` or `group_id is null`) → `raise 'no_chat'`. Authorize caller is a participant or the organizer, else `raise 'forbidden'`. Return `events.name` + `array_agg(event_participants.user_id) where user_id is not null`.
- Migration number **0065** (0061–0064 used; 0065 free on `main`).
- SQL test (`infra/supabase/tests/chat_channel_spec.sql`): a group member gets `{name, [members]}`; a non-member gets `forbidden`; a non-private group event raises `no_chat`. `PT001` sentinel; `f10…` UUID prefix.

Hand-add `chat_channel_spec` to `packages/db/src/database.types.ts` Functions (`Args: { p_kind: string; p_id: string }`, `Returns: { name: string; member_ids: string[] }[]`).

### `infra/supabase/functions/ensure-channel/index.ts`
POST-only; verify caller via `userClient.auth.getUser()` (401). Call
`userClient.rpc('chat_channel_spec', { p_kind, p_id })` (caller-scoped, so the SECURITY DEFINER
auth check uses the caller's `auth.uid()`); map a `forbidden`/`no_chat` error to 403/409. Then
`import { StreamChat } from 'npm:stream-chat'`, `getInstance(KEY, SECRET)`, upsert the channel +
full-reconcile members as above, return `{ cid: channel.cid }`. Env: `STREAM_API_KEY`,
`STREAM_API_SECRET` (same secrets as 4A). `.env.example` documents them + the dashboard channel-type
prerequisite. **First plan step boots the function to confirm `npm:stream-chat` loads in Deno**; if it
doesn't, fall back to hand-rolled Stream REST calls (documented).

### `packages/api/src/chat/mutations.ts`
`useEnsureChannel()` — `useMutation` taking `{ kind: 'group' | 'event'; id: string }`, calling
`db.functions.invoke('ensure-channel', { body: {...} })`, returning `{ cid: string }`. New file
(4A only added `chat/queries.ts`); export from `index.ts`.

### Mobile
- `apps/mobile/app/group/[id]/index.tsx` — a **Chat** action (button/row) → `useEnsureChannel`
  → `router.push('/chat/' + cid)`; pending + error (`chatUnavailable`) states.
- `apps/mobile/app/event/[id]/index.tsx` — same, **rendered only when the event `is_private` or has
  no `group_id`** (otherwise no own chat). Pending + error states.
- i18n `chat` namespace: add `openChat`, `chatUnavailable`.

## Error handling
- `chat_channel_spec` raises `forbidden`/`no_chat` → edge fn returns 403/409 → the Chat button shows
  `chatUnavailable`.
- Stream upsert/reconcile failure → edge fn 500 → same inline error; nothing partially navigates.
- Channel-type-not-configured (dashboard prerequisite missing) surfaces as a Stream error on the dev
  build → `chatUnavailable`; documented so it's diagnosable.

## Explicitly deferred / follow-ups
- **Real-time membership** (DB-trigger→webhook) — lazy reconcile is MVP.
- **4C polish** — Active/Archived tabs, archive/unarchive, direct delete, media gallery, unread badges.
- **Eager channel creation** at entity-create time.
- **Server-side identity `upsertUser`** (richer than 4A's client-side identity) if needed.
- **PT/PT-BR** translations for new `chat` keys.

## Conventions followed
Additive migration `0065`; RPC `security definer set search_path = public` + `grant execute …`; SQL
test with `set_config` role/jwt + `PT001`; hand-edit `database.types.ts`; edge fn mirrors
`stream-token`/`complete-account` (JWT-verified, service pattern); thin `@padel/api` mutation; screens
under existing `group/[id]`/`event/[id]`; copy via `useT('chat')`; reuses 4A client/provider/screens.
