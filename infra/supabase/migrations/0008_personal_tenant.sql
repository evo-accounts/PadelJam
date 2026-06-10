-- One transaction creates a personal tenant + community + auto general group + memberships.
-- Matches the Communities doc's "one transaction creates everything" note. Consumer UX wires
-- this in a later plan; declared now so the reconciliation seam is exercisable and seedable.
create or replace function create_community_with_personal_tenant(
  p_name        text,
  p_type        text,
  p_country     text,
  p_privacy     text default 'public',
  p_description text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user      uuid := auth.uid();
  v_tenant    uuid;
  v_community uuid;
  v_group     uuid;
begin
  if v_user is null then raise exception 'not authenticated'; end if;

  insert into tenants (type, name, country, is_personal, owner_id)
    values ('community', p_name, p_country, true, v_user)
    returning id into v_tenant;

  insert into tenant_memberships (user_id, tenant_id, role)
    values (v_user, v_tenant, 'community_owner');

  insert into communities (tenant_id, name, description, type, privacy)
    values (v_tenant, p_name, p_description, p_type, p_privacy)
    returning id into v_community;

  insert into community_members (community_id, user_id, role)
    values (v_community, v_user, 'owner');

  insert into groups (community_id, name, is_general)
    values (v_community, p_name, true)
    returning id into v_group;

  insert into group_members (group_id, user_id) values (v_group, v_user);

  return v_community;
end;
$$;
