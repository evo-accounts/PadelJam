-- 0110_group_invitation_preview.sql
--
-- UX Audit — Groups, UX-GRP-02 (plan PR 11). A private group is invisible to everyone outside it
-- — "groups: read" (0100) admits members only — and that includes the person just invited to it.
-- So the invitation's own screen could not load the group it was inviting to, and fell through to
-- "No access": the invitation was answerable only from the notification row's inline Accept, with
-- no idea what was being accepted and no way to decline.
--
-- group_invitation_preview(g) is the one window onto a private group for someone holding a PENDING
-- invitation to it, and it shows exactly what UX-GRP-02 lists for that preview — identity and
-- context, never content: name, description, thumbnail, the member count and a handful of avatars,
-- the parent community, the creation date, and who invited you. No events, no ranking. It returns
-- nothing to anyone without a pending invitation, so it widens nothing for them.
--
-- Blocks: a blocked inviter's invitation never reached you (0061's notification trigger), but the
-- row exists; the preview hides the inviter's identity in that case and still lets you decline.
--
-- HOSTED: paste after 0109. Probe:
--   select to_regprocedure('group_invitation_preview(uuid)') is not null as has_0110;

create or replace function group_invitation_preview(p_group_id uuid)
returns table (
  group_id          uuid,
  name              text,
  description       text,
  thumbnail_path    text,
  is_private        boolean,
  created_at        timestamptz,
  member_count      integer,
  members           jsonb,
  community_id      uuid,
  community_name    text,
  community_thumb   text,
  inviter_id        uuid,
  inviter_name      text,
  inviter_avatar    text
)
language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  return query
    select g.id, g.name, g.description, g.thumbnail_path, g.is_private, g.created_at,
           (select count(*)::int from group_members gm where gm.group_id = g.id),
           coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name, 'avatar_url', p.avatar_url))
                       from (select p2.id, p2.full_name, p2.avatar_url
                               from group_members gm2 join profiles p2 on p2.id = gm2.user_id
                              where gm2.group_id = g.id
                                and not exists (select 1 from blocks b
                                                where (b.blocker_id = v_user and b.blocked_id = p2.id)
                                                   or (b.blocker_id = p2.id and b.blocked_id = v_user))
                              order by gm2.created_at
                              limit 5) p), '[]'::jsonb),
           c.id, c.name, c.thumbnail_path,
           case when blocked then null else i.inviter_id end,
           case when blocked then null else ip.full_name end,
           case when blocked then null else ip.avatar_url end
      from group_invitations i
      join groups g       on g.id = i.group_id and g.archived_at is null
      join communities c  on c.id = g.community_id
      left join profiles ip on ip.id = i.inviter_id
      cross join lateral (select exists (
        select 1 from blocks b
         where (b.blocker_id = v_user and b.blocked_id = i.inviter_id)
            or (b.blocker_id = i.inviter_id and b.blocked_id = v_user)) as blocked) bl
     where i.group_id = p_group_id and i.invitee_id = v_user and i.status = 'pending';
end; $$;
revoke execute on function group_invitation_preview(uuid) from public, anon, authenticated;
grant execute on function group_invitation_preview(uuid) to authenticated;
