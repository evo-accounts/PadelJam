# Phase 1B-2c-3 — Delete Account (soft-delete / anonymize) — Design

*Padel Jam • 2026-06-14 • Brainstormed design / spec*

## Goal

Let a user delete their account: anonymize + soft-delete their profile, drop their social/
membership rows, ban the auth user (block re-login), and keep owned entities intact. Closes the
delete-account part of `Requirements/profile.md` PR-14, adapted to the schema (hard delete is
blocked by NOT NULL RESTRICT FKs like `created_by`/`organizer_id`).

**Decomposition:** final piece of Phase 1B-2c (account security), after change-password and
change-email. Branch `feat/phase1b2c3-delete-account` (off `main`). **Migration `0059`.** New edge function `delete-account`.

## Scope decisions (made with the user)

1. **Soft-delete / anonymize** (not hard delete): scrub PII, soft-delete, drop the user's
   memberships/social graph, ban the auth user. Owned communities/events stay (now showing
   "Deleted user").
2. **Edge function + admin ban** to truly block re-login (vs RPC-only + app-side check).
3. **Keep owned entities** (anonymized) rather than ownership transfer/cascade.

## Architecture

```
Settings › Account › Delete account → /profile/delete-account (warning + erased list + confirm)
  → POST {SUPABASE_URL}/functions/v1/delete-account  (Authorization: Bearer <session token>)
      edge fn:  resolve caller from JWT (401 if none)
                user-client.rpc('soft_delete_account')          // scrub + soft-delete + drop dependent rows
                admin-client.auth.admin.updateUserById(id, { ban_duration: '876000h' })  // block re-login
                → { ok: true }
  → on ok: signOut(supabase) → router.replace('/(auth)/welcome')
```
Mirrors the existing `complete-account` edge function (user client for `auth.uid()`-scoped work + admin client for the privileged step).

## Data model — migration `0059_account_deletion.sql`

```sql
alter table profiles add column deleted_at timestamptz;

-- Soft-delete the caller's own account: anonymize PII, mark deleted, and drop the user's
-- memberships/social rows. Owned entities (created_by/organizer_id) are intentionally kept and
-- now reference the anonymized "Deleted user" profile. SECURITY DEFINER to scrub + delete across
-- tables regardless of per-table RLS; scoped to auth.uid().
create or replace function soft_delete_account()
returns void
language plpgsql volatile security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return; end if;

  delete from follows  where follower_id = uid or followee_id = uid;
  delete from blocks   where blocker_id = uid or blocked_id = uid;
  delete from reports  where reporter_id = uid;
  delete from user_settings    where user_id = uid;
  delete from community_members where user_id = uid;
  delete from group_members     where user_id = uid;
  delete from event_participants where user_id = uid;

  update profiles
     set full_name = 'Deleted user',
         email = 'deleted+' || uid::text || '@deleted.invalid',
         phone = 'deleted-' || uid::text,
         avatar_url = null,
         description = null,
         location_text = null,
         location_point = null,
         dominant_hand = null,
         court_side = null,
         gender = null,
         date_of_birth = null,
         deleted_at = now()
   where id = uid;
end;
$$;

grant execute on function soft_delete_account() to authenticated;
```

## Edge function `infra/supabase/functions/delete-account/index.ts`
- POST only; resolve the user from `Authorization` (anon client + `auth.getUser()`); 401 if none.
- `userClient.rpc('soft_delete_account')` (runs as the caller → `auth.uid()` scoping). On error → 400.
- `admin.auth.admin.updateUserById(user.id, { ban_duration: '876000h' })` (~100y) → blocks future sign-in / token refresh. On error → 400.
- Return `{ ok: true }`. Reads `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` from env (same as `complete-account`).

## Mobile
- **`apps/mobile/app/profile/delete-account.tsx`** — warning screen: title + body + a bulleted "this erases…" list (profile/personal data, your memberships, follows, settings), and a destructive **Delete my account** button → confirm `Alert` → `fetch(`${SUPABASE_URL}/functions/v1/delete-account`, { method:'POST', headers:{ Authorization: `Bearer ${session.access_token}`, … }})` (pattern from `create-account.tsx`) → on `ok` `await signOut(supabase); router.replace('/(auth)/welcome')`; non-2xx → inline `deleteFailed`. `busy` guard.
- **Settings hub** — a destructive **Delete account** row at the bottom of the Account section (red text).
- i18n (`profile` ns): `deleteAccount`, `deleteWarningTitle`, `deleteWarningBody`, `deleteErasedProfile`, `deleteErasedMemberships`, `deleteErasedSocial`, `deleteConfirm`, `deleteFailed`.

## Testing
- **SQL** (`account_deletion.sql`, PT001): seed a user + profile + a follow + `user_settings` + a community membership + a community they `created_by`; act as the user; `select soft_delete_account()`; assert: profile `full_name='Deleted user'` + `deleted_at` not null + email/phone are the placeholders; the follow / user_settings / membership rows are gone; **the created community still exists** (owned entity preserved).
- Edge function: thin orchestration — **manual smoke** (needs `supabase functions serve`): delete → signed out to welcome; the banned user can't sign back in (OTP/verify rejected); their created content shows "Deleted user".
- Workspace typecheck. (No `@padel/api` hook — the screen calls the edge function directly, like `create-account`.)

## Explicitly deferred / limitation
- **Sole-owner communities/groups:** an owner who deletes is anonymized but their community becomes unmanageable ("Deleted user" owner). Forcing ownership transfer first is out of scope (same machinery as hard-delete) — documented follow-up.
- Hard delete; data export; GoTrue user row removal (we ban, not delete, due to RESTRICT FKs).

## Conventions followed
Additive migration `0059`; `security definer set search_path = public` RPC; edge function mirrors
`complete-account` (user + admin clients, env keys); SQL test (PT001); screen under `apps/mobile/app/profile/`;
copy via `useT('profile')`; edge-fn call via `fetch` + session bearer (like `create-account.tsx`).

## Open items for the implementation plan
- Confirm `ban_duration` is accepted by the installed `@supabase/supabase-js` admin API in the Deno edge runtime (it is in v2 `admin.updateUserById`).
- Confirm `community_members`/`group_members`/`event_participants` use column `user_id` (they do).
- The edge function needs `supabase functions serve` running for the manual smoke (as learned in the Explore smoke).
