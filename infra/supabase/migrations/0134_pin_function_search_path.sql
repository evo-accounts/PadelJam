-- Six functions get a fixed search_path. Supabase's security advisor flags each of them as
-- function_search_path_mutable (lint 0011, WARN): none sets search_path, so each resolves names
-- through whatever search_path its CALLER has. A caller who can put an object earlier on that path —
-- a temporary table or function in pg_temp, or anything in a schema listed first — decides what an
-- unqualified name inside the body means. Every other function of ours in this schema pins it;
-- these six were written before that became the habit (0022, 0045, 0048, 0076, 0096).
--
--   set_updated_at()                  0022  trigger on communities, community_permissions,
--                                           community_reviews, community_posts, groups, events
--   placement_points(integer)         0045  finishing place -> ranking points
--   _build_fours_arrangement(uuid[])  0048  the round engine's court layout
--   _csv_field(text)                  0076  CSV quoting for the email-delivery export
--   mask_email(text), mask_phone(text) 0096 the masks auth_methods_for hands to anon
--
-- WHY THE EMPTY PATH IS SAFE HERE. Each body was read for this file, and none names anything of
-- ours: they use only built-ins (now(), jsonb_build_array, jsonb_build_object, array_length,
-- position, left, substr, replace, regexp_replace, repeat, length, coalesce, the text, jsonb and
-- uuid operators) and those all live in pg_catalog, which Postgres searches first whatever
-- search_path says. So `''` — the strictest setting, and the one the lint's own remediation
-- recommends — changes nothing about what they compute. The self-check below proves that against
-- outputs captured from the current definitions before this file was written.
--
-- WHY ALTER AND NOT CREATE OR REPLACE. ALTER FUNCTION ... SET changes the one setting and leaves the
-- body, owner, volatility and grants (0094 revoked the five helpers from the API roles) exactly as
-- they are, so nothing has to be restated and nothing can drift. The flip side: a later
-- `create or replace function` of any of these REPLACES its settings too, and silently brings the
-- warning back unless it says `set search_path = ''` itself.
--
-- COST. A SQL function with a SET clause is no longer inlined into the query that calls it. These
-- four are called once per lookup, export line or ranking row, so the difference is noise.
-- Nothing depends on them but the six updated_at triggers (no index, no generated column), and an
-- ALTER does not touch a trigger.
alter function set_updated_at()                  set search_path = '';
alter function placement_points(integer)         set search_path = '';
alter function _build_fours_arrangement(uuid[])  set search_path = '';
alter function _csv_field(text)                  set search_path = '';
alter function mask_email(text)                  set search_path = '';
alter function mask_phone(text)                  set search_path = '';

-- Self-check, in the spirit of 0094/0097/0101/0132/0133. The hosted database is updated by pasting
-- this file into the dashboard SQL editor, where a partial paste or a function that now fails to
-- resolve a name would otherwise go unnoticed until a user hit it. The editor runs the whole paste as
-- one transaction, so if this raises, nothing above it lands.
do $$
declare
  v_fn      regprocedure;
  v_arr     jsonb;
  v_updated timestamptz;
begin
  -- 1. The setting is really there, on all six.
  foreach v_fn in array array[
    'public.set_updated_at()', 'public.placement_points(integer)',
    'public._build_fours_arrangement(uuid[])', 'public._csv_field(text)',
    'public.mask_email(text)', 'public.mask_phone(text)'
  ]::regprocedure[] loop
    if not exists (
      select 1 from pg_proc p
       where p.oid = v_fn
         and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%')
    ) then
      raise exception '% still has no fixed search_path', v_fn;
    end if;
  end loop;

  -- 2. They still compute exactly what they did. Every expected value below was produced by the
  -- definition this file replaces, run against the local stack on 2026-10-06.
  if public._csv_field('a,b') is distinct from '"a,b"'
     or public._csv_field(null) is distinct from ''
     or public._csv_field('x"y') is distinct from '"x""y"'
     or public._csv_field('plain') is distinct from 'plain' then
    raise exception '_csv_field changed behaviour';
  end if;

  if public.mask_email('joao@gmail.com') is distinct from 'j•••@gmail.com'
     or public.mask_email('x') is not null then
    raise exception 'mask_email changed behaviour';
  end if;

  if public.mask_phone('+351912345678') is distinct from '+351•••••5678'
     or public.mask_phone('12345') is distinct from '•••••'
     or public.mask_phone('') is not null then
    raise exception 'mask_phone changed behaviour';
  end if;

  if public.placement_points(1) is distinct from 100
     or public.placement_points(12) is distinct from 8
     or public.placement_points(13) is distinct from 5 then
    raise exception 'placement_points changed behaviour';
  end if;

  v_arr := public._build_fours_arrangement(array[
    '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b',
    '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d'
  ]::uuid[]);
  if v_arr is distinct from '[{"court_number": 1, "match_number": 1,
        "side_a": ["00000000-0000-0000-0000-00000000000a", "00000000-0000-0000-0000-00000000000d"],
        "side_b": ["00000000-0000-0000-0000-00000000000b", "00000000-0000-0000-0000-00000000000c"]}]'::jsonb
     or public._build_fours_arrangement(array[]::uuid[]) is distinct from '[]'::jsonb then
    raise exception '_build_fours_arrangement changed behaviour: %', v_arr;
  end if;

  -- set_updated_at is a trigger, so it is exercised as one: on a temporary table, which is gone
  -- when this transaction ends and never touches app data.
  create temp table _search_path_probe (id int, updated_at timestamptz) on commit drop;
  create trigger _search_path_probe_updated_at before update on _search_path_probe
    for each row execute function public.set_updated_at();
  insert into _search_path_probe values (1, null);
  update _search_path_probe set id = 2;
  select updated_at into v_updated from _search_path_probe;
  if v_updated is null then
    raise exception 'set_updated_at no longer stamps updated_at';
  end if;
  drop table _search_path_probe;
end $$;
