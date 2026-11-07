-- PAD-164, PR A of 3: a private community is "not discoverable anywhere" (UX-COMM), a community's
-- plan is for its members, and a person's own internal profile fields come from a function.
-- ADDITIVE except for the one tightened policy and the count function's body; nothing is revoked
-- here, so released builds keep working. The profile revokes are PR C, merged once a build that no
-- longer selects those columns is live (plan: docs/superpowers/plans/2026-11-05-profiles-communities-read-narrowing.md).
--
-- What reads `communities` as the invoker, checked on a local database (pg_policies, security
-- invoker functions and views): only "tenants: read own" (0138, which already requires
-- membership) and "community_members: read" (0024, whose public-community branch is still
-- satisfied, because public rows stay readable). No invoker function or view reads it.
--
-- 1. can_read_community(c): the rule, written once. It is named in a policy, so authenticated keeps
--    EXECUTE (0094 note, quoted in 0100); anon does not.
-- 2. "communities: read" asks it.
-- 3. community_member_count(c): null unless the caller may read the community and it is not archived.
-- 4. get_my_community_plan(c): community_plan(c) for a member, null otherwise. community_plan itself
--    is untouched: definer functions call it for non-members (join limits).
-- 5. get_my_profile_state(): the caller's own non-sensitive profile fields that the clients read.
--    terms_accepted_at, created_at and deleted_at are left out: no client reads them.

create or replace function can_read_community(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from communities co
     where co.id = c
       and case
             when co.archived_at is not null then is_community_admin(co.id)
             else co.privacy <> 'private'
               or is_community_member(co.id)
               or exists (select 1 from community_invitations ci
                           where ci.community_id = co.id and ci.invitee_id = auth.uid() and ci.status = 'pending')
               or exists (select 1 from group_invitations gi
                            join groups g on g.id = gi.group_id
                           where g.community_id = co.id and gi.invitee_id = auth.uid() and gi.status = 'pending')
           end
  );
$$;

comment on function can_read_community(uuid) is
  'May the signed-in caller read this community row? Public and request-to-join: yes. Private: only '
  'a member or someone with a pending community or group invitation. Archived: its admins only.';

revoke execute on function can_read_community(uuid) from public, anon;
grant execute on function can_read_community(uuid) to authenticated;

drop policy if exists "communities: read" on communities;
create policy "communities: read" on communities for select to authenticated using (can_read_community(id));

create or replace function community_member_count(c uuid) returns integer
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null or not can_read_community(c) then null
    when exists (select 1 from communities where id = c and archived_at is not null) then null
    else (select count(*)::int from community_members m where m.community_id = c)
  end;
$$;

revoke execute on function community_member_count(uuid) from public, anon;
grant execute on function community_member_count(uuid) to authenticated;

create or replace function get_my_community_plan(c uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is not null and is_community_member(c) then community_plan(c) end;
$$;

comment on function get_my_community_plan(uuid) is
  'The community''s plan for a member of it; null for anyone else. community_plan(uuid) stays open to '
  'internal callers (join limits) and is revoked from clients in PR C.';

revoke execute on function get_my_community_plan(uuid) from public, anon;
grant execute on function get_my_community_plan(uuid) to authenticated;

create or replace function get_my_profile_state()
returns table (
  description text, dominant_hand text, court_side text, level smallint, preferred_time text,
  location_text text, locale text, onboarded_at timestamptz, notifications_prompted_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.description, p.dominant_hand, p.court_side, p.level, p.preferred_time,
         p.location_text, p.locale, p.onboarded_at, p.notifications_prompted_at
    from profiles p
   where p.id = auth.uid();
$$;

revoke execute on function get_my_profile_state() from public, anon;
grant execute on function get_my_profile_state() to authenticated;

do $$
declare f text;
begin
  foreach f in array array['can_read_community(uuid)', 'community_member_count(uuid)',
                           'get_my_community_plan(uuid)', 'get_my_profile_state()'] loop
    if has_function_privilege('anon', 'public.' || f, 'execute') then
      raise exception '0161: anon can execute %', f;
    end if;
    if not has_function_privilege('authenticated', 'public.' || f, 'execute') then
      raise exception '0161: authenticated cannot execute %', f;
    end if;
    if not exists (select 1 from pg_proc where oid = to_regprocedure('public.' || f) and prosecdef
                     and proconfig = array['search_path=public']) then
      raise exception '0161: % is not SECURITY DEFINER with search_path public', f;
    end if;
  end loop;
  if (select pg_get_expr(polqual, polrelid) from pg_policy
       where polrelid = 'public.communities'::regclass and polname = 'communities: read')
     is distinct from 'can_read_community(id)' then
    raise exception '0161: "communities: read" is not can_read_community(id)';
  end if;
  if (select polroles::oid[] from pg_policy
       where polrelid = 'public.communities'::regclass and polname = 'communities: read')
     is distinct from array[(select oid from pg_roles where rolname = 'authenticated')] then
    raise exception '0161: "communities: read" is not to authenticated only';
  end if;
end $$;
