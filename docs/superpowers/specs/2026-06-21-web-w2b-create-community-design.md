# Web W2b — Create Community — Design

**Slice:** Web W2b (second of four W2 sub-slices). Adds community **creation** + a success/share screen.

## Goal

Let an eligible user create a community (with thumbnail + cover) on web and land on a shareable success screen
(Share + copy link + QR), reusing `@padel/api`.

## Routes (under `apps/web/src/app/(app)/app/community/`, auth-gated)

- **`/app/community/create`** — creation form. Gate on `useCanCreateCommunity()` (redirect/notice if false).
  Fields: **name** (req, ≤80), **description**, **location**, **type** (`Select`: club/team/friends),
  **privacy** (`Select`: public / request_to_join / private), **thumbnail** + **cover** image pickers
  (`<input type="file" accept="image/*">` + preview), **cancellation rules** (`Switch`; when on, a required
  `Textarea`). Validate with the shared `createCommunitySchema` (`@padel/api`); map `rules_text_required` +
  field errors inline.
- **`/app/community/[id]/created`** — success: "Community created!" headline, **Share** (Web Share API with a
  copy-link fallback), a **QR code** of the community URL, and action buttons: **View community**
  (`/app/community/[id]`), **Manage** (disabled/coming-soon → W2d), **Create event** (disabled/coming-soon → W4).

## Create flow (handles the storage-RLS ordering)

The `community-thumbnails`/`covers` buckets require `is_community_admin(communityId)` with path
`{communityId}/…`, so images cannot be uploaded before the community exists. Therefore:
1. `const id = await useCreateCommunity().mutateAsync({ ...parsed, thumbnailPath: undefined, coverImagePath: undefined, country })` — `parsed` is `createCommunitySchema.parse(form)`; `country = i18n.language === 'pt-BR' ? 'BR' : 'PT'`.
2. If a thumbnail/cover file was picked: `uploadCommunityImage(file, id, 'community-thumbnails' | 'community-covers')` → returns the stored path (`{id}/${uuid}.${ext}`; creator is now admin so RLS passes).
3. `await useUpdateCommunity(id).mutateAsync({ thumbnail_path: thumbPath ?? null, cover_image_path: coverPath ?? null })` (note: **update uses snake_case** column names).
4. `router.push('/app/community/${id}/created')`.
If image upload/update fails, the community still exists — surface a non-fatal inline warning and proceed to the
success screen (images can be set later in W2d).

## New code

- `lib/upload.ts` gains `uploadCommunityImage(file: File, communityId: string, bucket: 'community-thumbnails' | 'community-covers'): Promise<string>` — validates image type + size (~5MB), uploads to `${communityId}/${crypto.randomUUID()}.${ext}`, returns the path. (Mirrors `uploadAvatar`.)
- **QR dependency:** add `qrcode.react`; render `<QRCodeSVG value={communityUrl} size={200} />` on the success screen. `communityUrl = ${window.location.origin}/app/community/${id}` (guard `window` for SSR — the success page is a client component).

## Reuse

`@padel/api`: `useCreateCommunity`, `useUpdateCommunity`, `useCanCreateCommunity`, `createCommunitySchema`
(+ `COMMUNITY_TYPES`/`PRIVACY` enums). `communityImageUrl` (W2a) is for display; uploads use the new helper.
shadcn `Select`/`Switch`/`Textarea`/`Input`/`Button`/`Card`/`Label` (all present). Extend the `community` i18n
namespace (en/pt-PT/pt-BR) with create + success keys.

## Error / edge handling

- Form: zod field errors inline; rules text required when rules enabled.
- Not eligible (`!canCreate`): show a notice / redirect to `/app/community`.
- Create RPC error → inline error, stay on form.
- Image step failure → non-fatal warning, still go to success.

## Verification

`pnpm --filter web typecheck` + `build`; browser (local Supabase, headless Chrome): `/app/community/create` →
fill name/type/privacy + pick a thumbnail + cover → submit → community created, images land in
`community-thumbnails/{id}/…` + `community-covers/{id}/…`, lands on `/app/community/[id]/created` showing the QR
+ Share; View community → the new community detail (W2a) shows the cover/thumbnail.

## Out of scope

Posts/reviews (W2c); manage (W2d); create-event (W4); editing an existing community's images (W2d); deep-link
QR to a native app (web URL only).
