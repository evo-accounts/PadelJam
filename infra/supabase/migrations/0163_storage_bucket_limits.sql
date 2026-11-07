-- 0163_storage_bucket_limits.sql
-- PAD-162: five buckets had no size or file-type limit, so a signed-in user could host an HTML
-- or very large file in their own folder, and the four public buckets serve it to anyone.
-- Give them the limits venue-images has had since 0114: 5 MiB, jpeg, png and webp.
-- The limits apply at upload; stored objects are untouched.
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id in ('avatars', 'community-thumbnails', 'community-covers',
              'event-thumbnails', 'community-post-images');

do $$
declare n int;
begin
  select count(*) into n from storage.buckets
   where id in ('avatars', 'community-thumbnails', 'community-covers',
                'event-thumbnails', 'community-post-images')
     and file_size_limit = 5242880
     and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];
  if n <> 5 then
    raise exception 'storage bucket limits: expected 5 buckets updated, got %', n;
  end if;
end $$;
