-- UX-COMM audit (docs/audit/2026-09-14-ux-community.md), the read that UX-COMM-04 assumed.
--
-- UX-COMM-04 says of a community someone is previewing: "Public: all tabs accessible from the
-- preview — Posts, Events, Groups, Members, About". PR 5 shipped the preview and could not ship
-- those tabs, because a non-member could read none of them:
--
--   community_posts    "posts: read"    is_community_member(community_id)              (0024)
--   post_likes         "likes: read"    member of the post's community                 (0024)
--   post_comments      "comments: read" member of the post's community                 (0024)
--   groups             "groups: read"   is_private = false AND is_community_member     (0099)
--   community_reviews  "reviews: read"  is_community_member(community_id)              (0024)
--   events             "events: read"   event_is_visible -> organizer/participant/
--                                       invitee/GROUP MEMBER                           (0044)
--
-- community_members was already widened for public communities in 0024 ("member counts/
-- discovery"), and the community ROW has been readable to any authenticated user since the same
-- migration. This finishes that thought for the rest of a public community's content.
--
-- SAY THIS PLAINLY, BECAUSE IT IS THE WHOLE MIGRATION: a public community's posts, comments,
-- likes, open groups, non-private group events and reviews become readable by ANY signed-in
-- user, member or not. That is what "public" is asked to mean here, and the app already leaks
-- the shape of it — Explore lists public communities by name, description and location, and the
-- roster has been readable since 0024. It is still a real widening, and a member who assumed
-- "posts are for members" was right until this migration. Anyone who does not want it has the
-- other two privacy modes, which this does not touch at all.
--
-- WHAT DOES NOT WIDEN: every write. "likes: write", "comments: write" and 0028's "posts: create"
-- all still demand is_community_member, so a non-member reads a public community and cannot
-- post, comment or like in it. Nor does anything here touch request_to_join or private
-- communities, whose child data stays members-only exactly as before.
--
-- AND IT STOPS AT SIGNED-IN. Every branch added below is paired with an explicit
-- `auth.uid() is not null`, because community_is_public() asks only about the COMMUNITY and
-- would otherwise answer the same for an anonymous caller — handing the public internet what was
-- meant for signed-in users. That guard is written out at each site rather than hidden in the
-- helper: this is a security change, and the reviewer should see it at every policy it governs.
-- It matches "communities: read", which has required auth.uid() since 0024.

------------------------------------------------------------------------------
-- 1. The rule, written once
------------------------------------------------------------------------------
-- Every policy below asks the same question, so it is a function rather than five copies of a
-- subquery that could drift apart. ARCHIVED IS EXCLUDED: 0099 made an archived community
-- readable to its admins alone, and a public-readability rule that ignored archived_at would
-- quietly undo that for every table this migration touches.
create or replace function community_is_public(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from communities
     where id = c and privacy = 'public' and archived_at is null
  );
$$;

comment on function community_is_public(uuid) is
  'True when the community is public AND not archived — the condition under which a NON-MEMBER '
  'may read its content (UX-COMM-04 preview tabs). Read-only: no write policy references it.';

-- No revoke here, deliberately. 0094 closed internal helpers to public/anon/authenticated but
-- kept the ones named in RLS policies, because "policy expressions run as the calling role and
-- DO need the grant". This is one of those, so it keeps the default EXECUTE like
-- is_community_member and is_community_admin beside it.

------------------------------------------------------------------------------
-- 2. Posts, and the two tables that render with them
------------------------------------------------------------------------------
-- The Posts tab reads likes and comments as aggregate counts embedded in the post row
-- (`likes:post_likes(count)`), so widening posts alone would show every post with 0 likes and
-- 0 comments — worse than not showing the tab, because it looks like data rather than absence.
drop policy if exists "posts: read" on community_posts;
create policy "posts: read" on community_posts for select using (
  is_community_member(community_id)
  or (auth.uid() is not null and community_is_public(community_id))
);

drop policy if exists "likes: read" on post_likes;
create policy "likes: read" on post_likes for select using (
  exists (
    select 1 from community_posts p
     where p.id = post_id
       and (
         is_community_member(p.community_id)
         or (auth.uid() is not null and community_is_public(p.community_id))
       )
  )
);

drop policy if exists "comments: read" on post_comments;
create policy "comments: read" on post_comments for select using (
  exists (
    select 1 from community_posts p
     where p.id = post_id
       and (
         is_community_member(p.community_id)
         or (auth.uid() is not null and community_is_public(p.community_id))
       )
  )
);

------------------------------------------------------------------------------
-- 3. Groups
------------------------------------------------------------------------------
-- Only OPEN groups (is_private = false), and only while the community is not archived — the
-- archived clause is 0099's and is preserved verbatim. A private group stays visible to its own
-- members alone, which is the `is_group_member(id)` branch, untouched.
drop policy if exists "groups: read" on groups;
create policy "groups: read" on groups for select using (
  (
    (
      is_private = false
      and (
        is_community_member(community_id)
        or (auth.uid() is not null and community_is_public(community_id))
      )
    )
    or is_group_member(id)
  )
  and (archived_at is null or is_community_admin(community_id))
);

------------------------------------------------------------------------------
-- 4. Reviews
------------------------------------------------------------------------------
-- UX-COMM-12 puts the rating on About, which is the preview's default tab. Writing a review is
-- unchanged and still requires membership plus the three-completed-events gate (0069).
drop policy if exists "reviews: read" on community_reviews;
create policy "reviews: read" on community_reviews for select using (
  is_community_member(community_id)
  or (auth.uid() is not null and community_is_public(community_id))
);

------------------------------------------------------------------------------
-- 5. Events — a NEW BRANCH, not a wider definition
------------------------------------------------------------------------------
-- event_is_visible is shared by every event surface there is: the events list, Explore, My
-- Events, deep links, the detail screen. Loosening its existing branches would widen all of
-- them at once. So the public-community case is added as its own branch, as narrow as it can be
-- and still answer "what events does this community run":
--
--   * the event is NOT private, and
--   * it belongs to a group, and that group is NOT private, and
--   * that group's community is public and unarchived.
--
-- A private event, or any event in a private group, remains invisible to a non-member exactly
-- as before. Everything above this line in the function is 0044's, unchanged.
create or replace function event_is_visible(e uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from events ev where ev.id = e and ev.deleted_at is null and (
      ev.organizer_id = u
      or exists (select 1 from event_participants p where p.event_id = e and p.user_id = u)
      or exists (select 1 from event_invitations i where i.event_id = e and i.invitee_id = u)
      or (ev.is_private = false and ev.group_id is not null
          and exists (select 1 from group_members gm where gm.group_id = ev.group_id and gm.user_id = u))
      -- UX-COMM-04: a public community's events are part of its preview. `u is not null` is
      -- the anonymous guard — this is the one branch that asks nothing about the caller, so
      -- without it every other branch's "who are you" would be bypassable by not being anyone.
      or (u is not null and ev.is_private = false and ev.group_id is not null
          and exists (
            select 1 from groups g
             where g.id = ev.group_id
               and g.is_private = false
               and community_is_public(g.community_id)
          ))
    )
  );
$$;

------------------------------------------------------------------------------
-- 6. The member COUNT, without the roster
------------------------------------------------------------------------------
-- UX-COMM-04 shows the attribute widgets — type, MEMBER COUNT, privacy — on a request-to-join
-- preview as well as a public one. "community_members: read" (0024) gives an outsider the roster
-- of a public community and nothing at all for the other two modes, so the count was the one
-- attribute the preview could not fill: RLS hands back an empty array, which renders as a
-- confident "0" for a community with fifty people in it.
--
-- Widening that policy to request_to_join would hand over every member's identity to answer a
-- question about arithmetic. This returns the number instead. The names stay behind RLS, exactly
-- where they were.
--
-- Any signed-in caller, any non-archived community, including private: the community ROW — name,
-- description, location — has been readable to every authenticated user since 0024, so a head
-- count beside it discloses nothing that the row did not already.
create or replace function community_member_count(c uuid) returns integer
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then null
    else (
      select count(*)::int
        from community_members m
        join communities co on co.id = m.community_id
       where m.community_id = c
         and co.archived_at is null
    )
  end;
$$;

comment on function community_member_count(uuid) is
  'Head count for a community the caller may not be able to enumerate (UX-COMM-04 attribute '
  'widgets). Returns null to an anonymous caller. Deliberately NOT a roster read.';

revoke execute on function community_member_count(uuid) from public, anon, authenticated;
grant execute on function community_member_count(uuid) to authenticated;
