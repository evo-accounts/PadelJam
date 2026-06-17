# Phase 5G-3 — Team Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let organizers manage team-spec events with a Team view (tap-to-assign players into a fixed `num_courts×2` grid, auto-confirm on pairing, switch, remove) and a Player view, on the Manage screen.

**Architecture:** Three organizer-gated SECURITY DEFINER RPCs (`organizer_assign_to_team`, `organizer_remove_from_team`, `organizer_switch_players`) over `event_teams`, sharing two internal helpers (`_clear_team_slot`, `_reconcile_team`) that enforce the pairing rule (full team → both confirmed; lone occupant → invited). A new `TeamManage` mobile component renders the grid + Player view and calls thin `@padel/api` mutations; team changes also flow into the 5G-2 activity log.

**Tech Stack:** Postgres/Supabase (migration, RPCs, RLS already present), TanStack Query (`@padel/api`), React Native / Expo Router, i18next.

Spec: `docs/superpowers/specs/2026-06-17-phase5g3-team-assignment-design.md`.

**Pairing rule (approved):** a lone occupant of a team stays `invited`; a full (2-slot) team is `is_confirmed=true` and both occupants are `confirmed`. Breaking a pair demotes the remaining occupant to `invited` (they stay in the event). "Remove from team" keeps players in the event (→ invited); it does NOT delete them.

---

### Task 1: Migration `0071_organizer_team_rpcs.sql` + SQL test

**Files:**
- Create: `infra/supabase/migrations/0071_organizer_team_rpcs.sql`
- Create: `infra/supabase/tests/organizer_team.sql`

- [ ] **Step 1: Write the migration**

Create `infra/supabase/migrations/0071_organizer_team_rpcs.sql`. First confirm `is_event_organizer(e uuid, u uuid)` exists (it does — used in `0047`). Then:

```sql
-- 5G-3 (JM-29..32): organizer-driven team management for team-spec events.
-- Pairing rule: a full team (both slots) => is_confirmed + both 'confirmed';
-- a lone occupant => 'invited' (unpaired). "Remove from team" keeps players in the event.

-- Internal helper: recompute one team's is_confirmed + occupant statuses.
create or replace function _reconcile_team(p_team_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_a uuid; v_b uuid; v_full boolean;
begin
  select player_a_id, player_b_id into v_a, v_b from event_teams where id = p_team_id;
  v_full := (v_a is not null and v_b is not null);
  update event_teams set is_confirmed = v_full where id = p_team_id;
  if v_full then
    update event_participants
      set status='confirmed', confirmed_at=now(), waiting_list_position=null, is_standby=false
      where id in (v_a, v_b);
  elsif coalesce(v_a, v_b) is not null then
    update event_participants
      set status='invited', confirmed_at=null, waiting_list_position=null, is_standby=false
      where id = coalesce(v_a, v_b);
  end if;
end; $$;

-- Internal helper: remove a participant from whatever team slot it occupies (move semantics),
-- reconciling the vacated team (which may demote a now-lone partner to invited).
create or replace function _clear_team_slot(p_event_id uuid, p_participant_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_team_id uuid;
begin
  for v_team_id in
    select id from event_teams
    where event_id = p_event_id and (player_a_id = p_participant_id or player_b_id = p_participant_id)
  loop
    update event_teams set
      player_a_id = case when player_a_id = p_participant_id then null else player_a_id end,
      player_b_id = case when player_b_id = p_participant_id then null else player_b_id end
      where id = v_team_id;
    perform _reconcile_team(v_team_id);
  end loop;
end; $$;

create or replace function organizer_assign_to_team(
  p_event_id uuid, p_participant_id uuid, p_team_number int, p_slot text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype; v_team_id uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.specification <> 'team' then raise exception 'not_a_team_event' using errcode='P0001'; end if;
  if p_slot not in ('a','b') then raise exception 'invalid_slot' using errcode='P0001'; end if;
  if p_team_number < 1 or p_team_number > v_ev.num_courts * 2 then
    raise exception 'invalid_team' using errcode='P0001'; end if;
  if not exists (select 1 from event_participants where id = p_participant_id and event_id = p_event_id) then
    raise exception 'participant_not_found' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));

  perform _clear_team_slot(p_event_id, p_participant_id);

  select id into v_team_id from event_teams where event_id=p_event_id and team_number=p_team_number;
  if v_team_id is null then
    insert into event_teams (event_id, team_number, is_confirmed)
      values (p_event_id, p_team_number, false) returning id into v_team_id;
  end if;

  if p_slot = 'a' then
    update event_teams set player_a_id = p_participant_id where id = v_team_id;
  else
    update event_teams set player_b_id = p_participant_id where id = v_team_id;
  end if;

  perform _reconcile_team(v_team_id);
end; $$;

create or replace function organizer_remove_from_team(p_event_id uuid, p_participant_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));
  perform _clear_team_slot(p_event_id, p_participant_id);
  update event_participants
    set status='invited', confirmed_at=null, waiting_list_position=null, is_standby=false
    where id = p_participant_id and event_id = p_event_id;
end; $$;

create or replace function organizer_switch_players(p_event_id uuid, p_a uuid, p_b uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
        a_team uuid; a_slot text; b_team uuid; b_slot text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not is_event_organizer(p_event_id, v_user) then raise exception 'forbidden' using errcode='P0001'; end if;
  if p_a = p_b then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('event_roster:'||p_event_id::text, 0));

  select id, case when player_a_id=p_a then 'a' when player_b_id=p_a then 'b' end
    into a_team, a_slot from event_teams
    where event_id=p_event_id and (player_a_id=p_a or player_b_id=p_a);
  select id, case when player_a_id=p_b then 'a' when player_b_id=p_b then 'b' end
    into b_team, b_slot from event_teams
    where event_id=p_event_id and (player_a_id=p_b or player_b_id=p_b);

  -- write B into A's old slot, A into B's old slot (no-op if that player had no slot)
  if a_team is not null then
    if a_slot='a' then update event_teams set player_a_id=p_b where id=a_team;
    else update event_teams set player_b_id=p_b where id=a_team; end if;
  end if;
  if b_team is not null then
    if b_slot='a' then update event_teams set player_a_id=p_a where id=b_team;
    else update event_teams set player_b_id=p_a where id=b_team; end if;
  end if;

  if a_team is not null then perform _reconcile_team(a_team); end if;
  if b_team is not null and b_team is distinct from a_team then perform _reconcile_team(b_team); end if;

  -- either player now in no slot => invited
  update event_participants
    set status='invited', confirmed_at=null, waiting_list_position=null, is_standby=false
    where id in (p_a, p_b) and event_id=p_event_id
      and not exists (
        select 1 from event_teams
        where event_id=p_event_id
          and (player_a_id=event_participants.id or player_b_id=event_participants.id));
end; $$;

-- Internal helpers must not be client-callable.
revoke execute on function _reconcile_team(uuid), _clear_team_slot(uuid, uuid) from public;
grant execute on function organizer_assign_to_team(uuid, uuid, int, text),
  organizer_remove_from_team(uuid, uuid), organizer_switch_players(uuid, uuid, uuid) to authenticated;

-- Extend the 5G-2 activity allow-list with team actions (re-create the function with the
-- additional organizer actions; body otherwise identical to 0070).
create or replace function log_event_activity(
  p_event_id uuid, p_action text, p_detail jsonb default '{}'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_organizer_actions text[] := array[
    'confirmed','removed','guest_added','marked_paid','marked_unpaid','marked_all_paid',
    'team_assigned','team_switched','team_removed'];
  v_self_actions text[] := array['joined','left'];
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not (p_action = any(v_organizer_actions) or p_action = any(v_self_actions)) then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  if p_action = any(v_organizer_actions) then
    if not is_event_organizer(p_event_id, v_user) then
      raise exception 'forbidden' using errcode = 'P0001';
    end if;
  else
    if not event_is_visible(p_event_id, v_user) then
      raise exception 'forbidden' using errcode = 'P0001';
    end if;
  end if;
  insert into event_activity (event_id, actor_id, action, detail)
  values (p_event_id, v_user, p_action, coalesce(p_detail, '{}'::jsonb));
end; $$;
```

- [ ] **Step 2: Apply the migration**

Run: `export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token && pnpm dlx supabase@latest --workdir infra db reset`
Expected: applies through `0071` with no errors.

- [ ] **Step 3: Write the SQL test**

Create `infra/supabase/tests/organizer_team.sql` (template: `infra/supabase/tests/community_review_gate.sql` / `event_activity.sql` for the auth-switch + `PT001` pattern; seed the event + participants under role `postgres`, filling NOT-NULL `events` columns from `0040_events_core.sql` with `specification='team'`, `num_courts=1`). Seed organizer U1 (`a1…01`) and three confirmed-or-invited participants P1/P2/P3 belonging to the event (insert `event_participants` rows; capture their ids into variables).

Assertions (each `raise notice 'OK …'`; failures `raise exception using errcode='PT001'`), run as U1 (organizer jwt) unless noted:
1. `perform organizer_assign_to_team(ev, p1, 1, 'a');` → team 1 exists, `is_confirmed=false`; P1 `status='invited'`.
2. `perform organizer_assign_to_team(ev, p2, 1, 'b');` → team 1 `is_confirmed=true`; P1 and P2 both `status='confirmed'`.
3. `perform organizer_remove_from_team(ev, p1);` → team 1 `is_confirmed=false`, neither slot references P1; P1 `status='invited'` AND the partner P2 demoted to `status='invited'` (pair broken).
4. Re-pair: `organizer_assign_to_team(ev, p1, 1, 'a')` then `(ev, p2, 1, 'b')` → both confirmed again. Then
   `perform organizer_switch_players(ev, p2, p3);` where P3 was invited (no slot) → P3 now occupies P2's
   old slot and is `confirmed`; P2 now has no slot and is `invited`; team 1 still `is_confirmed=true`
   (P1 + P3).
5. As a non-organizer (set jwt to a second seeded user U2 who is not the organizer):
   `organizer_assign_to_team(ev, p1, 1, 'a')` must raise `forbidden` (nested begin/exception, re-raise
   PT001, assert sqlerrm contains 'forbidden').
6. End `raise notice 'OK organizer_team';` then `rollback;`.

- [ ] **Step 4: Run the SQL test**

Run: `docker exec -i supabase_db_padeljam psql -U postgres -d postgres < infra/supabase/tests/organizer_team.sql`
Expected: prints `OK organizer_team`, no `PT001`, no error. (If `db reset` flagged a missing NOT-NULL
events column, fill it from `0040`; do not weaken the migration.)

- [ ] **Step 5: Commit**

```bash
git add infra/supabase/migrations/0071_organizer_team_rpcs.sql infra/supabase/tests/organizer_team.sql
git commit -m "feat(events): organizer team-assignment RPCs (assign/remove/switch) (5G-3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Types + enriched `useEventTeams` + mutations

**Files:**
- Modify: `packages/db/src/database.types.ts`
- Modify: `packages/api/src/events/queries.ts`
- Modify: `packages/api/src/events/mutations.ts`

- [ ] **Step 1: Hand-add the RPC types**

In `packages/db/src/database.types.ts` `Functions` block, add (mirror existing void RPCs):

```ts
organizer_assign_to_team: {
  Args: { p_event_id: string; p_participant_id: string; p_team_number: number; p_slot: string }
  Returns: undefined
}
organizer_remove_from_team: { Args: { p_event_id: string; p_participant_id: string }; Returns: undefined }
organizer_switch_players: { Args: { p_event_id: string; p_a: string; p_b: string }; Returns: undefined }
```

(`_reconcile_team`/`_clear_team_slot` are internal — not client-callable, so no types needed. The existing
`event_teams` Row type and `log_event_activity` types are unchanged.)

- [ ] **Step 2: Enrich `useEventTeams`**

In `packages/api/src/events/queries.ts`, replace the `useEventTeams` body with the embedded version and add a `TeamRow` type:

```ts
export interface TeamSlotPlayer {
  id: string;
  user_id: string | null;
  guest_name: string | null;
  status: string;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
}
export interface TeamRow {
  id: string;
  team_number: number;
  is_confirmed: boolean;
  player_a: TeamSlotPlayer | null;
  player_b: TeamSlotPlayer | null;
}

export const useEventTeams = (id: string) => {
  const db = useDb();
  return useQuery({
    queryKey: qk.eventTeams(id),
    queryFn: async () => {
      const { data, error } = await db
        .from('event_teams')
        .select(
          'id, team_number, is_confirmed, ' +
            'player_a:event_participants!player_a_id (id, user_id, guest_name, status, profiles(full_name, avatar_url)), ' +
            'player_b:event_participants!player_b_id (id, user_id, guest_name, status, profiles(full_name, avatar_url))',
        )
        .eq('event_id', id)
        .order('team_number', { ascending: true })
        .returns<TeamRow[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
};
```

If the FK-hint embed (`event_participants!player_a_id`) does not resolve at typecheck/runtime, fall back to
the constraint name hint (`event_participants!event_teams_player_a_id_fkey`) — check the FK name in
`0041_events_roster.sql` and use whichever PostgREST accepts.

- [ ] **Step 3: Add the three mutations**

In `packages/api/src/events/mutations.ts`, add (the `logActivity` helper from 5G-2 already exists):

```ts
export const useAssignToTeam = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      participantId: string;
      teamNumber: number;
      slot: 'a' | 'b';
      targetName?: string;
    }) => {
      const { error } = await db.rpc('organizer_assign_to_team', {
        p_event_id: eventId,
        p_participant_id: input.participantId,
        p_team_number: input.teamNumber,
        p_slot: input.slot,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      await logActivity(db, eventId, 'team_assigned', {
        target_name: input.targetName,
        team_number: input.teamNumber,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.eventTeams(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventParticipants(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventActivity(eventId) });
    },
  });
};

export const useRemoveFromTeam = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { participantId: string; targetName?: string }) => {
      const { error } = await db.rpc('organizer_remove_from_team', {
        p_event_id: eventId,
        p_participant_id: input.participantId,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      await logActivity(db, eventId, 'team_removed', { target_name: input.targetName });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.eventTeams(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventParticipants(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventActivity(eventId) });
    },
  });
};

export const useSwitchPlayers = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { participantA: string; participantB: string }) => {
      const { error } = await db.rpc('organizer_switch_players', {
        p_event_id: eventId,
        p_a: input.participantA,
        p_b: input.participantB,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
      await logActivity(db, eventId, 'team_switched', {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.eventTeams(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventParticipants(eventId) });
      qc.invalidateQueries({ queryKey: qk.eventActivity(eventId) });
    },
  });
};
```

- [ ] **Step 4: Typecheck + test**

Run: `pnpm -w typecheck` (13/13) and `pnpm --filter @padel/api test`.
Expected: PASS. (If Step 2's embed fails typing, apply the constraint-name-hint fallback.)

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/database.types.ts packages/api/src/events/queries.ts packages/api/src/events/mutations.ts
git commit -m "feat(api): team-assignment types, enriched useEventTeams, assign/remove/switch mutations (5G-3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `TeamManage` component + manage branch + i18n + activity lines

**Files:**
- Create: `apps/mobile/components/event/TeamManage.tsx`
- Modify: `apps/mobile/app/event/[id]/manage.tsx`
- Modify: `apps/mobile/app/event/[id]/activity.tsx`
- Modify: `apps/mobile/lib/i18n-mobile.ts`

- [ ] **Step 1: Add i18n keys**

In `apps/mobile/lib/i18n-mobile.ts`, `mobileEvent.en` block, add:

```ts
    continue: 'Continue',
    teamViewTab: 'Teams',
    playerViewTab: 'Players',
    teamLabel: 'Team {{n}}',
    teamSlotEmpty: 'Add player',
    teamUnpaired: 'Unpaired',
    assignTitle: 'Assign a player',
    assignNoneEligible: 'No players available to assign.',
    assignConfirmTitle: 'Confirm player',
    assignConfirmBody: "{{name}} isn't confirmed. Adding them to a team will confirm them once the team is complete. Continue?",
    switchTitle: 'Switch with…',
    switchPlayerCta: 'Switch player',
    removeFromTeamCta: 'Remove from team',
    slotActionTitle: 'Player options',
    interestedTab: 'Interested',
    teamConfirmedCount: 'Confirmed {{confirmed}}/{{capacity}}',
    activityTeamAssigned: '{{actor}} assigned {{target}}',
    activityTeamSwitched: '{{actor}} switched players',
    activityTeamRemoved: '{{actor}} removed {{target}} from a team',
```

- [ ] **Step 2: Extend `activity.tsx` line map**

In `apps/mobile/app/event/[id]/activity.tsx`, add to the `key` map inside `lineFor`:

```ts
    team_assigned: 'activityTeamAssigned',
    team_switched: 'activityTeamSwitched',
    team_removed: 'activityTeamRemoved',
```

- [ ] **Step 3: Create `TeamManage.tsx`**

Create `apps/mobile/components/event/TeamManage.tsx`:

```tsx
import {
  useAssignToTeam,
  useEventTeams,
  useRemoveFromTeam,
  useRemoveParticipant,
  useSwitchPlayers,
  type TeamRow,
  type TeamSlotPlayer,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Participant = {
  id: string;
  user_id: string | null;
  guest_name: string | null;
  status: string;
  is_standby: boolean;
  profiles?: { full_name: string | null } | null;
};

type Slot = 'a' | 'b';

function pname(p: { profiles?: { full_name: string | null } | null; guest_name: string | null } | null): string {
  if (!p) return '';
  return p.profiles?.full_name ?? p.guest_name ?? '—';
}

export function TeamManage({
  eventId,
  numCourts,
  participants,
}: {
  eventId: string;
  numCourts: number;
  participants: Participant[];
}) {
  const { t } = useT('event');
  const { data: teams, isLoading } = useEventTeams(eventId);
  const assign = useAssignToTeam(eventId);
  const removeFromTeam = useRemoveFromTeam(eventId);
  const switchPlayers = useSwitchPlayers(eventId);
  const removeParticipant = useRemoveParticipant(eventId);

  const [view, setView] = useState<'team' | 'player'>('team');
  const [busy, setBusy] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{ teamNumber: number; slot: Slot } | null>(null);
  const [switchTarget, setSwitchTarget] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<
    { participant: Participant; teamNumber: number; slot: Slot } | null
  >(null);

  const capacity = numCourts * 4;
  const teamCount = numCourts * 2;
  const teamRows = teams ?? [];
  const teamByNumber = (n: number): TeamRow | undefined => teamRows.find((r) => r.team_number === n);

  // participant ids currently occupying any slot
  const occupied = new Set<string>();
  teamRows.forEach((r) => {
    if (r.player_a) occupied.add(r.player_a.id);
    if (r.player_b) occupied.add(r.player_b.id);
  });

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      Alert.alert(t(e instanceof Error ? e.message : 'unknown_error'));
    } finally {
      setBusy(false);
    }
  };

  const doAssign = (p: Participant, teamNumber: number, slot: Slot) => {
    setAssignTarget(null);
    setConfirmTarget(null);
    void run(() =>
      assign.mutateAsync({ participantId: p.id, teamNumber, slot, targetName: pname(p) }),
    );
  };

  const onPickForSlot = (p: Participant) => {
    if (!assignTarget) return;
    if (p.status !== 'confirmed') {
      setConfirmTarget({ participant: p, teamNumber: assignTarget.teamNumber, slot: assignTarget.slot });
      setAssignTarget(null);
    } else {
      doAssign(p, assignTarget.teamNumber, assignTarget.slot);
    }
  };

  const onSlotPress = (teamNumber: number, slot: Slot, occupant: TeamSlotPlayer | null) => {
    if (busy) return;
    if (!occupant) {
      setAssignTarget({ teamNumber, slot });
      return;
    }
    Alert.alert(t('slotActionTitle'), pname(occupant), [
      { text: t('switchPlayerCta'), onPress: () => setSwitchTarget(occupant.id) },
      {
        text: t('removeFromTeamCta'),
        style: 'destructive',
        onPress: () => run(() => removeFromTeam.mutateAsync({ participantId: occupant.id, targetName: pname(occupant) })),
      },
      { text: t('cancel'), style: 'cancel' },
    ]);
  };

  const onSwitchPick = (other: Participant) => {
    const a = switchTarget;
    setSwitchTarget(null);
    if (a && a !== other.id) {
      void run(() => switchPlayers.mutateAsync({ participantA: a, participantB: other.id }));
    }
  };

  if (isLoading) return <ActivityIndicator color="#0B1F3A" style={{ marginTop: 24 }} />;

  const assignable = participants.filter((p) => !occupied.has(p.id));
  const confirmedCount = participants.filter((p) => p.status === 'confirmed' && !p.is_standby).length;

  return (
    <View>
      {/* View toggle */}
      <View style={styles.toggle}>
        {(['team', 'player'] as const).map((v) => (
          <Pressable
            key={v}
            style={[styles.toggleItem, view === v ? styles.toggleItemActive : null]}
            onPress={() => setView(v)}
            accessibilityRole="button"
          >
            <Text style={[styles.toggleText, view === v ? styles.toggleTextActive : null]}>
              {t(v === 'team' ? 'teamViewTab' : 'playerViewTab')}
            </Text>
          </Pressable>
        ))}
      </View>

      {view === 'team' ? (
        <View style={styles.grid}>
          {Array.from({ length: teamCount }, (_, i) => i + 1).map((n) => {
            const row = teamByNumber(n);
            const unpaired = !!row && (!!row.player_a !== !!row.player_b);
            return (
              <View key={n} style={styles.teamBlock}>
                <View style={styles.teamHeader}>
                  <Text style={styles.teamTitle}>{t('teamLabel', { n })}</Text>
                  {unpaired ? <Text style={styles.unpaired}>{t('teamUnpaired')}</Text> : null}
                </View>
                {(['a', 'b'] as const).map((slot) => {
                  const occ = slot === 'a' ? (row?.player_a ?? null) : (row?.player_b ?? null);
                  return (
                    <Pressable
                      key={slot}
                      style={[styles.slot, occ ? styles.slotFilled : styles.slotEmpty]}
                      onPress={() => onSlotPress(n, slot, occ)}
                      accessibilityRole="button"
                      disabled={busy}
                    >
                      <Text style={occ ? styles.slotName : styles.slotEmptyText}>
                        {occ ? pname(occ) : t('teamSlotEmpty')}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </View>
      ) : (
        <PlayerView
          t={t}
          participants={participants}
          confirmedCount={confirmedCount}
          capacity={capacity}
          busy={busy}
          onRemove={(p) =>
            run(() => removeParticipant.mutateAsync({ participantId: p.id, mode: 'from_event', targetName: pname(p) }))
          }
        />
      )}

      {/* Assign sheet */}
      <Modal visible={assignTarget != null} transparent animationType="slide" onRequestClose={() => setAssignTarget(null)}>
        <Pressable style={styles.backdrop} onPress={() => setAssignTarget(null)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t('assignTitle')}</Text>
            {assignable.length === 0 ? (
              <Text style={styles.sheetEmpty}>{t('assignNoneEligible')}</Text>
            ) : (
              <ScrollView>
                {assignable.map((p) => (
                  <Pressable key={p.id} style={styles.sheetRow} onPress={() => onPickForSlot(p)} accessibilityRole="button">
                    <Text style={styles.sheetRowText}>{pname(p)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* Switch sheet */}
      <Modal visible={switchTarget != null} transparent animationType="slide" onRequestClose={() => setSwitchTarget(null)}>
        <Pressable style={styles.backdrop} onPress={() => setSwitchTarget(null)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t('switchTitle')}</Text>
            <ScrollView>
              {participants
                .filter((p) => p.id !== switchTarget)
                .map((p) => (
                  <Pressable key={p.id} style={styles.sheetRow} onPress={() => onSwitchPick(p)} accessibilityRole="button">
                    <Text style={styles.sheetRowText}>{pname(p)}</Text>
                  </Pressable>
                ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Confirm-player modal (JM-30) */}
      <Modal visible={confirmTarget != null} transparent animationType="fade" onRequestClose={() => setConfirmTarget(null)}>
        <View style={styles.backdropCenter}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{t('assignConfirmTitle')}</Text>
            <Text style={styles.dialogBody}>
              {t('assignConfirmBody', { name: confirmTarget ? pname(confirmTarget.participant) : '' })}
            </Text>
            <View style={styles.dialogRow}>
              <Pressable style={[styles.dialogBtn, styles.dialogCancel]} onPress={() => setConfirmTarget(null)} accessibilityRole="button">
                <Text style={styles.dialogCancelText}>{t('cancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.dialogBtn, styles.dialogOk]}
                onPress={() =>
                  confirmTarget && doAssign(confirmTarget.participant, confirmTarget.teamNumber, confirmTarget.slot)
                }
                accessibilityRole="button"
              >
                <Text style={styles.dialogOkText}>{t('continue')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function PlayerView({
  t,
  participants,
  confirmedCount,
  capacity,
  busy,
  onRemove,
}: {
  t: (k: string, o?: Record<string, unknown>) => string;
  participants: Participant[];
  confirmedCount: number;
  capacity: number;
  busy: boolean;
  onRemove: (p: Participant) => void;
}) {
  const [tab, setTab] = useState<'confirmed' | 'interested' | 'invited'>('confirmed');
  const groups = {
    confirmed: participants.filter((p) => p.status === 'confirmed'),
    interested: participants.filter((p) => p.status === 'interested'),
    invited: participants.filter((p) => p.status === 'invited'),
  };
  const tabs: { key: 'confirmed' | 'interested' | 'invited'; label: string }[] = [
    { key: 'confirmed', label: t('teamConfirmedCount', { confirmed: confirmedCount, capacity }) },
    { key: 'interested', label: `${t('interestedTab')} (${groups.interested.length})` },
    { key: 'invited', label: `${t('rosterInvitedSection')} (${groups.invited.length})` },
  ];
  return (
    <View>
      <View style={styles.tabs}>
        {tabs.map((tb) => (
          <Pressable key={tb.key} style={[styles.tab, tab === tb.key ? styles.tabActive : null]} onPress={() => setTab(tb.key)} accessibilityRole="button">
            <Text style={[styles.tabText, tab === tb.key ? styles.tabTextActive : null]} numberOfLines={1}>
              {tb.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {groups[tab].map((p) => (
        <View key={p.id} style={styles.pvRow}>
          <Text style={styles.pvName} numberOfLines={1}>{pname(p)}</Text>
          <Pressable style={styles.pvRemove} disabled={busy} onPress={() => onRemove(p)} accessibilityRole="button">
            <Text style={styles.pvRemoveText}>{t('removeCta')}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { flexDirection: 'row', backgroundColor: '#EEF1F6', borderRadius: 10, padding: 3, marginHorizontal: 16, marginTop: 16 },
  toggleItem: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  toggleItemActive: { backgroundColor: '#fff' },
  toggleText: { fontSize: 14, fontWeight: '600', color: '#6B7685' },
  toggleTextActive: { color: '#0B1F3A' },

  grid: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  teamBlock: { backgroundColor: '#fff', borderRadius: 12, padding: 12, gap: 8 },
  teamHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  teamTitle: { fontSize: 14, fontWeight: '700', color: '#0B1F3A' },
  unpaired: { fontSize: 12, fontWeight: '600', color: '#C77700' },
  slot: { minHeight: 44, borderRadius: 10, justifyContent: 'center', paddingHorizontal: 12 },
  slotFilled: { backgroundColor: '#EEF4FF' },
  slotEmpty: { backgroundColor: '#F4F6FA', borderWidth: StyleSheet.hairlineWidth, borderColor: '#D9E0EA', borderStyle: 'dashed' },
  slotName: { fontSize: 15, fontWeight: '600', color: '#0B1F3A' },
  slotEmptyText: { fontSize: 14, color: '#8A95A5' },

  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 16 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#EEF1F6', alignItems: 'center' },
  tabActive: { backgroundColor: '#0B7BFF' },
  tabText: { fontSize: 12, fontWeight: '700', color: '#6B7685' },
  tabTextActive: { color: '#fff' },
  pvRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  pvName: { flex: 1, fontSize: 15, color: '#0B1F3A', fontWeight: '500' },
  pvRemove: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: '#F0F3F8' },
  pvRemoveText: { fontSize: 13, fontWeight: '600', color: '#D7263D' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  backdropCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', paddingHorizontal: 24 },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, maxHeight: '70%' },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#0B1F3A', marginBottom: 12 },
  sheetEmpty: { fontSize: 15, color: '#6B7685', paddingVertical: 12 },
  sheetRow: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EEF1F6' },
  sheetRowText: { fontSize: 16, color: '#0B1F3A' },

  dialog: { backgroundColor: '#fff', borderRadius: 16, padding: 20, gap: 12 },
  dialogTitle: { fontSize: 18, fontWeight: '700', color: '#0B1F3A' },
  dialogBody: { fontSize: 15, color: '#3A4452', lineHeight: 21 },
  dialogRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  dialogBtn: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dialogCancel: { backgroundColor: '#F0F3F8' },
  dialogCancelText: { fontSize: 15, fontWeight: '600', color: '#0B1F3A' },
  dialogOk: { backgroundColor: '#0B7BFF' },
  dialogOkText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
```

Note: this also uses existing `mobileEvent.en` keys `cancel`, `removeCta`, `rosterInvitedSection`,
`unknown_error`, `noRoster` — verify they're present (they're already used by `manage.tsx`). `continue` is
added to `mobileEvent.en` in Step 1 above (the auth namespace's `continue` is a different namespace).

- [ ] **Step 4: Branch `manage.tsx` to render `TeamManage` for team events**

In `apps/mobile/app/event/[id]/manage.tsx`:
- Import: `import { TeamManage } from '@/components/event/TeamManage';`
- Replace the Roster block (the `{!hasRoster ? … : <> … </>}` region, lines ~288-347) with:
  ```tsx
  {event.specification === 'team' ? (
    <TeamManage eventId={id} numCourts={event.num_courts} participants={participants} />
  ) : !hasRoster ? (
    <View style={styles.section}><Text style={styles.empty}>{t('noRoster')}</Text></View>
  ) : (
    <>
      {/* …existing confirmed/invited/waiting/standby sections unchanged… */}
    </>
  )}
  ```
  Keep the header stats, Add-manual form, Activity-log, and Duplicate sections as-is (they apply to team
  events too — a manually-added guest becomes assignable).

- [ ] **Step 5: Typecheck**

Run: `pnpm -w typecheck`
Expected: PASS (13 packages). Resolve any missing-i18n-key or import-path issues (`@/components/...` alias
is configured — confirm other screens import via `@/lib/...`).

- [ ] **Step 6: Commit**

```bash
git add "apps/mobile/components/event/TeamManage.tsx" "apps/mobile/app/event/[id]/manage.tsx" "apps/mobile/app/event/[id]/activity.tsx" apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(events): team-management UI (Team/Player views, assign/switch/remove) (5G-3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verification (whole slice)

1. **DB:** `db reset` clean; `psql < infra/supabase/tests/organizer_team.sql` prints `OK organizer_team`.
2. **Types/API:** `pnpm -w typecheck` 13/13; `pnpm --filter @padel/api test` passes.
3. **App smoke (simulator):** on a `specification='team'` event as organizer — Team view shows
   `num_courts×2` blocks; tap an empty slot → assign sheet → pick an invited player → confirm modal →
   assigned (team unpaired, player invited); fill the 2nd slot → both confirmed, team shows no "Unpaired";
   tap a filled slot → Switch (pick an invited player → they swap in & confirm, displaced → invited) and
   Remove from team (partner demoted); Player view tabs show Confirmed/Interested/Invited counts; entries
   appear in the Activity log.

## Notes for the implementer

- **Internal helpers** `_reconcile_team`/`_clear_team_slot` are revoked from `public` and never called from
  the client — only from the three SECURITY DEFINER RPCs.
- The fixed `num_courts×2` grid bounds capacity at `num_courts*4`, so no extra capacity check is needed.
- Best-effort `logActivity` (from 5G-2) must stay after the `if (error) throw` line in each mutation.
- Migration number is `0071` (next after `0070`); no new npm dependency.
- Rotation (non-team) events render exactly as before — only the team branch is new.
