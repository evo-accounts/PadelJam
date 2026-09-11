# Archive Guard (C2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `archive_group` refuses to archive a community's general group while it is the community's only active group, and both clients show the reason.

**Architecture:** One migration redefines the RPC with the guard. The shared `mapPgError` list learns the new code, the mobile seasons screen and the web manage page translate it. A small REST-level test harness under `infra/supabase/tests/` exercises RPCs as real users against the local stack; later plans reuse it.

**Tech Stack:** Postgres/PLpgSQL (Supabase migrations), Node 22 (`.mjs` test scripts hitting PostgREST and GoTrue), TypeScript, vitest, react-native, Next.js, i18next.

**Spec:** `docs/superpowers/specs/2026-09-11-audit-content-seed-design.md` section 1.

**Prerequisites:** Docker running and the local stack up:

```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token && pnpm dlx supabase@latest --workdir infra start
```

Branch from `origin/main` (`git fetch origin && git checkout -b feat/archive-guard origin/main`). The repo's root `.env` holds `SUPABASE_SERVICE_ROLE_KEY` for the local stack (same file the existing seeds read).

---

### Task 1: RPC test harness

**Files:**
- Create: `infra/supabase/tests/lib.mjs`

This file is shared by every audit plan. It signs users in with the password grant and calls RPCs through PostgREST exactly as the app does.

- [ ] **Step 1: Create the harness**

```js
// infra/supabase/tests/lib.mjs
// Minimal REST harness for RPC-level tests against the LOCAL stack.
// Usage: import { setup, rpc, sel, insert, patch, del, expectError, adminCreateUser, signIn } from './lib.mjs'
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function loadEnv() {
  const env = { ...process.env };
  try {
    for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* rely on process.env */ }
  return env;
}
const ENV = loadEnv();
export const URL = ENV.SUPABASE_URL || 'http://127.0.0.1:55321';
export const SERVICE = ENV.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(URL)) {
  console.error(`Refusing non-local URL ${URL}`); process.exit(1);
}

export async function req(path, { method = 'GET', jwt, body, prefer } = {}) {
  const headers = { 'Content-Type': 'application/json', apikey: SERVICE, Authorization: `Bearer ${jwt || SERVICE}` };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  return data;
}
export const rpc = (jwt, name, args = {}) => req(`/rest/v1/rpc/${name}`, { method: 'POST', jwt, body: args });
export const insert = (table, rows) => req(`/rest/v1/${table}`, { method: 'POST', body: rows, prefer: 'return=representation' });
export const sel = (table, qs) => req(`/rest/v1/${table}?${qs}`);
export const patch = (table, qs, fields) => req(`/rest/v1/${table}?${qs}`, { method: 'PATCH', body: fields, prefer: 'return=minimal' });
export const del = (table, qs) => req(`/rest/v1/${table}?${qs}`, { method: 'DELETE' });

export async function adminCreateUser(email, phone, password) {
  const u = await req('/auth/v1/admin/users', {
    method: 'POST', body: { email, phone, password, email_confirm: true, phone_confirm: true },
  });
  return u.id;
}
export async function signIn(email, password) {
  const r = await req('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
  return r.access_token;
}

/** Create a fully onboarded user and return { id, jwt }. `tag` makes emails unique per run. */
export async function user(tag, { gender = 'male', name } = {}) {
  const run = process.env.TEST_RUN || Date.now().toString(36);
  const email = `${tag}-${run}@rpctest.local`;
  const phone = '+3519' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');
  const id = await adminCreateUser(email, phone, 'Padel1234#');
  await insert('profiles', {
    id, email, phone, full_name: name ?? `${tag} ${run}`, locale: 'en', onboarded_at: new Date().toISOString(),
    gender, dominant_hand: 'right', court_side: 'left', preferred_time: 'any', location_text: 'Lisbon, PT',
  });
  return { id, jwt: await signIn(email, 'Padel1234#') };
}

/** Await `fn` and assert it throws with a message containing `code`. */
export async function expectError(fn, code) {
  try { await fn(); } catch (e) {
    if (String(e.message).includes(code)) return;
    throw new Error(`expected error containing "${code}", got: ${e.message}`);
  }
  throw new Error(`expected error containing "${code}", but the call succeeded`);
}

export function assert(cond, msg) { if (!cond) throw new Error(`assertion failed: ${msg}`); }

export async function run(name, fn) {
  console.log(`▶ ${name}`);
  try { await fn(); console.log(`✔ ${name}`); }
  catch (e) { console.error(`✘ ${name}\n  ${e.message}`); process.exit(1); }
}
```

- [ ] **Step 2: Smoke-run it**

Run: `node -e "import('./infra/supabase/tests/lib.mjs').then(m => m.user('smoke').then(u => console.log('ok', u.id)))"`
Expected: prints `ok <uuid>`.

- [ ] **Step 3: Commit**

```bash
git add infra/supabase/tests/lib.mjs
git commit -m "test(db): REST harness for RPC-level tests against the local stack"
```

---

### Task 2: Failing RPC test for the guard

**Files:**
- Create: `infra/supabase/tests/archive-guard.test.mjs`

- [ ] **Step 1: Write the test**

```js
// infra/supabase/tests/archive-guard.test.mjs
import { user, rpc, sel, expectError, assert, run } from './lib.mjs';

await run('general group cannot be archived while it is the only group', async () => {
  const owner = await user('owner');
  const communityId = await rpc(owner.jwt, 'create_community_with_personal_tenant', {
    p_name: 'Guard Club', p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  const [general] = await sel('groups', `community_id=eq.${communityId}&is_general=eq.true&select=id`);
  assert(general, 'general group exists');

  await expectError(() => rpc(owner.jwt, 'archive_group', { p_group_id: general.id }), 'general_group_only_group');

  const stillActive = await sel('groups', `id=eq.${general.id}&select=archived_at`);
  assert(stillActive[0].archived_at === null, 'general group is still active');
});

await run('general group can be archived once another active group exists', async () => {
  const owner = await user('owner2');
  const communityId = await rpc(owner.jwt, 'create_community_with_personal_tenant', {
    p_name: 'Guard Club Two', p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  const [general] = await sel('groups', `community_id=eq.${communityId}&is_general=eq.true&select=id`);
  await rpc(owner.jwt, 'create_group', {
    p_community_id: communityId, p_name: 'Second', p_description: null, p_is_private: false, p_thumbnail_path: null,
  });
  await rpc(owner.jwt, 'archive_group', { p_group_id: general.id });
  const archived = await sel('groups', `id=eq.${general.id}&select=archived_at`);
  assert(archived[0].archived_at !== null, 'general group archived');
});

await run('an archived sibling does not count as another group', async () => {
  const owner = await user('owner3');
  const communityId = await rpc(owner.jwt, 'create_community_with_personal_tenant', {
    p_name: 'Guard Club Three', p_type: 'club', p_country: 'PT', p_privacy: 'public',
    p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
    p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
  });
  const [general] = await sel('groups', `community_id=eq.${communityId}&is_general=eq.true&select=id`);
  const second = await rpc(owner.jwt, 'create_group', {
    p_community_id: communityId, p_name: 'Second', p_description: null, p_is_private: false, p_thumbnail_path: null,
  });
  await rpc(owner.jwt, 'archive_group', { p_group_id: second });
  await expectError(() => rpc(owner.jwt, 'archive_group', { p_group_id: general.id }), 'general_group_only_group');
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `node infra/supabase/tests/archive-guard.test.mjs`
Expected: first case fails with `expected error containing "general_group_only_group", but the call succeeded`.

---

### Task 3: Migration

**Files:**
- Create: `infra/supabase/migrations/0090_archive_general_group_guard.sql`

- [ ] **Step 1: Write the migration**

```sql
-- CM-05 / communities.md line 11: the general group cannot be archived while it is the
-- community's only active group. archive_community is untouched: it archives everything at once.
create or replace function archive_group(p_group_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_community uuid; v_general boolean;
begin
  if not is_group_admin(p_group_id, auth.uid()) then raise exception 'forbidden' using errcode='P0001'; end if;
  select community_id, is_general into v_community, v_general from groups where id = p_group_id;
  if v_general and not exists (
      select 1 from groups g
      where g.community_id = v_community and g.id <> p_group_id and g.archived_at is null)
  then
    raise exception 'general_group_only_group' using errcode='P0001';
  end if;
  update groups set archived_at = now() where id = p_group_id and archived_at is null;
end; $$;
```

- [ ] **Step 2: Apply and run the test**

Run:
```bash
pnpm dlx supabase@latest --workdir infra db reset
node infra/supabase/tests/archive-guard.test.mjs
```
Expected: three `✔` lines.

- [ ] **Step 3: Commit**

```bash
git add infra/supabase/migrations/0090_archive_general_group_guard.sql infra/supabase/tests/archive-guard.test.mjs
git commit -m "feat(db): refuse to archive the general group while it is the only group"
```

---

### Task 4: Error mapping in the shared API client

**Files:**
- Modify: `packages/api/src/client.ts:13` (the `KNOWN` groups line)
- Create: `packages/api/src/client.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/api/src/client.test.ts
import { describe, expect, it } from 'vitest';
import { mapPgError } from './client';

describe('mapPgError', () => {
  it('maps the general-group archive guard', () => {
    expect(mapPgError({ message: 'general_group_only_group' })).toBe('general_group_only_group');
  });
  it('falls back to unknown_error', () => {
    expect(mapPgError({ message: 'something else entirely' })).toBe('unknown_error');
  });
  it('returns null for no error', () => {
    expect(mapPgError(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @padel/api test -- client.test.ts`
Expected: the first case fails (`unknown_error` received).

- [ ] **Step 3: Add the code**

In `packages/api/src/client.ts` change the groups line of `KNOWN`:

```ts
  'sole_owner_must_transfer', 'sole_admin_must_add_another', 'groups_per_community', 'general_group_only_group',
```

- [ ] **Step 4: Run it again**

Run: `pnpm --filter @padel/api test -- client.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/client.ts packages/api/src/client.test.ts
git commit -m "feat(api): map general_group_only_group"
```

---

### Task 5: Mobile copy and alert

**Files:**
- Modify: `apps/mobile/app/group/[id]/manage/seasons.tsx:14`
- Modify: `apps/mobile/lib/i18n-mobile.ts` (group namespace, three locales; anchors near lines 1092, 1203, 1314 where `groups_per_community` sits)

- [ ] **Step 1: Widen the alert's key set**

```ts
const ARCHIVE_ERROR_KEYS = new Set(['forbidden', 'groups_per_community', 'group_not_found', 'general_group_only_group']);
```

- [ ] **Step 2: Add the copy**

Insert one line after `sole_owner_must_transfer` in each locale block of `mobileGroup`:

pt-PT:
```ts
    general_group_only_group: 'O grupo geral não pode ser arquivado enquanto for o único grupo da comunidade.',
```
pt-BR:
```ts
    general_group_only_group: 'O grupo geral não pode ser arquivado enquanto for o único grupo da comunidade.',
```
en:
```ts
    general_group_only_group: 'The general group cannot be archived while it is the only group in the community.',
```

- [ ] **Step 3: Check keys and types**

Run: `pnpm i18n:check && pnpm --filter mobile typecheck`
Expected: no missing keys, no type errors.

- [ ] **Step 4: Commit**

```bash
git add "apps/mobile/app/group/[id]/manage/seasons.tsx" apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(mobile): explain why the general group cannot be archived"
```

---

### Task 6: Web copy and inline error

**Files:**
- Modify: `apps/web/src/app/(app)/app/group/[id]/manage/page.tsx:54-66`
- Modify: `apps/web/src/lib/i18n-web.ts` (group namespace, after `groups_per_community` at lines 896, 965, 1034)

- [ ] **Step 1: Show the archive error under the button**

Replace the `Button` block at the end of the page with:

```tsx
      <Button
        variant="outline"
        disabled={busy || !communityId}
        onClick={() =>
          archived
            ? unarchive.mutate({ groupId: id, communityId })
            : archive.mutate({ groupId: id, communityId })
        }
      >
        {archived ? t('unarchive') : t('archive')}
      </Button>
      {archive.error ? (
        <p role="alert" className="text-sm text-destructive">
          {t(archive.error.message, { defaultValue: t('unknown_error') })}
        </p>
      ) : null}
```

- [ ] **Step 2: Add the copy**

After `groups_per_community` in each locale of the web group namespace:

pt-PT:
```ts
    general_group_only_group: 'O grupo geral não pode ser arquivado enquanto for o único grupo.',
```
pt-BR:
```ts
    general_group_only_group: 'O grupo geral não pode ser arquivado enquanto for o único grupo.',
```
en:
```ts
    general_group_only_group: 'The general group cannot be archived while it is the only group.',
```

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm --filter web typecheck && pnpm --filter web lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(app)/app/group/[id]/manage/page.tsx" apps/web/src/lib/i18n-web.ts
git commit -m "feat(web): surface the general-group archive guard"
```

---

### Task 7: Full verification and PR

- [ ] **Step 1: Run the repo checks**

Run: `pnpm lint && pnpm typecheck && pnpm i18n:check && pnpm test`
Expected: all green.

- [ ] **Step 2: Re-run the RPC test on a fresh reset**

Run:
```bash
pnpm dlx supabase@latest --workdir infra db reset
node infra/supabase/tests/archive-guard.test.mjs
```
Expected: three `✔`.

- [ ] **Step 3: Open the PR**

```bash
git push -u origin feat/archive-guard
gh pr create --title "feat: the general group cannot be archived while it is the only group (CM-05)" --body "$(cat <<'EOF'
Implements section 1 of docs/superpowers/specs/2026-09-11-audit-content-seed-design.md.

- 0090: archive_group raises general_group_only_group for a lone general group
- mapPgError, mobile seasons screen and web manage page translate it
- infra/supabase/tests/lib.mjs: REST harness for RPC-level tests, reused by the next audit PRs

Verified with node infra/supabase/tests/archive-guard.test.mjs on a fresh local reset.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
