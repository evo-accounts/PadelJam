# Size and file-type limits on the storage buckets (PAD-162)

Written and approved by the CTO. Found in the PAD-156 audit, on the local stack. Not verified on production.

## The problem

Five buckets have no `file_size_limit` and no `allowed_mime_types`: `avatars`, `community-thumbnails`, `community-covers`, `event-thumbnails` and `community-post-images`. Their RLS holds, but a signed-in user can put an HTML file or a very large file in their own folder, and the four public buckets serve it to anyone. The only limit is the project-wide 50 MiB in `config.toml`.

## The decision

Give all five the limits `venue-images` already has (0114): 5 MiB, `image/jpeg`, `image/png`, `image/webp`.

- **Why these values:** both clients already stop at 5 MB. Mobile already allows only these three types (`apps/mobile/lib/storage.ts`), so no store build is needed and released apps keep working.
- **Migration only, not `config.toml`.** It reaches local and hosted the same way, and `venue-images` isn't in `config.toml` either. `[storage.buckets.*]` would add a second source of truth.
- **Existing files stay.** The limits apply at upload, so stored images keep working. Finding and removing any bad files already stored is a separate step (see **After the merge**).

## The change

### 1. Migration

Take the next free number when you open the PR: `0149` and `0150` are already used on the PAD-133 and PAD-166 branches, and other security fixes are in flight.

```sql
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id in ('avatars', 'community-thumbnails', 'community-covers',
              'event-thumbnails', 'community-post-images');
```

Add a `do $$` self-check that raises unless all five rows now have the limit, so a missing bucket fails the migration rather than passing quietly. It updates and doesn't delete, so the migrations workflow shouldn't hold it.

### 2. Web client

The web checks only `file.type.startsWith('image/')`. After the migration, a GIF, HEIC or SVG would pass that check and then get a raw storage error.

- In `packages/api`, next to `VENUE_IMAGES_BUCKET`, export `IMAGE_MIME_TYPES`, `IMAGE_MAX_BYTES` and `IMAGE_ACCEPT` (the comma-joined list).
- `apps/web/src/lib/upload.ts`: use them in all four upload functions, keeping the existing error codes.
- `accept="image/*"` becomes `accept={IMAGE_ACCEPT}` on the 8 inputs (`git grep 'accept="image'`). This matters beyond tidiness: with a specific list, iOS Safari should convert HEIC to JPEG instead of sending HEIC. Confirm on a test if you can; say so in the PR if you can't.
- `image_invalid_type` and `avatar_invalid_type` say to choose an image, which is wrong for a refused GIF. Change them to name the three types, in pt-PT, pt-BR and en.

### 3. Mobile client

`apps/mobile/lib/storage.ts` takes `ALLOWED_MIME` and `MAX_BYTES` from the same shared constants. Behaviour doesn't change. If the `@padel/api` import breaks `storage.ts`'s pure unit test, keep the test by mocking it as `bootRouting.test.ts` does.

**Out of scope:** the sweep of other text inputs (PAD-163), the bucket read policies, and removing stored files.

## Tests

New `infra/supabase/tests/storage-bucket-limits.test.mjs`, following the upload helper in `venue-registry.test.mjs`. Each case uses an uploader who passes RLS, so a refusal can only come from the limit:

- For each of the five buckets, `text/html` is refused. This is the finding's reproduction.
- `avatars`: `image/svg+xml` is refused, a file just over 5 MiB as `image/jpeg` is refused, and a small `image/jpeg` is accepted.
- `community-post-images`: a small `image/webp` is accepted.
- Every row in `storage.buckets` has a non-null `file_size_limit` and `allowed_mime_types`, so a future bucket can't be added without them.

Web: unit tests for the shared check, if `upload.ts`'s callers have a test seam. A GIF is refused with `image_invalid_type`, and a JPEG over 5 MB with the too-large code.

## Checks before hand-off

`pnpm lint && pnpm typecheck && pnpm tokens:check && pnpm i18n:check && pnpm size:check && pnpm test && pnpm test:functions && pnpm test:db`

Local stack only. Never touch hosted.

## After the merge (CTO)

1. Confirm the `Apply to hosted database` job passed.
2. Send the founder one `Founder:` task with a read-only query counting stored objects by bucket whose `metadata->>'mimetype'` isn't one of the three types, and objects over 5 MiB. It shows whether anyone has already used this. Whether to delete any is the founder's decision.
