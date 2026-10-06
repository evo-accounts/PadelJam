-- Profile privacy follow-up, migration 0131: avatar_url can only point into the owner's own folder.
--
-- Why: profiles.avatar_url has been free text since 0003. Every writer stores a path in the public
-- `avatars` bucket under the user's own folder — mobile `{uid}/{time}-{rand}.{ext}`
-- (apps/mobile/lib/storage.ts), web `{uid}/{uuid}.{ext}` (apps/web/src/lib/upload.ts), the audit
-- seed `{uid}/audit.png` — and account deletion sets it to null. Nothing stopped a client from
-- writing an arbitrary URL (a tracking pixel shown to everyone who sees the avatar) or someone
-- else's photo path, since 0120 leaves avatar_url user-writable.
--
-- Checked on hosted before writing this (2026-10-06): 33 rows own_storage_path, 18 null, nothing
-- else — so the constraint is added VALID, no backfill.
--
-- If social sign-in ever copies a provider photo URL, that writer must upload it to the bucket
-- first (or this constraint must be revisited). Mobile's avatarUrl() still passes http(s) values
-- through for that case; web's does not.
--
-- Hosted: run this whole file as one script in the SQL editor. It only adds a CHECK; no client
-- change is needed, and the apps never write a value it rejects.

alter table public.profiles
  add constraint profiles_avatar_url_own_path check (
    avatar_url is null
    or (
      avatar_url ~ '^[0-9a-f-]{36}/[^/]+$'
      and split_part(avatar_url, '/', 1) = id::text
    )
  );
