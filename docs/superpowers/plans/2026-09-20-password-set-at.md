# `password_set_at` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `has_password` mean "this person chose a password", instead of "GoTrue wrote sixty bytes into a column".

**Architecture:** GoTrue gives every OTP-created user a random 60-character bcrypt `encrypted_password`, so both definitions of `has_password` — the `auth_providers` view (0003) and `auth_methods_for` (0096) — report true for people who can never type one. We record the fact explicitly in a new `auth_password_set` table and compute `has_password` from that. **The column name and every client contract stay identical**, so no application code changes: the clients already branch correctly on `has_password` and have simply been fed a lie.

The table keys on `auth.users`, **not** `profiles`: `auth_methods_for` deliberately serves the mid-signup state where a user exists in `auth.users` with no profiles row, and that is exactly when "Try another way" matters most.

Existing rows backfill to **absent** — "nobody has a password". Pre-launch, every row is test data, so the usual objection (real password users lose current-password reauth) has no one to apply to.

**Tech Stack:** Postgres/Supabase migrations, `pnpm test:db` (`infra/supabase/tests/lib.mjs`), Expo/React Native, vitest E2E.

---

## Decision to settle first

Task 1 is a measurement, not an implementation. Everything after it assumes a trigger on `auth.users` can record the fact for free. **If the measurement says otherwise, stop and re-plan** — the fallback is explicit writes at the four call sites that set a password (`create-account.tsx`, `new-password.tsx`, `password.tsx`, `change-password.tsx`, plus `complete-account/index.ts`), which is a different and larger plan.

## File structure

| File | Responsibility |
|---|---|
| `infra/supabase/migrations/0101_password_set_at.sql` (create) | The table, the trigger that fills it, the two redefinitions, the grants |
| `infra/supabase/tests/password-set-at.test.mjs` (create) | Proves an OTP user reads false and a real password reads true |
| `infra/supabase/tests/auth-methods.test.mjs` (modify) | Its `has_password` assertions currently encode the bug |
| `apps/mobile/e2e/suites/12-profile-settings.e2e.ts` (modify) | Stops faking passwordlessness by writing `encrypted_password = ''` |

No application code. If a task tempts you to touch `apps/`, the redefinition is wrong.

---

### Task 1: Measure whether a repeat OTP rewrites the placeholder

The trigger fires on any change to `encrypted_password`. That is correct **only if** GoTrue writes the placeholder once, at user creation, and leaves it alone on later OTP sign-ins. If it rewrites on every OTP, the trigger would record a password nobody set — reintroducing the bug it exists to fix.

**Files:** none (measurement only)

- [ ] **Step 1: Create a user by OTP and capture the hash**

```bash
cd /Users/joaopaulos4/Cursor/PadelJam/PadelJam
set -a; . ./.env; set +a
EMAIL="pwtest-$(date +%s)@example.com"
curl -s -X POST "http://127.0.0.1:55321/auth/v1/otp" \
  -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"create_user\":true}" >/dev/null
docker exec supabase_db_padeljam psql -U postgres -d postgres -tA \
  -c "select md5(encrypted_password) from auth.users where email='$EMAIL';"
```

Expected: one md5 hash. Record it, and keep `$EMAIL` for the next step.

- [ ] **Step 2: Request a second OTP for the same user and compare**

```bash
curl -s -X POST "http://127.0.0.1:55321/auth/v1/otp" \
  -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\"}" >/dev/null
docker exec supabase_db_padeljam psql -U postgres -d postgres -tA \
  -c "select md5(encrypted_password) from auth.users where email='$EMAIL';"
```

Expected: **the same md5 as Step 1.**

If it differs, STOP. The trigger approach is unsound; report the measurement and re-plan around explicit writes.

- [ ] **Step 3: Record the measurement in the migration's header comment**

Write the observed result into a scratch note for Task 2 to quote. Do not commit anything yet — there is nothing to commit.

---

### Task 2: The migration

**Files:**
- Create: `infra/supabase/migrations/0101_password_set_at.sql`

- [ ] **Step 1: Write the migration**

```sql
-- has_password has never meant what its name says.
--
-- POST /auth/v1/otp CREATES the user and gives it a random 60-character bcrypt
-- encrypted_password. Not null, not the empty string, and unguessable — so the
-- user can never use it, while every SQL test for "has a password" says yes.
-- Measured on the local stack 2026-09-17; `crypt('', encrypted_password) =
-- encrypted_password` is FALSE, so there is no cheap way to tell a placeholder
-- from a chosen password after the fact.
--
-- Both definitions inherited that: auth_providers (0003) and auth_methods_for
-- (0096) each computed `encrypted_password is not null and <> ''`. The result:
-- "Try another way" offered password sign-in to people with no password, and
-- profile/change-password.tsx showed "Change password" and demanded a CURRENT
-- one — the exact dead end the Create path exists to close.
--
-- So record the fact instead of inferring it.
--
-- WHY auth.users AND NOT profiles: auth_methods_for deliberately answers for the
-- mid-signup state, where the user exists in auth.users with no profiles row at
-- all. Keying this on profiles would report "no password" for exactly the people
-- the lookup is for.
--
-- WHY A TRIGGER AND NOT APP WRITES: it catches every path at once — the admin
-- API in complete-account, updateUser from change-password and new-password, and
-- anything added later — and cannot drift from the app. Verified before writing
-- this: a repeat OTP for an existing user does NOT rewrite encrypted_password,
-- so the trigger cannot mistake a second sign-in for a password being set.
create table auth_password_set (
  user_id uuid primary key references auth.users(id) on delete cascade,
  set_at  timestamptz not null default now()
);

alter table auth_password_set enable row level security;
-- No policies: nothing reads this directly. The view and the function below are
-- security_invoker/security_definer respectively and reach it as the owner.
revoke all on auth_password_set from anon, authenticated;

create or replace function record_password_set() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into auth_password_set (user_id, set_at)
  values (new.id, now())
  on conflict (user_id) do update set set_at = excluded.set_at;
  return new;
end; $$;

-- AFTER UPDATE only. The INSERT that creates an OTP user also writes the
-- placeholder, and firing on it is precisely the bug being fixed.
create trigger trg_record_password_set
  after update of encrypted_password on auth.users
  for each row
  when (old.encrypted_password is distinct from new.encrypted_password)
  execute function record_password_set();

-- Backfill: nobody. Pre-launch, every existing row is test data, and no SQL test
-- separates a placeholder from a chosen password anyway. Anyone who did set one
-- sets it again; the trigger records it from then on.

create or replace view auth_providers
with (security_invoker = true) as
select
  u.id as user_id,
  (u.email is not null) as has_email,
  (u.phone is not null) as has_phone,
  exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google') as has_google,
  exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'apple')  as has_apple,
  exists (select 1 from auth_password_set s where s.user_id = u.id) as has_password
from auth.users u
where u.id = auth.uid();
```

- [ ] **Step 2: Redefine `auth_methods_for`'s two lookups**

In the same file, append a `create or replace function auth_methods_for(...)` that is byte-identical to 0096's except for the two `select` statements, which become:

```sql
    select u.id, u.email, u.phone, exists (select 1 from auth_password_set s where s.user_id = u.id)
      into v_user_id, v_email, v_phone, v_pwd
      from auth.users u
     where u.phone in (v_norm, '+' || v_norm)
     limit 1;
```

and the email branch:

```sql
    select u.id, u.email, u.phone, exists (select 1 from auth_password_set s where s.user_id = u.id)
      into v_user_id, v_email, v_phone, v_pwd
      from auth.users u
     where lower(u.email) = v_norm
     limit 1;
```

Copy the rest of the body verbatim from
`infra/supabase/migrations/0096_auth_methods_lookup.sql` — the rate limiter, the
phone-format trap comment and the grants all still apply and must not be
paraphrased.

- [ ] **Step 3: Apply it locally**

```bash
cd /Users/joaopaulos4/Cursor/PadelJam/PadelJam
pgrep -f "node.*e2e/run[.]mjs" && echo "STOP: the shared stack is busy" || \
  SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token \
  pnpm dlx supabase@2.117.0 --workdir infra db reset
```

Expected: the reset completes and lists `0101_password_set_at.sql`.

- [ ] **Step 4: Commit**

```bash
git add infra/supabase/migrations/0101_password_set_at.sql
git commit -m "feat(db): record that a password was set, rather than inferring it"
```

---

### Task 3: Prove it, in the database

**Files:**
- Create: `infra/supabase/tests/password-set-at.test.mjs`

- [ ] **Step 1: Write the failing test**

`lib.mjs` exports `adminCreateUser(email, phone, password)` — POSITIONAL, and it
returns the id, not a user object. It has no update helper, so add one first:

```js
// infra/supabase/tests/lib.mjs — beside adminCreateUser
export async function adminUpdateUser(id, fields) {
  return req(`/auth/v1/admin/users/${id}`, { method: 'PUT', body: fields });
}
```

Then the test:

```js
// infra/supabase/tests/password-set-at.test.mjs
// has_password must mean "chose a password", not "GoTrue wrote a placeholder".
import { adminCreateUser, adminUpdateUser, anonRpc, assert, run } from './lib.mjs';

const RUN = process.env.TEST_RUN || Date.now().toString(36);

const lookup = async (identifier) => {
  const rows = await anonRpc('auth_methods_for', { p_identifier: identifier });
  assert(Array.isArray(rows) && rows.length === 1, `one row for ${identifier}`);
  return rows[0];
};

run('a user created without a password reports has_password false', async () => {
  const email = `pwset-otp-${RUN}@rpctest.local`;
  // No password argument: the closest analogue to the OTP path, in that the user
  // has nothing they can type. Note this does NOT reproduce GoTrue's placeholder
  // — adminCreateUser leaves encrypted_password null — so it proves the new
  // definition, not the old bug. Task 1's measurement is what covers the
  // placeholder case, and suite 12 covers it end to end.
  await adminCreateUser(email, null, null);
  const r = await lookup(email);
  assert(r.has_password === false, `expected false, got ${r.has_password}`);
});

run('setting a password flips has_password to true', async () => {
  const email = `pwset-real-${RUN}@rpctest.local`;
  const id = await adminCreateUser(email, null, null);
  await adminUpdateUser(id, { password: 'Padel1234#' });
  const r = await lookup(email);
  assert(r.has_password === true, `expected true, got ${r.has_password}`);
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/joaopaulos4/Cursor/PadelJam/PadelJam
set -a; . ./.env; set +a
node infra/supabase/tests/password-set-at.test.mjs
```

Expected before Task 2 is applied: the first test fails with `expected false, got true`.
After Task 2: both pass. If the first already passes before the migration, the
test is not reaching the code it thinks it is — stop and find out why.

- [ ] **Step 3: Run the whole db suite**

```bash
pnpm test:db
```

Expected: every file passes. `auth-methods.test.mjs` may fail here — that is Task 4.

- [ ] **Step 4: Commit**

```bash
git add infra/supabase/tests/password-set-at.test.mjs infra/supabase/tests/lib.mjs
git commit -m "test(db): has_password means a password was chosen"
```

---

### Task 4: Correct the tests that encode the old meaning

**Files:**
- Modify: `infra/supabase/tests/auth-methods.test.mjs`

- [ ] **Step 1: Find the assertions that assume a placeholder counts**

```bash
grep -n "has_password" infra/supabase/tests/auth-methods.test.mjs
```

- [ ] **Step 2: Fix each one**

Any case that creates a user without a password and expects `has_password: true`
was asserting the bug. Expect `false`. Any case that wants a true must now set a
real password through the admin API, as Task 3's second test does.

- [ ] **Step 3: Run it**

```bash
node infra/supabase/tests/auth-methods.test.mjs && pnpm test:db
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add infra/supabase/tests/auth-methods.test.mjs
git commit -m "test(db): auth-methods expectations follow the corrected meaning"
```

---

### Task 5: Let suite 12 stop lying

**Files:**
- Modify: `apps/mobile/e2e/suites/12-profile-settings.e2e.ts`

Its password test fakes passwordlessness with `update auth.users set
encrypted_password = ''` — a state no real user is ever in, which is why the
Create-password path passed its test while being unreachable in practice.

- [ ] **Step 1: Replace the fake**

```bash
grep -n "encrypted_password" apps/mobile/e2e/suites/12-profile-settings.e2e.ts
```

Delete the row that writes `encrypted_password = ''`. A seeded OTP user is now
genuinely passwordless, so the setup is simply: do nothing.

- [ ] **Step 2: Run the suite**

```bash
pgrep -f "node.*e2e/run[.]mjs" && echo "WAIT: stack busy" || \
  pnpm --filter mobile e2e -- --wait --suite 12
```

Expected: PASS. If the Create/Change branch now renders the other way round,
that is the bug being fixed showing itself — confirm against the screen before
changing the test.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/e2e/suites/12-profile-settings.e2e.ts
git commit -m "test(mobile): a seeded OTP user is passwordless for real"
```

---

### Task 6: Full verification

- [ ] **Step 1: The eight-command check set**

```bash
pnpm lint && pnpm typecheck && pnpm tokens:check && pnpm i18n:check \
  && pnpm size:check && pnpm schema:check && pnpm test && pnpm test:functions
```

Expected: all pass. `size:check` is a ratchet that fails when UNDER budget — if
it does, lower `BUDGET` in `scripts/check-size-budget.mjs` to the number printed.

- [ ] **Step 2: The full E2E suite**

```bash
pgrep -f "node.*e2e/run[.]mjs" && echo "WAIT: stack busy" || \
  pnpm --filter mobile e2e -- --wait
```

Expected: every suite passes. Read the on-disk `*-a11y.json` before re-running
anything that fails.

- [ ] **Step 3: Open the PR**

Note in the body that migration **0101 must be pasted into the hosted SQL
editor** — this account cannot `link` or `push`, and the failure mode is quiet.

---

## Hosted hand-off

0101 does not apply itself. After merge, paste it in the dashboard SQL editor,
then verify with a single statement:

```sql
select
  (select count(*) from pg_tables where tablename = 'auth_password_set') = 1 as table_exists,
  (select count(*) from pg_trigger where tgname = 'trg_record_password_set') = 1 as trigger_exists,
  (select count(*) from pg_views where viewname = 'auth_providers') = 1 as view_exists;
```

All three must be true.
