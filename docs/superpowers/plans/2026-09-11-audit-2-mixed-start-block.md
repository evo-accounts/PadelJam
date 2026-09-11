# Mixed Start Block (E5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A mixed event cannot start unless every confirmed player has a gender and men and women are equal in number; the organizer sees the counts before tapping Start.

**Architecture:** One migration redefines `start_event` with the gender check placed before the capacity check. The participant query embeds `gender`, a pure helper counts the roster, and the event detail screen renders a banner and disables Start. The RPC codes are mapped as the fallback. Gender-aware pairing is out of scope.

**Tech Stack:** PLpgSQL, Node 22 RPC tests (harness from the archive-guard plan), TypeScript, vitest, react-native, i18next.

**Spec:** `docs/superpowers/specs/2026-09-11-audit-content-seed-design.md` section 2.

**Prerequisites:** local stack running (see the archive-guard plan). `infra/supabase/tests/lib.mjs` exists (merged with the archive-guard PR). If it is missing, create it with the content shown in Task 1 of `docs/superpowers/plans/2026-09-11-audit-1-archive-guard.md` before starting. Branch: `git fetch origin && git checkout -b feat/mixed-start-block origin/main`.

---

### Task 1: Failing RPC test

**Files:**
- Create: `infra/supabase/tests/mixed-start.test.mjs`

- [ ] **Step 1: Write the test**

```js
// infra/supabase/tests/mixed-start.test.mjs
import { user, rpc, sel, insert, expectError, assert, run } from './lib.mjs';

const hoursFromNow = (h) => new Date(Date.now() + h * 3600_000).toISOString();

async function communityAndGroup(owner) {
  const communityId = await rpc(owner.jwt, 'create_community_with_personal_tenant', {
    p_name: 'Mixed Club', p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  const [general] = await sel('groups', `community_id=eq.${communityId}&is_general=eq.true&select=id`);
  return general.id;
}

const payload = (groupId, over) => ({
  group_id: groupId, event_type: 'americano', specification: 'mixed', scoring_mode: 'points', scoring_value: 24,
  organizer_role: 'organizing_only', name: 'Mixed', venue_id: null,
  manual_location_name: 'Arena', manual_location_address: null, has_location: true,
  location_lat: null, location_lng: null, location_text: null,
  num_courts: 1, starts_at: hoursFromNow(48), duration_minutes: 90, allow_standby: false, standby_spots: null,
  is_private: false, players_submit_results: false,
  entrance_fee_enabled: false, entrance_fee_amount: null, entrance_fee_method: null, entrance_fee_mba_number: null,
  description: null, thumbnail_path: null, series: null, invitees: null, court_ids: null, ...over,
});

await run('unbalanced mixed roster is refused before the capacity check', async () => {
  const org = await user('org');
  const groupId = await communityAndGroup(org);
  const players = [];
  for (const [i, g] of ['male', 'male', 'male', 'male', 'female', 'female', 'female'].entries()) {
    players.push(await user(`p${i}`, { gender: g }));
  }
  const eventId = await rpc(org.jwt, 'create_event', { p_payload: payload(groupId, { num_courts: 2 }) });
  for (const p of players) {
    await rpc(p.jwt, 'join_group', { p_group_id: groupId });   // public group: joining also adds community membership
    await rpc(p.jwt, 'join_event', { p_event_id: eventId });
  }
  // 7 confirmed on 2 courts would be setup_incomplete; the gender problem must win.
  await expectError(() => rpc(org.jwt, 'start_event', { p_event_id: eventId }), 'mixed_unbalanced');
  const [ev] = await sel('events', `id=eq.${eventId}&select=status`);
  assert(ev.status === 'scheduled', 'event still scheduled');
});

await run('balanced mixed roster starts', async () => {
  const org = await user('org2');
  const groupId = await communityAndGroup(org);
  const players = [];
  for (const [i, g] of ['male', 'male', 'female', 'female'].entries()) players.push(await user(`q${i}`, { gender: g }));
  const eventId = await rpc(org.jwt, 'create_event', { p_payload: payload(groupId, {}) });
  for (const p of players) {
    await rpc(p.jwt, 'join_group', { p_group_id: groupId });   // public group: joining also adds community membership
    await rpc(p.jwt, 'join_event', { p_event_id: eventId });
  }
  await rpc(org.jwt, 'start_event', { p_event_id: eventId });
  const [ev] = await sel('events', `id=eq.${eventId}&select=status`);
  assert(ev.status === 'in_progress', 'event started');
});

await run('a confirmed guest without gender blocks the start', async () => {
  const org = await user('org3');
  const groupId = await communityAndGroup(org);
  const players = [];
  for (const [i, g] of ['male', 'female', 'female'].entries()) players.push(await user(`r${i}`, { gender: g }));
  const eventId = await rpc(org.jwt, 'create_event', { p_payload: payload(groupId, {}) });
  for (const p of players) {
    await rpc(p.jwt, 'join_group', { p_group_id: groupId });   // public group: joining also adds community membership
    await rpc(p.jwt, 'join_event', { p_event_id: eventId });
  }
  // add_manual_participant enforces gender on mixed events, so the null-gender row is inserted directly.
  await insert('event_participants', { event_id: eventId, guest_name: 'Guest', status: 'confirmed', confirmed_at: new Date().toISOString(), invited_by: org.id });
  await expectError(() => rpc(org.jwt, 'start_event', { p_event_id: eventId }), 'mixed_gender_missing');
});

await run('classic events are untouched', async () => {
  const org = await user('org4');
  const groupId = await communityAndGroup(org);
  const players = [];
  for (const i of [0, 1, 2, 3]) players.push(await user(`s${i}`, { gender: 'male' }));
  const eventId = await rpc(org.jwt, 'create_event', { p_payload: payload(groupId, { specification: 'classic' }) });
  for (const p of players) {
    await rpc(p.jwt, 'join_group', { p_group_id: groupId });   // public group: joining also adds community membership
    await rpc(p.jwt, 'join_event', { p_event_id: eventId });
  }
  await rpc(org.jwt, 'start_event', { p_event_id: eventId });
  const [ev] = await sel('events', `id=eq.${eventId}&select=status`);
  assert(ev.status === 'in_progress', 'classic event started');
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node infra/supabase/tests/mixed-start.test.mjs`
Expected: first case fails with `expected error containing "mixed_unbalanced", got: ... setup_incomplete`.

---

### Task 2: Migration

**Files:**
- Create: `infra/supabase/migrations/0092_start_event_mixed_guard.sql`

The body below is the current `start_event` from `0048_match_engine_rpcs.sql` lines 90 to 180 with the mixed block inserted after the status check. Keep everything else byte-for-byte.

- [ ] **Step 1: Write the migration**

```sql
-- create-event.md line 54: a mixed event pairs one man with one woman, so it cannot start with
-- unequal counts or unknown genders. The check runs BEFORE the capacity check so the organizer
-- sees the gender problem rather than setup_incomplete.
create or replace function start_event(p_event_id uuid, p_rounds jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_ev events%rowtype;
  v_confirmed int;
  v_teams int;
  v_play int;
  v_ordered uuid[];
  v_rest uuid[];
  v_round_id uuid;
  v_round jsonb;
  v_rest_pid text;
  v_rn int;
  v_men int;
  v_women int;
  v_unknown int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.status <> 'scheduled' then raise exception 'event_not_scheduled' using errcode='P0001'; end if;

  perform pg_advisory_xact_lock(hashtextextended('event:'||p_event_id::text, 0));

  if v_ev.specification = 'mixed' then
    select
      count(*) filter (where coalesce(pr.gender, ep.guest_gender) = 'male'),
      count(*) filter (where coalesce(pr.gender, ep.guest_gender) = 'female'),
      count(*) filter (where coalesce(pr.gender, ep.guest_gender) is null)
      into v_men, v_women, v_unknown
    from event_participants ep
    left join profiles pr on pr.id = ep.user_id
    where ep.event_id = p_event_id and ep.status = 'confirmed';
    if v_unknown > 0 then raise exception 'mixed_gender_missing' using errcode='P0001'; end if;
    if v_men <> v_women then raise exception 'mixed_unbalanced' using errcode='P0001'; end if;
  end if;

  select count(*) into v_confirmed from event_participants
    where event_id = p_event_id and status = 'confirmed';
  if v_confirmed < v_ev.num_courts * 4 then raise exception 'setup_incomplete' using errcode='P0001'; end if;
  if v_ev.specification = 'team' then
    select count(*) into v_teams from event_teams where event_id = p_event_id and is_confirmed;
    if v_teams < v_ev.num_courts * 2 then raise exception 'setup_incomplete' using errcode='P0001'; end if;
  end if;

  update events set status = 'in_progress' where id = p_event_id;

  if p_rounds is not null and jsonb_typeof(p_rounds) = 'array' then
    -- Client-built schedule (Americano / Up&Down bootstrapped client-side).
    for v_round in select * from jsonb_array_elements(p_rounds) loop
      v_rn := (v_round->>'round_number')::int;
      insert into event_rounds (event_id, round_number, status, generated_at)
      values (p_event_id, v_rn,
              case when v_rn = 1 then 'active' else 'pending' end, now())
      returning id into v_round_id;
      perform _persist_round_matches(p_event_id, v_round_id, v_round->'matches');
      for v_rest_pid in select * from jsonb_array_elements_text(coalesce(v_round->'rests','[]'::jsonb)) loop
        insert into round_rest (round_id, participant_id) values (v_round_id, v_rest_pid::uuid);
      end loop;
    end loop;
    return;
  end if;

  -- Server-side bootstrap of ROUND 1 (Mexicano, or any type without a client schedule).
  -- Seed order: non-standby first then standby; within each, by group-ranking
  -- (sum ranking_points desc in the group's OPEN season) when grouped, else random.
  if v_ev.group_id is not null then
    select array_agg(p.id order by p.is_standby asc, coalesce(gr.pts,0) desc, p.joined_at asc)
      into v_ordered
    from event_participants p
    left join (
      select ger.user_id, sum(ger.ranking_points) pts
      from group_event_results ger
      join group_seasons gs on gs.id = ger.group_season_id
      where gs.group_id = v_ev.group_id and gs.ended_at is null
      group by ger.user_id
    ) gr on gr.user_id = p.user_id
    where p.event_id = p_event_id and p.status = 'confirmed';
  else
    select array_agg(p.id order by p.is_standby asc, random())
      into v_ordered
    from event_participants p
    where p.event_id = p_event_id and p.status = 'confirmed';
  end if;

  -- Playing set = largest multiple of 4 that fits courts and confirmed count.
  v_play := least(v_ev.num_courts * 4, (array_length(v_ordered,1) / 4) * 4);
  -- Tail rests this round.
  if array_length(v_ordered,1) > v_play then
    v_rest := v_ordered[v_play+1 : array_length(v_ordered,1)];
  end if;

  insert into event_rounds (event_id, round_number, status, generated_at)
  values (p_event_id, 1, 'active', now())
  returning id into v_round_id;

  perform _persist_round_matches(p_event_id, v_round_id,
    _build_fours_arrangement((v_ordered)[1:v_play]));

  if v_rest is not null then
    insert into round_rest (round_id, participant_id)
    select v_round_id, unnest(v_rest);
  end if;
end; $$;
```

- [ ] **Step 2: Diff against the original to prove nothing else changed**

Run:
```bash
sed -n 90,180p infra/supabase/migrations/0048_match_engine_rpcs.sql > /tmp/start_event_old.sql
diff /tmp/start_event_old.sql infra/supabase/migrations/0092_start_event_mixed_guard.sql
```
Expected: only the header comment, the three new `v_men/v_women/v_unknown` declarations, and the mixed block appear as additions.

- [ ] **Step 3: Apply and run the test**

Run:
```bash
pnpm dlx supabase@latest --workdir infra db reset
node infra/supabase/tests/mixed-start.test.mjs
```
Expected: four `✔`.

- [ ] **Step 4: Commit**

```bash
git add infra/supabase/migrations/0092_start_event_mixed_guard.sql infra/supabase/tests/mixed-start.test.mjs
git commit -m "feat(db): a mixed event cannot start with unequal or unknown genders"
```

---

### Task 3: Error mapping

**Files:**
- Modify: `packages/api/src/client.ts` (events lines of `KNOWN`)
- Modify: `packages/api/src/client.test.ts`

- [ ] **Step 1: Extend the test**

Add inside the `describe('mapPgError')` block:

```ts
  it('maps the mixed start guards', () => {
    expect(mapPgError({ message: 'mixed_unbalanced' })).toBe('mixed_unbalanced');
    expect(mapPgError({ message: 'mixed_gender_missing' })).toBe('mixed_gender_missing');
  });
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm --filter @padel/api test -- client.test.ts`
Expected: the new case fails with `unknown_error`.

- [ ] **Step 3: Add the codes**

In `KNOWN`, change the line that starts with `'setup_incomplete'` to:

```ts
  'setup_incomplete', 'mixed_unbalanced', 'mixed_gender_missing', 'round_not_scored', 'round_exists', 'event_not_scheduled',
```

- [ ] **Step 4: Run, expect pass, commit**

Run: `pnpm --filter @padel/api test -- client.test.ts`
Expected: all passed.

```bash
git add packages/api/src/client.ts packages/api/src/client.test.ts
git commit -m "feat(api): map the mixed start guards"
```

---

### Task 4: Gender in the participant embed

**Files:**
- Modify: `packages/api/src/events/queries.ts:7` and `:15-16`
- Modify: `packages/api/src/events/queries.test.ts`

- [ ] **Step 1: Extend the embed test**

Add to `packages/api/src/events/queries.test.ts` inside the existing describe for `PARTICIPANT_PROFILE_EMBED`:

```ts
  it('embeds gender so mixed rosters can be counted', () => {
    expect(PARTICIPANT_PROFILE_EMBED).toContain('gender');
  });
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm --filter @padel/api test -- events/queries.test.ts`

- [ ] **Step 3: Change the embed and its type**

```ts
type ProfileEmbed = { id: string; full_name: string | null; avatar_url: string | null; gender: string | null } | null;
```

```ts
export const PARTICIPANT_PROFILE_EMBED =
  'profiles!event_participants_user_id_fkey(id, full_name, avatar_url, gender)';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @padel/api test && pnpm typecheck`
Expected: green. (Every consumer of the embed only reads the three old fields, so adding one is additive.)

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/events/queries.ts packages/api/src/events/queries.test.ts
git commit -m "feat(api): participant embed carries gender"
```

---

### Task 5: Pure roster-balance helper

**Files:**
- Create: `apps/mobile/lib/mixedBalance.ts`
- Create: `apps/mobile/lib/mixedBalance.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/lib/mixedBalance.test.ts
import { describe, expect, it } from 'vitest';
import { mixedBalance } from './mixedBalance';

const row = (status: string, gender: string | null, guest = false) => ({
  status,
  guest_gender: guest ? gender : null,
  profiles: guest ? null : { gender },
});

describe('mixedBalance', () => {
  it('counts confirmed players by gender, members and guests alike', () => {
    const r = mixedBalance([
      row('confirmed', 'male'), row('confirmed', 'female'), row('confirmed', 'female', true),
      row('waiting_list', 'male'), row('invited', 'female'),
    ]);
    expect(r).toEqual({ men: 1, women: 2, unknown: 0, balanced: false });
  });
  it('is balanced when counts match and nobody is unknown', () => {
    expect(mixedBalance([row('confirmed', 'male'), row('confirmed', 'female')]).balanced).toBe(true);
  });
  it('treats a missing gender as unknown and unbalanced', () => {
    const r = mixedBalance([row('confirmed', 'male'), row('confirmed', null)]);
    expect(r).toEqual({ men: 1, women: 0, unknown: 1, balanced: false });
  });
  it('an empty roster is balanced (the capacity check reports it, not this one)', () => {
    expect(mixedBalance([]).balanced).toBe(true);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm --filter mobile test -- mixedBalance`
Expected: fails, module not found.

- [ ] **Step 3: Implement**

```ts
// apps/mobile/lib/mixedBalance.ts
/**
 * Count a mixed event's CONFIRMED roster by gender. Mirrors the server check in
 * start_event (migration 0092): members use profiles.gender, guests use guest_gender.
 */
export type MixedBalance = { men: number; women: number; unknown: number; balanced: boolean };

type RosterRow = {
  status: string;
  guest_gender: string | null;
  profiles: { gender: string | null } | null;
};

export function mixedBalance(rows: RosterRow[]): MixedBalance {
  let men = 0;
  let women = 0;
  let unknown = 0;
  for (const r of rows) {
    if (r.status !== 'confirmed') continue;
    const g = r.profiles?.gender ?? r.guest_gender;
    if (g === 'male') men++;
    else if (g === 'female') women++;
    else unknown++;
  }
  return { men, women, unknown, balanced: unknown === 0 && men === women };
}
```

- [ ] **Step 4: Run, expect pass, commit**

Run: `pnpm --filter mobile test -- mixedBalance`
Expected: 4 passed.

```bash
git add apps/mobile/lib/mixedBalance.ts apps/mobile/lib/mixedBalance.test.ts
git commit -m "feat(mobile): count a mixed roster by gender"
```

---

### Task 6: Banner and disabled Start on the detail screen

**Files:**
- Modify: `apps/mobile/app/event/[id]/index.tsx` (imports at top; setup gate near line 150; organizer CTA block near lines 330 to 355)
- Modify: `apps/mobile/lib/i18n-mobile.ts` (`mobileEvent` namespace, three locales; anchors: `startSetupIncomplete` at lines 1670, 2110, 2550 and `setup_incomplete` at lines 1492, 1932, 2372)

- [ ] **Step 1: Import the helper**

After `import { useNow } from '@/lib/useNow';` add:

```ts
import { mixedBalance } from '@/lib/mixedBalance';
```

- [ ] **Step 2: Compute the gate**

Directly after the `setupComplete` declaration (the block that ends with `confirmedTeamCount >= event.num_courts * 2);`) add:

```ts
  // Mixed events also need equal men and women with no unknown gender (start_event, migration 0092).
  const mixed = event.specification === 'mixed' ? mixedBalance(participants) : null;
  const mixedBlocked = mixed != null && !mixed.balanced;
```

- [ ] **Step 3: Render the banner and disable Start**

Replace the Start button and its hint inside the organizer `cta` block:

```tsx
        <Button
          label={t('startCta')}
          loading={busy}
          disabled={!setupComplete || mixedBlocked}
          onPress={onStart}
        />
        {mixedBlocked ? (
          <Text style={styles.startHint} accessibilityRole="alert">
            {mixed.unknown > 0
              ? t('mixedGenderMissingHint', { count: mixed.unknown })
              : t('mixedUnbalancedHint', { men: mixed.men, women: mixed.women })}
          </Text>
        ) : null}
        {!setupComplete ? (
          <Text style={styles.startHint}>
            {t('startSetupIncomplete', { needed: event.num_courts * 4 })}
          </Text>
        ) : null}
```

- [ ] **Step 4: Add the copy**

In `mobileEvent`, next to `startSetupIncomplete` in each locale:

pt-PT:
```ts
    mixedUnbalancedHint: 'Eventos mistos precisam de números iguais: {{men}} homens, {{women}} mulheres',
    mixedGenderMissingHint_one: '{{count}} jogador confirmado não tem género definido',
    mixedGenderMissingHint_other: '{{count}} jogadores confirmados não têm género definido',
```
pt-BR:
```ts
    mixedUnbalancedHint: 'Eventos mistos precisam de números iguais: {{men}} homens, {{women}} mulheres',
    mixedGenderMissingHint_one: '{{count}} jogador confirmado não tem gênero definido',
    mixedGenderMissingHint_other: '{{count}} jogadores confirmados não têm gênero definido',
```
en:
```ts
    mixedUnbalancedHint: 'Mixed events need equal numbers: {{men}} men, {{women}} women',
    mixedGenderMissingHint_one: '{{count}} confirmed player has no gender set',
    mixedGenderMissingHint_other: '{{count}} confirmed players have no gender set',
```

And next to `setup_incomplete` in each locale (the RPC fallback):

pt-PT:
```ts
    mixed_unbalanced: 'Um evento misto precisa do mesmo número de homens e mulheres.',
    mixed_gender_missing: 'Todos os jogadores confirmados precisam de ter género definido.',
```
pt-BR:
```ts
    mixed_unbalanced: 'Um evento misto precisa do mesmo número de homens e mulheres.',
    mixed_gender_missing: 'Todos os jogadores confirmados precisam ter gênero definido.',
```
en:
```ts
    mixed_unbalanced: 'A mixed event needs the same number of men and women.',
    mixed_gender_missing: 'Every confirmed player needs a gender set.',
```

- [ ] **Step 5: Check**

Run: `pnpm i18n:check && pnpm --filter mobile typecheck && pnpm --filter mobile lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add "apps/mobile/app/event/[id]/index.tsx" apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(mobile): block starting an unbalanced mixed event and say why"
```

---

### Task 7: Simulator check and PR

- [ ] **Step 1: Seed a reproduction and look at it**

Run the E2E seed on the local stack (`pnpm seed:e2e` after `db reset`) and, as the organizer of any scheduled event, use the manage screen to add manual participants: on a mixed event add 3 men and 1 woman. Open the event detail. Expected: Start disabled, banner reads "Mixed events need equal numbers: 3 men, 1 women". Add a woman: banner disappears, Start enabled.

If there is no mixed event in the E2E seed, create one through the wizard (Specification: Mixed).

- [ ] **Step 2: Repo checks**

Run: `pnpm lint && pnpm typecheck && pnpm i18n:check && pnpm test`

- [ ] **Step 3: PR**

```bash
git push -u origin feat/mixed-start-block
gh pr create --title "feat: a mixed event cannot start with unequal or unknown genders" --body "$(cat <<'EOF'
Implements section 2 of docs/superpowers/specs/2026-09-11-audit-content-seed-design.md.

- 0092: start_event raises mixed_gender_missing / mixed_unbalanced before the capacity check
- participant embed carries gender; mixedBalance() counts the roster; detail screen shows the counts and disables Start
- RPC codes mapped and translated as the fallback

Out of scope, recorded in the spec: gender-aware pairing inside rounds.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
