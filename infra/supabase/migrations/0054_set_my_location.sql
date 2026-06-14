-- Persist the caller's own location. The geography point is built server-side so the client
-- never hand-encodes WKT/SRID. Null lat/lng clears the point (a manual address that couldn't
-- be geocoded is stored as text only). SECURITY DEFINER, but scoped to auth.uid()'s own row.
-- PostGIS point order is (longitude, latitude).
create or replace function set_my_location(
  p_lat  double precision,
  p_lng  double precision,
  p_text text
)
returns void
language sql volatile security definer set search_path = public as $$
  update profiles
     set location_point = case
           when p_lat is null or p_lng is null then null
           else st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
         end,
         location_text = p_text
   where id = auth.uid();
$$;

grant execute on function set_my_location(double precision, double precision, text) to authenticated;
