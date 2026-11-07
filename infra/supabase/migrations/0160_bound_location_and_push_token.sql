-- PAD-163: bound set_my_location text and coordinates, and check register_push_token's shape.
-- Validation lives in the two functions (the only client path to these columns); no table
-- constraints, and no data is changed. create or replace with the same signatures keeps grants.
-- set_my_location starts from 0149's rounded body (coordinates stored to 2 decimals).

create or replace function set_my_location(
  p_lat  double precision,
  p_lng  double precision,
  p_text text
)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if char_length(p_text) > 200 then
    raise exception 'location_text_too_long' using errcode = 'P0001';
  end if;
  -- NaN sorts above every number in Postgres, so it and Infinity fail the range test too.
  if p_lat is not null and p_lng is not null
     and (p_lat not between -90 and 90 or p_lng not between -180 and 180) then
    raise exception 'invalid_coordinates' using errcode = 'P0001';
  end if;
  update profiles
     set location_point = case
           when p_lat is null or p_lng is null then null
           else st_setsrid(st_makepoint(round(p_lng::numeric, 2)::double precision,
                                        round(p_lat::numeric, 2)::double precision), 4326)::geography
         end,
         location_text = p_text
   where id = auth.uid();
end; $$;

create or replace function register_push_token(p_expo_token text, p_platform text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_platform not in ('ios','android') then raise exception 'invalid_platform' using errcode='P0001'; end if;
  if p_expo_token is null
     or char_length(p_expo_token) > 300
     or p_expo_token !~ '^Expo(nent)?PushToken\[[^\[\]\s]+\]$' then
    raise exception 'invalid_token' using errcode='P0001';
  end if;
  insert into push_tokens (user_id, expo_token, platform, updated_at)
  values (v_user, p_expo_token, p_platform, now())
  on conflict (user_id, expo_token) do update set platform = excluded.platform, updated_at = now();
end; $$;
