-- Owns = a non-archived community where the user is 'owner'. MVP cap = 1 (Club tier lifts later).
create or replace function can_create_community() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and not exists (
    select 1 from community_members cm
    join communities c on c.id = cm.community_id
    where cm.user_id = auth.uid() and cm.role = 'owner' and c.archived_at is null
  );
$$;

-- Drop the old 5-arg signature first: adding defaulted params changes the signature, so a bare
-- CREATE OR REPLACE would leave a second overload and make 3-arg calls ambiguous.
drop function if exists create_community_with_personal_tenant(text, text, text, text, text);

create or replace function create_community_with_personal_tenant(
  p_name        text,
  p_type        text,
  p_country     text,
  p_privacy     text default 'public',
  p_description text default null,
  p_location    text default null,
  p_thumbnail_path   text default null,
  p_cover_image_path text default null,
  p_cancellation_rules_enabled boolean default false,
  p_cancellation_rules_text    text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_tenant uuid; v_community uuid; v_group uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not can_create_community() then
    raise exception 'owned_community_cap_reached' using errcode = 'P0001';
  end if;

  insert into tenants (type, name, country, is_personal, owner_id)
    values ('community', p_name, p_country, true, v_user) returning id into v_tenant;
  insert into tenant_memberships (user_id, tenant_id, role)
    values (v_user, v_tenant, 'community_owner');

  insert into communities (tenant_id, created_by, name, description, type, privacy, location,
                           thumbnail_path, cover_image_path,
                           cancellation_rules_enabled, cancellation_rules_text)
    values (v_tenant, v_user, p_name, p_description, p_type, p_privacy, p_location,
            p_thumbnail_path, p_cover_image_path,
            p_cancellation_rules_enabled, p_cancellation_rules_text)
    returning id into v_community;

  insert into community_permissions (community_id, create_posts) values (v_community, true);
  insert into community_members (community_id, user_id, role) values (v_community, v_user, 'owner');
  -- General group named "[name] group" (doc 3.2); Starter stays implicit (no community_subscriptions row).
  insert into groups (community_id, created_by, name, is_general)
    values (v_community, v_user, p_name || ' group', true) returning id into v_group;
  insert into group_members (group_id, user_id) values (v_group, v_user);

  return v_community;
end;
$$;
