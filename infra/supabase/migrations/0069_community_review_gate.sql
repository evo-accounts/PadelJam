-- CM-40: a member may write/edit a community review only after participating
-- (confirmed roster) in >= 3 COMPLETED events whose group belongs to the community.

create or replace function can_review_community(p_community_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select (
    select count(distinct ep.event_id)
    from event_participants ep
    join events e on e.id = ep.event_id
    join groups  g on g.id = e.group_id
    where ep.user_id = auth.uid()
      and ep.status  = 'confirmed'
      and e.status   = 'completed'
      and g.community_id = p_community_id
  ) >= 3;
$$;

create or replace function upsert_community_review(
  p_community_id uuid,
  p_rating       smallint,
  p_body         text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_community_member(p_community_id) then
    raise exception 'not_a_member' using errcode = 'P0001';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_rating' using errcode = 'P0001';
  end if;
  if not can_review_community(p_community_id)
     and not exists (
       select 1 from community_reviews
       where community_id = p_community_id and user_id = auth.uid()
     ) then
    raise exception 'review_requires_participation' using errcode = 'P0001';
  end if;

  insert into community_reviews (community_id, user_id, rating, body)
  values (p_community_id, auth.uid(), p_rating, nullif(btrim(p_body), ''))
  on conflict (community_id, user_id)
  do update set rating = excluded.rating, body = excluded.body, updated_at = now();
end;
$$;

grant execute on function can_review_community, upsert_community_review to authenticated;

drop policy "reviews: write" on community_reviews;
create policy "reviews: write" on community_reviews for insert
  with check (
    user_id = auth.uid()
    and is_community_member(community_id)
    and can_review_community(community_id)
  );

-- The pre-existing UPDATE policy only checked ownership, leaving a direct-PostgREST
-- write surface parallel to the RPC. The >=3 gate lives at INSERT (creating the first
-- review), so editing only needs to stay scoped to current members of the community
-- (matches the RPC's is_community_member check; preserves "existing reviewers may edit").
drop policy "reviews: edit" on community_reviews;
create policy "reviews: edit" on community_reviews for update
  using (user_id = auth.uid() and is_community_member(community_id))
  with check (user_id = auth.uid() and is_community_member(community_id));
