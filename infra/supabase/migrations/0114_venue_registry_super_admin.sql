-- 0114_venue_registry_super_admin.sql
-- The curated venue registry (UX-CEVT-06/07) and the platform super-admin who curates it
-- (UX events plan, decision 3).
--
-- WHO IS A SUPER ADMIN. `platform_admins` is the whole answer. The `super_admin` value of the
-- `tenant_role` enum (0002) is NOT used for this: it is a per-tenant role that nothing in the
-- database ever assigns, and `packages/permissions` only reads it off `tenant_members` for CASL.
-- A platform role scoped to one tenant is a contradiction, so the registry gets its own table,
-- seeded by hand in SQL (there is deliberately no client write path):
--
--   insert into platform_admins (user_id) values ('<profiles.id>') on conflict do nothing;
--
-- WHAT A SUPER ADMIN CAN DO. Insert/update/delete `venues` and `courts` under RLS, and write the
-- public `venue-images` bucket. Everyone keeps reading exactly what they read before.
--
-- DELETION. A venue is soft-deleted (`deleted_at`), never removed: `events.venue_id` is ON DELETE
-- SET NULL, so a hard delete would silently strip the location off every past event held there.
-- A court that any event has used cannot be deleted at all (`court_in_use`): `event_courts` and
-- `event_matches.court_id` cascade/null on delete, which would rewrite history the same way.

-- venues.image_path ------------------------------------------------------------------------------
alter table venues add column if not exists image_path text;
-- A super admin creates venues from the client; created_by is theirs by default.
alter table venues alter column created_by set default auth.uid();
create index if not exists venues_name_lower_idx on venues (lower(name)) where deleted_at is null;

-- platform_admins + is_super_admin() -------------------------------------------------------------
create table if not exists platform_admins (
  user_id uuid primary key references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table platform_admins enable row level security;
-- No policies and no grants: only the service role and SECURITY DEFINER code read it.
revoke all on platform_admins from anon, authenticated;

create or replace function is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;
-- Used inside RLS policies evaluated as `authenticated`, so it MUST stay executable by that role
-- (see 0094: only helpers called exclusively from SECURITY DEFINER bodies get fully revoked).
-- It only ever answers about the caller, so exposing it as an RPC leaks nothing.
revoke execute on function is_super_admin() from public, anon;
grant execute on function is_super_admin() to authenticated;

-- venues / courts write policies (reads unchanged) -----------------------------------------------
-- `(select is_super_admin())` is evaluated once per statement, not once per row.
drop policy if exists "venues: super admin read all" on venues;
create policy "venues: super admin read all" on venues for select to authenticated
  using ((select is_super_admin()));
drop policy if exists "venues: super admin insert" on venues;
create policy "venues: super admin insert" on venues for insert to authenticated
  with check ((select is_super_admin()));
drop policy if exists "venues: super admin update" on venues;
create policy "venues: super admin update" on venues for update to authenticated
  using ((select is_super_admin())) with check ((select is_super_admin()));
drop policy if exists "venues: super admin delete" on venues;
create policy "venues: super admin delete" on venues for delete to authenticated
  using ((select is_super_admin()));

drop policy if exists "courts: super admin insert" on courts;
create policy "courts: super admin insert" on courts for insert to authenticated
  with check ((select is_super_admin()));
drop policy if exists "courts: super admin update" on courts;
create policy "courts: super admin update" on courts for update to authenticated
  using ((select is_super_admin())) with check ((select is_super_admin()));
drop policy if exists "courts: super admin delete" on courts;
create policy "courts: super admin delete" on courts for delete to authenticated
  using ((select is_super_admin()));

grant insert, update, delete on venues, courts to authenticated;

-- A court an event has used is history; it can be renamed or reordered, never deleted. -----------
-- SECURITY DEFINER so the check sees every event_courts row, including private events the admin
-- cannot read. Deleting a venue row (service role only in practice) cascades to its courts, and
-- the same guard then blocks it — use `deleted_at`.
create or replace function _guard_court_in_use() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from event_courts where court_id = old.id)
     or exists (select 1 from event_matches where court_id = old.id) then
    raise exception 'court_in_use' using errcode = 'P0001';
  end if;
  return old;
end;
$$;
revoke execute on function _guard_court_in_use() from public, anon, authenticated;
drop trigger if exists trg_guard_court_in_use on courts;
create trigger trg_guard_court_in_use before delete on courts
  for each row execute function _guard_court_in_use();

-- venue-images bucket (public read; super-admin writes) ------------------------------------------
-- Path convention: {uuid}.{ext} (flat — a new venue has no id until save_venue returns).
insert into storage.buckets (id, name, public) values ('venue-images', 'venue-images', true)
  on conflict (id) do nothing;
drop policy if exists "venue-images write: super admin" on storage.objects;
create policy "venue-images write: super admin" on storage.objects for insert to authenticated
  with check (bucket_id = 'venue-images' and (select is_super_admin()));
drop policy if exists "venue-images update: super admin" on storage.objects;
create policy "venue-images update: super admin" on storage.objects for update to authenticated
  using (bucket_id = 'venue-images' and (select is_super_admin()));
drop policy if exists "venue-images delete: super admin" on storage.objects;
create policy "venue-images delete: super admin" on storage.objects for delete to authenticated
  using (bucket_id = 'venue-images' and (select is_super_admin()));
-- (public bucket ⇒ SELECT is public via getPublicUrl)

-- search_venues: the registry list ---------------------------------------------------------------
-- The return type changes, so the 0067 function is dropped rather than replaced. Every existing
-- caller passes only `p_query`, which still works: the new parameters have defaults.
-- Changes from 0067: an empty/null query lists every venue (alphabetical, paged) instead of
-- nothing; soft-deleted venues are excluded (this is SECURITY DEFINER, so the read policy's
-- `deleted_at is null` never applied to it); `%`/`_` in the query are literal characters.
drop function if exists search_venues(text);
create or replace function search_venues(p_query text default null, p_limit int default 50, p_offset int default 0)
returns table (id uuid, name text, address text, image_path text, court_count int, rating numeric)
language sql stable security definer set search_path = public as $$
  with q as (
    select nullif(btrim(coalesce(p_query, '')), '') as term
  ), pat as (
    select '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%' as p from q
  )
  select v.id, v.name, v.address, v.image_path,
         (select count(*)::int from courts c where c.venue_id = v.id) as court_count,
         v.rating
  from venues v, q, pat
  where v.deleted_at is null
    and (q.term is null or v.name ilike pat.p or coalesce(v.address, '') ilike pat.p)
  order by lower(v.name), v.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke execute on function search_venues(text, int, int) from public, anon;
grant execute on function search_venues(text, int, int) to authenticated;

-- save_venue: create/edit a venue and its courts in one transaction --------------------------------
-- SECURITY INVOKER on purpose: the RLS policies above are the authority, this only makes the
-- multi-row write atomic. The explicit check exists to answer `forbidden` rather than a raw
-- RLS violation.
-- p_courts: [{ "id": uuid|null, "name": text }, …] in display order. Courts of the venue missing
-- from the list are deleted (and the delete fails with `court_in_use` if an event used one).
create or replace function save_venue(
  p_venue_id uuid, p_name text, p_address text, p_image_path text, p_courts jsonb
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := p_venue_id;
  v_court jsonb;
  v_ord int := 0;
  v_keep uuid[] := '{}';
  v_cid uuid;
begin
  if not is_super_admin() then raise exception 'forbidden' using errcode = 'P0001'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'name_required' using errcode = 'P0001'; end if;
  if p_courts is not null and jsonb_typeof(p_courts) <> 'array' then
    raise exception 'invalid_courts' using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into venues (name, address, image_path, created_by)
    values (btrim(p_name), nullif(btrim(coalesce(p_address, '')), ''), p_image_path, auth.uid())
    returning id into v_id;
  else
    update venues set name = btrim(p_name), address = nullif(btrim(coalesce(p_address, '')), ''),
                      image_path = p_image_path
    where id = v_id and deleted_at is null;
    if not found then raise exception 'venue_not_found' using errcode = 'P0001'; end if;
  end if;

  for v_court in select * from jsonb_array_elements(coalesce(p_courts, '[]'::jsonb)) loop
    v_ord := v_ord + 1;
    if coalesce(btrim(v_court->>'name'), '') = '' then
      raise exception 'court_name_required' using errcode = 'P0001';
    end if;
    v_cid := nullif(v_court->>'id', '')::uuid;
    if v_cid is not null then
      update courts set name = btrim(v_court->>'name'), sort_order = v_ord
      where id = v_cid and venue_id = v_id;
      if not found then v_cid := null; end if;
    end if;
    if v_cid is null then
      insert into courts (venue_id, name, sort_order) values (v_id, btrim(v_court->>'name'), v_ord)
      returning id into v_cid;
    end if;
    v_keep := v_keep || v_cid;
  end loop;

  delete from courts where venue_id = v_id and not (id = any (v_keep));
  return v_id;
end;
$$;
revoke execute on function save_venue(uuid, text, text, text, jsonb) from public, anon;
grant execute on function save_venue(uuid, text, text, text, jsonb) to authenticated;
