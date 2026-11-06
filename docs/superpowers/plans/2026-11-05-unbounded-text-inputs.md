# Bound `set_my_location` and `register_push_token` inputs (PAD-163)

Status: approved by the CTO, 2026-11-05. Finding from the PAD-156 audit. Severity: low.

## Problem

Any signed-in user can store 100,000 characters in `profiles.location_text` (served with every
profile read) and in `push_tokens.expo_token` (sent to Expo by `send-push`). `set_my_location` also
accepts coordinates outside the valid range and lets PostGIS clamp them.

## Dependency

**Start from `main` only after #320 (PAD-133) has merged.** Its migration 0149 redefines
`set_my_location` to round coordinates to 2 decimals. Copy that body. Losing the rounding would
reopen PAD-133. Take the next free migration number at that point (0150 unless another fix took it).

## Decisions

- **Validate in the two functions. No table constraints.** Both functions are the only client path
  to these columns: 0120 removed client writes to `location_text`, and `push_tokens` has no insert or
  update policy. A `check` constraint would add nothing a client can reach, and could fail the
  automatic hosted apply if an old row is over the limit, or fail unrelated updates to that row if
  added `not valid`.
- **Existing rows stay as they are.** The migration changes no data.
- **Accept both Expo prefixes.** `ExponentPushToken[...]` and `ExpoPushToken[...]` are both valid
  Expo formats. The finding names only the first; accepting only that could turn away a real device.
- **Limits:** location text 200 characters (`char_length`), token 300.

## Build

### 1. Migration `infra/supabase/migrations/0150_bound_location_and_push_token.sql`

Both are `create or replace` with the same signature, so grants are unchanged. No `delete` or `drop`,
so the migrations workflow applies it on merge.

`set_my_location` becomes `plpgsql`, `security definer`, `set search_path = public, pg_temp`. Before
the update, in this order:

- `char_length(p_text) > 200` → raise `location_text_too_long` (`errcode 'P0001'`). Null text stays allowed.
- If both coordinates are non-null and `p_lat not between -90 and 90 or p_lng not between -180 and 180`
  → raise `invalid_coordinates`. Postgres sorts `NaN` above every number, so this also rejects `NaN`
  and `Infinity`; the test must prove it, since PostgREST can pass them as strings.

Then 0149's update, unchanged: a null coordinate still clears the point, and the rest is rounded.

`register_push_token` keeps the same body and platform check first (the existing test relies on
`invalid_platform` for `('x','windows')`). Replace the token check with:

```sql
if p_expo_token is null
   or char_length(p_expo_token) > 300
   or p_expo_token !~ '^Expo(nent)?PushToken\[[^\[\]\s]+\]$' then
  raise exception 'invalid_token' using errcode='P0001';
end if;
```

The explicit null test matters: `null !~ ...` is null, and `if null` would skip the raise. Pin its
`search_path` to `public, pg_temp` as well.

### 2. Client cap, so current builds never hit the new error

Add `LOCATION_TEXT_MAX = 200` to `packages/config/src/constants.ts`, with a comment naming the
migration, as `SUPPORT_TITLE_MAX` does.

In `useSetMyLocation` (`packages/api/src/profile/mutations.ts`), which mobile and web both use, cap
`place.text` before the call:

```ts
place.text === null ? null : Array.from(place.text).slice(0, LOCATION_TEXT_MAX).join('')
```

Use code points, not `.slice` on the string. Cutting an emoji in half sends a lone surrogate, and
Postgres refuses that as invalid JSON text. The label is display text, so a cut is acceptable, and
OpenStreetMap labels on web can be long. No new strings and no input changes. `apps/mobile/lib/push.ts`
needs no change: `getExpoPushTokenAsync` returns the Expo format.

### 3. Tests

- `infra/supabase/tests/set_my_location.sql`: 200 multi-byte characters accepted (`repeat('ã', 200)`);
  201 refused; null text accepted; lat 91, lat -91, lng 181, lng -181, `'NaN'` and `'Infinity'` refused;
  the boundaries (90, -180) accepted; a refused call leaves the row unchanged; rounding still applies.
- `infra/supabase/tests/push_tokens.sql`: both prefixes accepted; refused with `invalid_token`: a null
  token, no brackets, empty brackets, a space inside, a 301-character token and the audit's 100,000 `x`.
  The existing `[aaa]`, `[bbb]` and `[deltest]` tokens must keep passing.
- A unit test for the cap in `packages/api` (a new `mutations.test.ts`, or a small exported helper if
  the hook is awkward to test): 201 characters comes out at 200, and an emoji on the boundary stays whole.

### 4. Reproduce the finding on a local stack (never hosted)

Run the two `POST`s from PAD-163 as a signed-in user. Each returned 204 before the fix and must now
return 400 with the error above and leave the stored value unchanged. Put the before and after in the
hand-off.

### 5. Sweep: report only, don't fix in this PR

On the local stack, list every text column and text RPC parameter a client can write that has no
length limit, marking which are served to other users. `create_event`'s `location_text` payload
(0146) is one known case. Post the table as a comment on your task. The CTO decides what becomes
follow-up tasks. A `check` constraint on a table with live rows needs its own hosted decision, which
is why it isn't bundled here.

## Hand-off

Run the checks in `docs/agents/_rules.md`, plus `pnpm test:db`. Open the PR from
`fix/unbounded-text-inputs`, which already holds this plan; merge `main` into it first (never
force-push), and confirm 0149 is in `main`. Then QA, then CTO review.

- **Hosted steps:** none by hand. The migration applies on merge through the workflow, and no edge
  function changes.
- **Older mobile builds:** they don't have the cap. A label over 200 characters gets the existing
  save-failed path, which is fine for a case this rare.
- **Not covered:** values already stored over the limit. We can't read hosted data from here. If one
  turns up, it needs a founder task, not a change to this plan.
