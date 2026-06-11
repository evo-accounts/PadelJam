-- Membership helper (mirrors is_community_admin).
create or replace function is_community_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from community_members where community_id = c and user_id = auth.uid());
$$;

-- Widen communities READ: any authenticated user may read the community ROW (join modal needs
-- general info for all privacy levels). Sensitive child data is gated per-table below.
drop policy if exists "communities: read" on communities;
create policy "communities: read" on communities for select using (auth.uid() is not null);

-- Re-scope community_members READ so the widened communities read does NOT leak rosters:
-- visible only to members/admins of the community, or for public communities (member counts/discovery).
drop policy if exists "community_members: read" on community_members;
create policy "community_members: read" on community_members for select using (
  is_community_member(community_id)
  or is_community_admin(community_id)
  or exists (select 1 from communities c where c.id = community_id and c.privacy = 'public')
);

-- join requests
create policy "cjr: read"   on community_join_requests for select
  using (user_id = auth.uid() or is_community_admin(community_id));
create policy "cjr: create" on community_join_requests for insert
  with check (user_id = auth.uid());
create policy "cjr: manage" on community_join_requests for update
  using (is_community_admin(community_id)) with check (is_community_admin(community_id));

-- invitations (no decline state)
create policy "ci: read"   on community_invitations for select
  using (invitee_id = auth.uid() or is_community_admin(community_id));
create policy "ci: create" on community_invitations for insert
  with check (is_community_admin(community_id));
create policy "ci: respond" on community_invitations for update
  using (invitee_id = auth.uid()) with check (invitee_id = auth.uid());

-- reviews (member-only; one per user via unique; eligibility >=3 events deferred)
create policy "reviews: read"  on community_reviews for select using (is_community_member(community_id));
create policy "reviews: write" on community_reviews for insert
  with check (user_id = auth.uid() and is_community_member(community_id));
create policy "reviews: edit"  on community_reviews for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- posts: read for members; update/delete author or admin (INSERT policy is in 0028 after can_create_post)
create policy "posts: read" on community_posts for select using (is_community_member(community_id));
create policy "posts: update" on community_posts for update
  using (author_id = auth.uid() or is_community_admin(community_id));
create policy "posts: delete" on community_posts for delete
  using (author_id = auth.uid() or is_community_admin(community_id));

-- likes / comments: visible with the post (member of post's community); write as self
create policy "likes: read" on post_likes for select using (
  exists (select 1 from community_posts p where p.id = post_id and is_community_member(p.community_id)));
create policy "likes: write" on post_likes for insert with check (
  user_id = auth.uid()
  and exists (select 1 from community_posts p where p.id = post_id and is_community_member(p.community_id)));
create policy "likes: unlike" on post_likes for delete using (user_id = auth.uid());

create policy "comments: read" on post_comments for select using (
  exists (select 1 from community_posts p where p.id = post_id and is_community_member(p.community_id)));
create policy "comments: write" on post_comments for insert with check (
  author_id = auth.uid()
  and exists (select 1 from community_posts p where p.id = post_id and is_community_member(p.community_id)));
create policy "comments: delete" on post_comments for delete using (
  author_id = auth.uid()
  or exists (select 1 from community_posts p where p.id = post_id and is_community_admin(p.community_id)));

-- default community: self only
create policy "udc: all" on user_default_community for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
