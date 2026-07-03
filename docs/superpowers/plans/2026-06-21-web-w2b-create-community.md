# Web W2b — Create Community Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a community (with thumbnail + cover) on web and land on a shareable success screen (Share + copy-link + QR).

**Architecture:** A create form (`/app/community/create`) validated by the shared `createCommunitySchema`, a create→upload→update flow that respects the storage RLS ordering, and a success screen (`/app/community/[id]/created`) with QR + share. New upload helper + `qrcode.react` dep + i18n keys.

**Tech Stack:** Next.js App Router (client), `@padel/api`, shadcn/ui, Supabase storage, `qrcode.react`.

**Verified facts:** `createCommunitySchema` (camelCase) = `{ name (1-80), description?, location?, type: enum COMMUNITY_TYPES (club|team|friends), privacy: enum PRIVACY (public|request_to_join|private), thumbnailPath?, coverImagePath?, rules: { enabled, text? } }` with a refine `rules.enabled ⇒ text` (msg `rules_text_required`). `useCreateCommunity().mutateAsync(input & { country })` → returns new community **id**. `useUpdateCommunity(id).mutateAsync({ thumbnail_path, cover_image_path })` — **snake_case**. Buckets `community-thumbnails`/`community-covers` RLS need path `{communityId}/…` + creator-admin (so upload AFTER create).

---

## Task 1: upload helper + qrcode dep + i18n keys

**Files:** modify `apps/web/src/lib/upload.ts`, `apps/web/src/lib/i18n-web.ts`, `apps/web/package.json`.

- [ ] **Step 1:** Add to `apps/web/src/lib/upload.ts`:
```ts
export async function uploadCommunityImage(
  file: File,
  communityId: string,
  bucket: 'community-thumbnails' | 'community-covers',
): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('image_invalid_type');
  if (file.size > 5 * 1024 * 1024) throw new Error('image_too_large');
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${communityId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  return path;
}
```
(reuses the existing `supabase` import in that file.)
- [ ] **Step 2:** `pnpm --filter web add qrcode.react` (installs the dep).
- [ ] **Step 3:** Extend the `webCommunity` i18n bundle (all 3 locales) with create/success keys. English:
```
createTitle:'Create community', nameLabel:'Name', namePlaceholder:'Community name', descriptionLabel:'Description',
locationLabel:'Location', typeLabel:'Type', privacyLabel:'Privacy', thumbnailLabel:'Thumbnail', coverLabel:'Cover image',
rulesToggle:'Cancellation & attendance rules', rulesTextLabel:'Rules', rules_text_required:'Add the rules text or turn the toggle off.',
createCta:'Create', creating:'Creating…', createError:'Could not create the community. Please try again.',
imageWarning:'Community created, but an image failed to upload. You can set it later.',
createdTitle:'Community created!', createdBody:'Share it so players can join.', share:'Share', copyLink:'Copy link', linkCopied:'Link copied',
viewCommunity:'View community', manage:'Manage', createEvent:'Create event', notAllowed:'You can’t create a community right now.'
```
- [ ] **Step 4:** `pnpm --filter web typecheck` → PASS. Commit: `git add apps/web/src/lib/upload.ts apps/web/src/lib/i18n-web.ts apps/web/package.json pnpm-lock.yaml && git commit -m "feat(web): community image upload + qrcode dep + create i18n (W2b)"`

---

## Task 2: Create form `/app/community/create`

**Files:** create `apps/web/src/app/(app)/app/community/create/page.tsx`.

- [ ] **Step 1:** Client page. Gate: `const canCreate = useCanCreateCommunity();` — if `canCreate.data === false`, render a `notAllowed` notice with a link back to `/app/community` (still render hooks unconditionally first). Controlled state: name, description, location, type (default `'club'`), privacy (default `'public'`), thumbnailFile/coverFile (+ object-URL previews, revoke on change/unmount), rulesEnabled, rulesText, error, busy.
- [ ] **Step 2:** Form UI: `Input` name, `Textarea` description, `Input` location, `Select` type (club/team/friends → `t('typeClub|typeTeam|typeFriends')`), `Select` privacy (→ `t('privacyPublic|privacyRequest|privacyPrivate')`), two file inputs (thumbnail, cover) with previews, a `Switch` rulesEnabled + (when on) a required `Textarea` rulesText. Submit `Button` (`creating` while busy).
- [ ] **Step 3:** Submit handler:
```ts
import { createCommunitySchema } from '@padel/api';
// ...
const parsed = createCommunitySchema.safeParse({ name, description: description || undefined, location: location || undefined, type, privacy, rules: { enabled: rulesEnabled, text: rulesText || undefined } });
if (!parsed.success) { setError(t(parsed.error.issues[0]?.message ?? 'createError')); return; }
setBusy(true);
try {
  const country = i18n.language === 'pt-BR' ? 'BR' : 'PT';
  const id = await create.mutateAsync({ ...parsed.data, country });
  let warn = false;
  try {
    const thumbnail_path = thumbnailFile ? await uploadCommunityImage(thumbnailFile, id, 'community-thumbnails') : null;
    const cover_image_path = coverFile ? await uploadCommunityImage(coverFile, id, 'community-covers') : null;
    if (thumbnail_path || cover_image_path) await update(id).mutateAsync({ thumbnail_path, cover_image_path });
  } catch { warn = true; }
  router.push(`/app/community/${id}/created${warn ? '?warn=1' : ''}`);
} catch (e) { setError(t('createError')); } finally { setBusy(false); }
```
where `create = useCreateCommunity()`, and call `useUpdateCommunity` carefully — it takes `communityId` as an arg to the hook, so you cannot call it after you have the id inside the handler (hooks can't be called conditionally/late). **Resolve this** by doing the update with a direct supabase call OR by structuring the update via a one-off: `await supabase.from('communities').update({ thumbnail_path, cover_image_path }).eq('id', id)` (the creator is owner → RLS allows). Prefer the direct `supabase.from('communities').update(...)` to avoid the hook-arg problem. (`i18n` from `useTranslation()`.)
- [ ] **Step 4:** `pnpm --filter web typecheck` → PASS. Commit: `... -m "feat(web): create community form (W2b)"`

---

## Task 3: Success screen `/app/community/[id]/created`

**Files:** create `apps/web/src/app/(app)/app/community/[id]/created/page.tsx`.

- [ ] **Step 1:** Client page. `const { id } = useParams<{id:string}>();` `const url = typeof window !== 'undefined' ? \`${window.location.origin}/app/community/${id}\` : '';` (compute in an effect/state to avoid SSR mismatch). Show `createdTitle` + `createdBody`; if `useSearchParams().get('warn')` → show `imageWarning`.
- [ ] **Step 2:** `<QRCodeSVG value={url} size={200} />` (import `{ QRCodeSVG } from 'qrcode.react'`). **Share**: a `Button` →
```ts
if (navigator.share) { await navigator.share({ url }); }
else { await navigator.clipboard.writeText(url); setCopied(true); }
```
plus a **Copy link** `Button` → `navigator.clipboard.writeText(url)` + `linkCopied` feedback.
- [ ] **Step 3:** Actions: `Button asChild` → `/app/community/${id}` (`viewCommunity`); disabled `Button`s for `manage` + `createEvent` (coming soon).
- [ ] **Step 4:** `pnpm --filter web typecheck` + `build` → PASS. Commit: `... -m "feat(web): community created success + QR/share (W2b)"`

---

## Task 4: End-to-end verification (browser)

No code. `pnpm --filter web dev` against local Supabase; headless Chrome.

- [ ] **Step 1:** typecheck + build → PASS.
- [ ] **Step 2:** Sign in → `/app/community` → Create → `/app/community/create`.
- [ ] **Step 3:** Fill name + type + privacy, pick a thumbnail + cover, submit → lands on `/app/community/[id]/created` with a QR + Share.
- [ ] **Step 4:** Confirm objects exist in `community-thumbnails/{id}/…` and `community-covers/{id}/…` (Studio/API), and the community row has the paths.
- [ ] **Step 5:** View community → W2a detail shows the cover + thumbnail. (Rules-enabled create → the detail About shows the rules text.)

---

## Verification (summary)
Per-task typecheck; build after Task 3; browser smoke (Task 4). Finish via superpowers:finishing-a-development-branch.

## Out of scope
Posts/reviews (W2c); manage (W2d); create-event (W4); editing images later (W2d).
