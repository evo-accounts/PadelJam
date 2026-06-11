insert into storage.buckets (id, name, public) values
  ('community-thumbnails','community-thumbnails', true),
  ('community-covers','community-covers', true),
  ('community-post-images','community-post-images', false)
on conflict (id) do nothing;

-- Path convention: {communityId}/... ; the first folder segment is the community id.
create policy "thumb/cover write: admin" on storage.objects for insert to authenticated
  with check (bucket_id in ('community-thumbnails','community-covers')
              and is_community_admin(((storage.foldername(name))[1])::uuid));
create policy "thumb/cover update: admin" on storage.objects for update to authenticated
  using (bucket_id in ('community-thumbnails','community-covers')
         and is_community_admin(((storage.foldername(name))[1])::uuid));
create policy "thumb/cover delete: admin" on storage.objects for delete to authenticated
  using (bucket_id in ('community-thumbnails','community-covers')
         and is_community_admin(((storage.foldername(name))[1])::uuid));
-- (public buckets ⇒ SELECT is public via getPublicUrl)

create policy "post-img read: member" on storage.objects for select to authenticated
  using (bucket_id = 'community-post-images'
         and is_community_member(((storage.foldername(name))[1])::uuid));
create policy "post-img write: member" on storage.objects for insert to authenticated
  with check (bucket_id = 'community-post-images'
              and is_community_member(((storage.foldername(name))[1])::uuid));
