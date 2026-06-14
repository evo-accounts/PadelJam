-- Phase 1B-1: editable profile fields + avatar storage.
alter table profiles
  add column description    text,
  add column date_of_birth  date,
  add column gender         text check (gender in ('male','female')),
  add column preferred_time text check (preferred_time in ('any','morning','afternoon','night'));

-- Public avatars bucket; each user writes only their own {uid}/ folder (mirrors 0026 pattern).
insert into storage.buckets (id, name, public) values ('avatars','avatars', true)
  on conflict (id) do nothing;
create policy "avatar write: self" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar update: self" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar delete: self" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Re-create get_player_profile to also return description + preferred_time (block logic unchanged).
drop function if exists get_player_profile(uuid);
create or replace function get_player_profile(p_target uuid)
returns table (
  id uuid, full_name text, avatar_url text, dominant_hand text, court_side text, location_text text,
  description text, preferred_time text,
  played_matches bigint, best_position int, followers_count bigint, following_count bigint,
  is_following boolean, is_followed_by boolean
)
language sql stable security definer set search_path = public as $$
  select
    p.id, p.full_name, p.avatar_url, p.dominant_hand, p.court_side, p.location_text,
    p.description, p.preferred_time,
    (select count(*) from group_event_results r where r.user_id = p.id),
    (select min(r.final_placement) from group_event_results r where r.user_id = p.id),
    (select count(*) from follows f where f.followee_id = p.id),
    (select count(*) from follows f where f.follower_id = p.id),
    exists (select 1 from follows f where f.follower_id = auth.uid() and f.followee_id = p.id),
    exists (select 1 from follows f where f.follower_id = p.id and f.followee_id = auth.uid())
  from profiles p
  where p.id = p_target
    and not exists (
      select 1 from blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p_target)
         or (b.blocker_id = p_target and b.blocked_id = auth.uid())
    );
$$;
grant execute on function get_player_profile(uuid) to authenticated;
