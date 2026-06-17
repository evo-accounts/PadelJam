# Phase 5H — Match Timer + Share Results / CM-39 — Design

*Padel Jam • 2026-06-17 • Brainstormed design / spec*

## Goal

Two in-progress-event features, built together on one branch:
- **5H-A Timer (IP-21):** a per-event shared match timer with an organizer-controlled Start/Pause/Resume/
  Reset and a realtime-synced countdown, shown on a Timer tab for `scoring_mode='time'` events.
- **5H-B Share Results + CM-39:** after finishing, the organizer can post the event result to the
  community feed (a `result` post rendered as a result card) and/or share a text summary externally.

**Round generation is already complete** (americano client-side; mexicano + up&down server-side in
`generate_next_round`, UI-wired in `live.tsx`) — IP-13/14/15 are out of scope here.

## Scope decisions (from the 5H brainstorm)

1. **Timer control = organizer only**; everyone else sees a read-only synced countdown.
2. **Timer is per-event** (one shared timer) and the Timer tab shows **only for `scoring_mode='time'`**.
3. **Share Results = post-to-feed (CM-39) + external text share**; image-card generation deferred.
4. **Result posts render dynamically**: store `kind='result' + result_event_id`; `PostCard` fetches the
   event's standings live (via a SECURITY DEFINER summary RPC) and renders a result card.

## Verified context

- Highest migration is `0073`; this slice uses **`0074`** (timer) and **`0075`** (result post).
- `generate_next_round` ([0048_match_engine_rpcs.sql:231](../../../infra/supabase/migrations/0048_match_engine_rpcs.sql#L231))
  already handles mexicano + up&down; `live.tsx` wires "Add round"/scoring/leaderboard. `standings(p_event_id)`
  ([0045_events_caps_standings.sql:29](../../../infra/supabase/migrations/0045_events_caps_standings.sql#L29))
  returns `(entity_id, is_team, points, wins, draws, losses, rank)`.
- `finish_event` ([0048:394](../../../infra/supabase/migrations/0048_match_engine_rpcs.sql#L394)) sets
  `status='completed'` + ranking; it does **not** post to any feed.
- `event_timer` does **not** exist (planned schema in `Requirements/in-progress-event.md`). No timer RPC/UI.
  `events.scoring_mode in ('points','time','classic')`, `scoring_value` is the time limit for `'time'`.
- `community_posts` ([0021_community_social_tables.sql:38](../../../infra/supabase/migrations/0021_community_social_tables.sql#L38)):
  `kind in ('user','result')`, `result_event_id uuid` (FK to events **not yet added** — comment notes it
  was deferred). Content CHECK already allows a row with only `result_event_id`.
- `useCommunityPosts` / `PostCard` ([apps/mobile/components/community/PostCard.tsx](../../../apps/mobile/components/community/PostCard.tsx))
  render author/body/image/likes/comments; the `CommunityPost` type has **no** `kind`/`result_event_id`.
- `live.tsx` ([apps/mobile/app/event/[id]/live.tsx](../../../apps/mobile/app/event/[id]/live.tsx)): tabs
  `overview|matches|leaderboard`; `useEventRealtime(id)`; Finish modal via `useFinishEvent`; a `useNow()`-style
  ticking pattern exists in the codebase (`apps/mobile/lib/useNow.ts`).
- Helpers: `is_event_organizer(e,u)`, `event_is_visible(e,u)`, `event_group_community(e)`,
  `is_community_member(c)` all exist.

## 5H-A — Match Timer

### Migration `0074_event_timer.sql`

```sql
create table event_timer (
  event_id uuid primary key references events(id) on delete cascade,
  duration_seconds integer not null,
  started_at timestamptz,
  paused_at timestamptz,
  status text not null default 'idle' check (status in ('idle','running','paused')),
  updated_at timestamptz not null default now()
);
alter table event_timer enable row level security;
create policy "event_timer: read" on event_timer for select using (event_is_visible(event_id, auth.uid()));
-- writes only via set_event_timer (SECURITY DEFINER)
alter publication supabase_realtime add table event_timer;

create or replace function set_event_timer(p_event_id uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_t event_timer%rowtype; v_dur int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  if p_action not in ('start','pause','resume','reset') then raise exception 'invalid_action' using errcode='P0001'; end if;

  select * into v_t from event_timer where event_id = p_event_id;
  v_dur := coalesce(v_ev.scoring_value, 0) * 60;  -- time-mode limit (minutes) -> seconds

  if p_action = 'start' then
    insert into event_timer (event_id, duration_seconds, started_at, paused_at, status, updated_at)
    values (p_event_id, v_dur, now(), null, 'running', now())
    on conflict (event_id) do update set duration_seconds = v_dur, started_at = now(),
      paused_at = null, status = 'running', updated_at = now();
  elsif p_action = 'pause' then
    update event_timer set paused_at = now(), status = 'paused', updated_at = now()
      where event_id = p_event_id and status = 'running';
  elsif p_action = 'resume' then
    update event_timer set started_at = started_at + (now() - paused_at), paused_at = null,
      status = 'running', updated_at = now()
      where event_id = p_event_id and status = 'paused';
  else -- reset
    update event_timer set started_at = null, paused_at = null, status = 'idle', updated_at = now()
      where event_id = p_event_id;
  end if;
end; $$;

grant execute on function set_event_timer(uuid, text) to authenticated;
```

- `database.types.ts`: hand-add `event_timer` Row + the RPC.
- **SQL test `event_timer.sql`**: organizer `start` creates a running row with `duration_seconds =
  scoring_value*60`; `pause` sets paused/paused_at; `resume` clears paused_at + status running; `reset` →
  idle; a non-organizer → `forbidden`. `PT001`/`OK`.

### `@padel/api`

- `qk.eventTimer: (id) => ['event', id, 'timer']`.
- `useEventTimer(eventId)` — read the `event_timer` row (`maybeSingle`); shape `{ duration_seconds,
  started_at, paused_at, status } | null`. **Add `event_timer` to `useEventRealtime`** so the row
  invalidates `qk.eventTimer(eventId)` on change.
- `useSetEventTimer(eventId)` — `rpc('set_event_timer', { p_event_id, p_action })`, invalidates
  `qk.eventTimer(eventId)`.

### Mobile

- **`live.tsx`** — add `'timer'` to the tab union; the Timer tab is listed **only when
  `event.scoring_mode === 'time'`**. The tab renders:
  - `remainingSeconds` computed from the row + a ticking `useNow()`: `running` →
    `duration − (now − started_at)`; `paused` → `duration − (paused_at − started_at)`; `idle` → `duration`
    (clamped at 0). Display `mm:ss`.
  - **Organizer**: Start (idle) / Pause (running) / Resume (paused) / Reset buttons → `useSetEventTimer`.
  - **Non-organizer**: countdown only (read-only).
- **i18n** (`event` namespace): `timerTab`, `timerStart`, `timerPause`, `timerResume`, `timerReset`,
  `timerIdle` ("Not started"), `timerDone` ("Time's up").

## 5H-B — Share Results + CM-39

### Migration `0075_event_result_post.sql`

```sql
-- Wire up the deferred FK now that events exists (no result posts exist yet, so this is safe).
alter table community_posts
  add constraint community_posts_result_event_id_fkey
  foreign key (result_event_id) references events(id) on delete cascade;

create or replace function post_event_result(p_event_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_community uuid; v_post uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.status <> 'completed' then raise exception 'not_completed' using errcode='P0001'; end if;
  v_community := event_group_community(p_event_id);
  if v_community is null then raise exception 'no_community' using errcode='P0001'; end if;
  if exists (select 1 from community_posts where result_event_id = p_event_id) then
    raise exception 'already_posted' using errcode='P0001'; end if;

  insert into community_posts (community_id, author_id, kind, result_event_id)
  values (v_community, v_user, 'result', p_event_id)
  returning id into v_post;
  return v_post;
end; $$;

create or replace function event_result_summary(p_event_id uuid)
returns table (rank int, name text, points int)
language sql stable security definer set search_path = public as $$
  select s.rank,
         coalesce(pr.full_name, ep.guest_name, '—') as name,
         s.points
  from standings(p_event_id) s
  join event_participants ep on ep.id = s.entity_id
  left join profiles pr on pr.id = ep.user_id
  where event_group_community(p_event_id) is not null
    and is_community_member(event_group_community(p_event_id))
  order by s.rank asc, name asc;
$$;

grant execute on function post_event_result(uuid), event_result_summary(uuid) to authenticated;
```

Note: `event_result_summary` returns no rows when the caller is not a member of the event's community
(the `where` predicate), which is the desired gate for feed viewers.

- `database.types.ts`: hand-add both RPCs.
- **SQL test `event_result_post.sql`**: organizer on a completed community event → `post_event_result`
  inserts a `kind='result'` post; second call → `already_posted`; a non-community (standalone) completed
  event → `no_community`; a non-completed event → `not_completed`; a non-organizer → `forbidden`.
  `event_result_summary` returns ranked rows for a community member and 0 rows for a non-member.

### `@padel/api`

- `qk.eventResultSummary: (id) => ['event', id, 'result-summary']`.
- `useEventResultSummary(eventId)` — `rpc('event_result_summary', { p_event_id })` → `{ rank, name, points }[]`.
- `usePostEventResult(eventId)` — `rpc('post_event_result', …)`; invalidates the event's community posts
  (`qk.posts(communityId)` — pass the communityId, or invalidate broadly).
- Extend `useCommunityPosts` select + the `CommunityPost` type to include `kind` and `result_event_id`.

### Mobile

- **`PostCard.tsx`** — when `post.kind === 'result' && post.result_event_id`, render a **result card**:
  `useEventResultSummary(post.result_event_id)` → a header ("Event result"), the top 3 placements
  (`{rank}. {name} · {points}`), and a "View event" link → `/event/${result_event_id}`. Likes/comments row
  stays. Non-result posts render unchanged.
- **`live.tsx`** — a **"Share results"** button: shown on the completed **Overview** tab and surfaced right
  after a successful finish. Opens a modal:
  - **Post to community feed** (only when `event.group_id != null`): `usePostEventResult` → on success show
    "Posted" / disable; maps `already_posted` to a friendly message.
  - **Share**: build a text summary client-side from `useEventStandings(id)` + participant names
    ("🏆 {event} — 1. Alice (24) · 2. Bob (21) …") and `Sharing.shareAsync` (clipboard fallback).
- **i18n** (`event` namespace): `shareResultsCta`, `shareResultsTitle`, `postToFeedCta`, `shareExternalCta`,
  `resultPosted`, `already_posted`, `not_completed`, `no_community` (reuse), `resultCardTitle`
  ("Event result"), `viewEventCta`. (`community` namespace may need a result-card label if rendered there;
  PostCard uses `useT('community')` — add the result keys there.)

## Error handling

- Timer/result RPCs raise `forbidden`/`invalid_action`/`not_completed`/`no_community`/`already_posted`/
  `event_not_found` (P0001) → `mapPgError` allow-list + i18n.
- `event_result_summary` returning 0 rows (non-member or no scores) → the result card shows a minimal
  fallback ("Result unavailable") rather than crashing.
- Timer with `scoring_value` null/0 → duration 0; the tab still renders ("Time's up"/idle); organizer can
  still reset. (Time-mode events always have a positive `scoring_value` per the create wizard.)

## Testing

- **DB:** `db reset` clean; `event_timer.sql` → `OK event_timer`; `event_result_post.sql` →
  `OK event_result_post`.
- **Types/API:** `pnpm -w typecheck` (13/13); `pnpm --filter @padel/api test`.
- **App smoke (simulator):** a time-mode event shows a Timer tab; organizer start/pause/resume/reset and
  the countdown syncs; finishing a community event → Share results → Post to feed → the post renders as a
  result card in the community feed; external Share opens the share sheet.

## Explicitly out of scope / deferred

Result image-card generation; per-round timers; editing/removing a posted result; auto-posting on finish
(it's an explicit organizer action); round-gen changes; PT/PT-BR copy.

## Conventions followed

Additive migrations `0074`/`0075`; RPCs `security definer set search_path = public` + grants; SQL tests
`PT001`/`OK`; hand-edited `database.types.ts`; thin `@padel/api` hooks + `qk`; realtime via
`useEventRealtime`; `useNow()` ticking; `useT('event')`/`useT('community')`; reuse `is_event_organizer`,
`event_is_visible`, `event_group_community`, `is_community_member`, `standings()`, and the `expo-sharing`
pattern.
