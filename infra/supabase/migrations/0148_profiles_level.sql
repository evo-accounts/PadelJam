-- Self-declared playing level (onboarding redesign, spec 2026-11-02 §5; founder approved collecting it
-- on PAD-15).
--
-- profiles.level: 1 getting started, 2 casual, 3 intermediate, 4 advanced; null = not answered (the
-- onboarding resume rule keys on it). Not verified, not computed, not used by any server rule. A number
-- rather than a text enum so a later "match players by level" can order by it.
--
-- Visibility and writes are those of dominant_hand and court_side, which it sits beside:
--   * SELECT to anon and authenticated, per 0115/0119: "profiles: read" (0055) still decides which
--     rows, so blocked pairs are excluded and anon sees none, but a named-column probe answers [].
--     A new profiles column that clients read needs this grant or every read naming it fails 42501.
--   * UPDATE to authenticated, per 0120; "profiles: update" keeps writes to your own row.
--   * The public-profile and explore RPCs do not change.
-- Account deletion clears it: soft_delete_account(uuid) below is 0143's body (the latest; 0144 only
-- changed grants) with `level = null` added. Same search_path; EXECUTE stays service_role only. The
-- zero-argument wrapper is untouched.
--
-- ADDITIVE: no backfill, nothing to lock. Old builds are safe whether or not this has run. A build that
-- selects `level` is NOT safe before it: ship such a build only after this migration is applied.

alter table public.profiles add column if not exists level smallint check (level between 1 and 4);

grant select (level) on public.profiles to anon, authenticated;
grant update (level) on public.profiles to authenticated;

-- soft_delete_account(p_user) ----------------------------------------------------------------------
create or replace function public.soft_delete_account(p_user uuid)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := p_user; v_prev_sub text;
begin
  if uid is null then return; end if;
  -- service_role (delete-account) may name any verified id. The anon and authenticated roles — which
  -- have no grant, but see the header — may only ever reach the caller's own account (the wrapper).
  if current_setting('role', true) in ('anon', 'authenticated') and auth.uid() is distinct from uid then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  -- Triggers on the rows deleted below read auth.uid(): 0122's _activity_on_participant logs the
  -- player's own 'left' only when auth.uid() is that player, and under the service role it is null.
  -- Pinned to the deletee for this call (transaction-local; restored at the end, rolled back on error).
  v_prev_sub := current_setting('request.jwt.claim.sub', true);
  perform set_config('request.jwt.claim.sub', uid::text, true);

  delete from follows  where follower_id = uid or followee_id = uid;
  delete from reports  where reporter_id = uid;
  delete from user_settings     where user_id = uid;
  -- 0098's trg_last_admin raises 'last_admin_must_promote_first' here for the sole admin of a
  -- community that still has members. The apps map that code, and the whole call rolls back, the
  -- ban below included.
  delete from community_members where user_id = uid;
  delete from group_members     where user_id = uid;
  delete from push_tokens       where user_id = uid;
  delete from notifications     where user_id = uid;

  -- Only upcoming/cancelled events: completed & in-progress history is preserved.
  delete from event_participants ep
   using events e
   where ep.user_id = uid
     and e.id = ep.event_id
     and e.status in ('scheduled','cancelled');

  -- Only the blocks this account PLACED. Blocks others placed on it are theirs and stay: the profile
  -- they point at survives, anonymized, and so does the auth user (see the file header).
  -- AFTER the event_participants delete on purpose: that delete fires 0122's activity trigger, which
  -- since 0140 leaves out the player's name when they and the organizer are blocked either way.
  -- Removing this account's blocks first would make the organizer's 'left' entry name someone who
  -- had blocked them.
  delete from blocks   where blocker_id = uid;

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
         level = null,
         preferred_time = null,
         gender = null,
         date_of_birth = null,
         deleted_at = now()
   where id = uid;

  -- Free the auth-level identifiers so the real owner can register again, and ban the user in the
  -- SAME transaction: banned_until is what GoTrue's ban_duration '876000h' writes and what it checks
  -- on every sign-in and refresh, so an existing refresh token stops working from this commit on.
  update auth.users
     set email = 'deleted+' || uid::text || '@deleted.invalid',
         phone = null,
         raw_user_meta_data = '{}'::jsonb,
         banned_until = now() + interval '876000 hours'
   where id = uid;
  delete from auth.identities where user_id = uid;

  perform set_config('request.jwt.claim.sub', coalesce(v_prev_sub, ''), true);
end;
$$;

comment on function public.soft_delete_account(uuid) is
  'Deletes (anonymizes + bans) one account. service_role only: the delete-account edge function, for the id GoTrue verified.';

revoke execute on function public.soft_delete_account(uuid) from public, anon, authenticated;
grant execute on function public.soft_delete_account(uuid) to service_role;

-- Self-check, in the 0115/0119/0120 style.
do $$
declare
  editable constant text[] := array[
    'full_name', 'avatar_url', 'description', 'dominant_hand', 'court_side', 'gender',
    'date_of_birth', 'preferred_time', 'locale', 'level'
  ];
  v_delete constant regprocedure := 'public.soft_delete_account(uuid)'::regprocedure;
  col text;
  r   text;
begin
  if not has_column_privilege('authenticated', 'public.profiles', 'level', 'SELECT')
     or not has_column_privilege('anon', 'public.profiles', 'level', 'SELECT') then
    raise exception '0148: anon and authenticated must be able to SELECT profiles.level';
  end if;
  if not has_column_privilege('authenticated', 'public.profiles', 'level', 'UPDATE') then
    raise exception '0148: authenticated cannot UPDATE profiles.level';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if has_column_privilege(r, 'public.profiles', 'level', 'INSERT')
       or has_column_privilege(r, 'public.profiles', 'level', 'REFERENCES') then
      raise exception '0148: % holds INSERT or REFERENCES on profiles.level', r;
    end if;
    foreach col in array array['phone', 'email'] loop
      if has_column_privilege(r, 'public.profiles', col, 'SELECT') then
        raise exception '0148: % can read profiles.%', r, col;
      end if;
    end loop;
  end loop;
  if has_column_privilege('anon', 'public.profiles', 'level', 'UPDATE') then
    raise exception '0148: anon can UPDATE profiles.level';
  end if;

  -- The 0120 writable set, now with level: exactly these ten columns, for authenticated only.
  for col in
    select a.attname from pg_attribute a
    where a.attrelid = 'public.profiles'::regclass and a.attnum > 0 and not a.attisdropped
  loop
    if has_column_privilege('authenticated', 'public.profiles', col, 'UPDATE') <> (col = any (editable)) then
      raise exception '0148: authenticated UPDATE on profiles.% is not as expected', col;
    end if;
    if has_column_privilege('anon', 'public.profiles', col, 'UPDATE') then
      raise exception '0148: anon can UPDATE profiles.%', col;
    end if;
  end loop;

  -- soft_delete_account(uuid): still service_role only, definer, pinned path, and clears level.
  if has_function_privilege('anon', v_delete, 'execute')
     or has_function_privilege('authenticated', v_delete, 'execute') then
    raise exception '0148: an API role can execute soft_delete_account(uuid)';
  end if;
  if not has_function_privilege('service_role', v_delete, 'execute') then
    raise exception '0148: service_role cannot execute soft_delete_account(uuid)';
  end if;
  if not exists (select 1 from pg_proc where oid = v_delete and prosecdef
                   and proconfig = array['search_path=public, pg_temp']) then
    raise exception '0148: soft_delete_account(uuid) is not SECURITY DEFINER with search_path public, pg_temp';
  end if;
  if (select prosrc from pg_proc where oid = v_delete) !~ 'level = null,' then
    raise exception '0148: soft_delete_account(uuid) does not clear level';
  end if;
end $$;
