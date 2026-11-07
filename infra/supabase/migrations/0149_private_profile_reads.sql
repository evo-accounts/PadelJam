-- PAD-133, PR 1 of 2: the way to read date of birth, gender and coordinates without a column grant,
-- and coordinates rounded to about 1 km. ADDITIVE ONLY: nothing is revoked here, so released builds
-- keep working. The revoke is a later migration, merged once a build that no longer selects these
-- columns is live (plan: docs/superpowers/plans/2026-11-05-profiles-sensitive-columns-privacy.md).
--
-- Why: 0119's column grant lets any signed-in user select date_of_birth, gender and location_point
-- of every other unblocked user (RLS filters rows, it cannot hide a column).
--
-- 1. get_my_private_profile(): the caller's own date_of_birth, gender, lat, lng. No target parameter,
--    so it can only ever answer for auth.uid(). Plain doubles: nobody parses EWKB.
-- 2. event_participant_genders(p_event_id): (user_id, gender) of the confirmed and waiting
--    participants of a MIXED event the caller can see, minus anyone blocked with the caller. Any
--    other event returns no rows. Non-mixed events never use a participant's gender (the client
--    reads it only in mixed branches, and _mixed_gender_full is only called for 'mixed').
-- 3. set_my_location rounds to 2 decimals (~1 km), server-side, so every build gets it; explore's
--    distance ranking doesn't need more. Existing profiles.location_point values are rounded too.
--    communities and events locations are public by design and are left alone.

create or replace function get_my_private_profile()
returns table (date_of_birth date, gender text, lat double precision, lng double precision)
language sql stable security definer set search_path = public as $$
  select p.date_of_birth,
         p.gender::text,
         st_y(p.location_point::geometry),
         st_x(p.location_point::geometry)
    from profiles p
   where p.id = auth.uid();
$$;

revoke execute on function get_my_private_profile() from public, anon;
grant execute on function get_my_private_profile() to authenticated;

create or replace function event_participant_genders(p_event_id uuid)
returns table (user_id uuid, gender text)
language sql stable security definer set search_path = public as $$
  select ep.user_id, pr.gender::text
    from events ev
    join event_participants ep on ep.event_id = ev.id
    join profiles pr on pr.id = ep.user_id
   where ev.id = p_event_id
     and ev.specification = 'mixed'
     and auth.uid() is not null
     and event_is_visible(ev.id, auth.uid())
     and ep.user_id is not null
     and ep.status in ('confirmed', 'waiting_list')
     and not is_blocked_with(ep.user_id);
$$;

revoke execute on function event_participant_genders(uuid) from public, anon;
grant execute on function event_participant_genders(uuid) to authenticated;

-- Same body as 0054, with the point rounded. Grants are unchanged by create or replace.
create or replace function set_my_location(
  p_lat  double precision,
  p_lng  double precision,
  p_text text
)
returns void
language sql volatile security definer set search_path = public as $$
  update profiles
     set location_point = case
           when p_lat is null or p_lng is null then null
           else st_setsrid(st_makepoint(round(p_lng::numeric, 2)::double precision,
                                        round(p_lat::numeric, 2)::double precision), 4326)::geography
         end,
         location_text = p_text
   where id = auth.uid();
$$;

-- Backfill: the existing exact points, rounded the same way.
update profiles
   set location_point = st_setsrid(st_makepoint(round(st_x(location_point::geometry)::numeric, 2)::double precision,
                                                round(st_y(location_point::geometry)::numeric, 2)::double precision), 4326)::geography
 where location_point is not null;

do $$
begin
  if to_regprocedure('public.get_my_private_profile()') is null
     or to_regprocedure('public.event_participant_genders(uuid)') is null then
    raise exception 'new functions missing';
  end if;
  if has_function_privilege('anon', 'public.get_my_private_profile()', 'execute')
     or has_function_privilege('anon', 'public.event_participant_genders(uuid)', 'execute') then
    raise exception 'a new function is executable by anon';
  end if;
  if not has_function_privilege('authenticated', 'public.get_my_private_profile()', 'execute')
     or not has_function_privilege('authenticated', 'public.event_participant_genders(uuid)', 'execute') then
    raise exception 'a new function is not executable by authenticated';
  end if;
  if not has_function_privilege('authenticated', 'public.set_my_location(double precision,double precision,text)', 'execute')
     or has_function_privilege('anon', 'public.set_my_location(double precision,double precision,text)', 'execute') then
    raise exception 'set_my_location grants changed';
  end if;
end $$;
