# Web W2c — Posts Feed + Reviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Community posts feed (compose/like/comment, photo via signed URLs, realtime) + post detail + reviews (rating block, list, write).

**Architecture:** New helpers (signed post-image URL + post-image upload), shared components, the Posts tab in the community detail wired to the real feed, a post-detail route, and reviews routes. Data via `@padel/api`.

**Tech Stack:** Next.js App Router (client), `@padel/api` (react-query, realtime), Supabase storage (private bucket signed URLs), shadcn/ui.

**Verified shapes:** `useCommunityPosts(id)`/`usePost(postId)` → post `{ id, community_id, author_id, body, image_path, created_at, author: {full_name,avatar_url}, likes:[{count}], comments:[{count}], mine:[{user_id}] }` (likedByMe=`mine.length>0`, likeCount=`likes[0]?.count??0`, commentCount=`comments[0]?.count??0`). `useComments(postId)` → `{id,post_id,author_id,body,created_at,author:{...}}[]`. `useCreatePost(id).mutate({body,imagePath?})`. `useToggleLike(id).mutate({postId,liked})` (optimistic). `useAddComment().mutate({postId,communityId,body})`. `useCommunityReviews(id)` → `{reviews:[{rating,body,created_at,profiles}],average,count}`. `useCanReviewCommunity(id)`→bool. `useUpsertReview(id).mutate({rating,body?})`. `useCommunityPermissions(id)` → row incl. `members_create_posts`. `useCommunityFeedRealtime(id)`. Confirm exact field names in `packages/api/src/communities/queries.ts` before use.

---

## Task 1: Helpers + StarRating + i18n

**Files:** modify `apps/web/src/lib/community-images.ts`, `apps/web/src/lib/upload.ts`, `apps/web/src/lib/i18n-web.ts`; create `apps/web/src/components/community/StarRating.tsx`.

- [ ] **Step 1:** In `community-images.ts` add the async signed-URL helper:
```ts
export async function postImageUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from('community-post-images').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
```
- [ ] **Step 2:** In `upload.ts` add:
```ts
export async function uploadPostImage(file: File, communityId: string): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('image_invalid_type');
  if (file.size > 5 * 1024 * 1024) throw new Error('image_too_large');
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${communityId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('community-post-images').upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  return path;
}
```
- [ ] **Step 3:** `StarRating.tsx` — a dual-purpose component:
```tsx
'use client';
import { Star } from 'lucide-react';
export function StarRating({ value, onChange, size = 20 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={!onChange} onClick={() => onChange?.(n)} className={onChange ? 'cursor-pointer' : 'cursor-default'} aria-label={`${n} stars`}>
          <Star size={size} className={n <= value ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'} />
        </button>
      ))}
    </div>
  );
}
```
- [ ] **Step 4:** Extend `webCommunity` i18n (all 3 locales) with keys: `feed, writePost, postPlaceholder, post, posting, like, comment, comments, addComment, send, emptyFeed, postError, rating, reviews, reviewsCount, writeReview, reviewPlaceholder, submitReview, reviewSubmitted, noReviews, average, addPhoto, commentPlaceholder`. (English values sensible; translate pt.)
- [ ] **Step 5:** `pnpm --filter web typecheck` → PASS. Commit: `git add apps/web/src/lib apps/web/src/components/community/StarRating.tsx && git commit -m "feat(web): post-image signed-url + upload helpers + StarRating + i18n (W2c)"`

---

## Task 2: Post components (PostImage, PostCard, PostComposer, CommentList, ReviewCard)

**Files:** create `apps/web/src/components/community/{PostImage,PostCard,PostComposer,CommentList,ReviewCard}.tsx`.

- [ ] **Step 1: `PostImage.tsx`** — resolves the private signed URL:
```tsx
'use client';
import { useEffect, useState } from 'react';
import { postImageUrl } from '@/lib/community-images';
export function PostImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let on = true; postImageUrl(path).then((u) => on && setUrl(u)); return () => { on = false; }; }, [path]);
  if (!url) return <div className="h-48 w-full rounded-md bg-muted" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="max-h-96 w-full rounded-md object-cover" />;
}
```
- [ ] **Step 2: `PostCard.tsx`** — props `{ post; communityId }`. Author avatar (`avatarUrl(post.author?.avatar_url)`) + name + relative date, body, `{post.image_path && <PostImage path={post.image_path} />}`, a like button (`useToggleLike(communityId).mutate({postId:post.id, liked: likedByMe})`, derive likedByMe/count from `post.mine`/`post.likes`), and a comment count linking to `/app/community/${communityId}/post/${post.id}`.
- [ ] **Step 3: `PostComposer.tsx`** — props `{ communityId; canPost: boolean }`. If `!canPost` return null. `Textarea` body + optional image `<input type=file>` (preview + revoke). Submit → `const create = useCreatePost(communityId);` if file `const imagePath = await uploadPostImage(file, communityId);` then `create.mutate({ body, imagePath })`; clear on success; disable while pending or empty body.
- [ ] **Step 4: `CommentList.tsx`** — props `{ comments }`. Rows: author avatar+name + body + date.
- [ ] **Step 5: `ReviewCard.tsx`** — props `{ review }`. `StarRating value={review.rating}` (read-only) + body + author (`review.profiles`) + date.
- [ ] **Step 6:** `pnpm --filter web typecheck` → PASS. Commit: `... -m "feat(web): post/comment/review components (W2c)"`

---

## Task 3: Posts feed in the community detail Posts tab

**Files:** modify `apps/web/src/app/(app)/app/community/[id]/page.tsx`.

- [ ] **Step 1:** Add at the top of the component: `useCommunityFeedRealtime(id);` `const posts = useCommunityPosts(id); const perms = useCommunityPermissions(id);` (call unconditionally, before any early return). Derive `canPost`: member AND (`perms.data?.members_create_posts` OR my role is owner/admin) — reuse `mineRow.role` from W2a. (Verify the permission field name.)
- [ ] **Step 2:** Replace the **Posts** `TabsContent` "coming soon" with: `<PostComposer communityId={id} canPost={canPost} />` then `posts.isLoading ? <Skeleton/>` : empty → `t('emptyFeed')` : `posts.data.map(p => <PostCard key={p.id} post={p} communityId={id} />)`.
- [ ] **Step 3:** In the **About** tab, add the rating block: `const reviews = useCommunityReviews(id);` show `<StarRating value={Math.round(reviews.data?.average ?? 0)} />` + `t('reviewsCount',{count: reviews.data?.count ?? 0})` linking to `/app/community/${id}/reviews`.
- [ ] **Step 4:** `pnpm --filter web typecheck` + `build` → PASS. Commit: `... -m "feat(web): community posts feed + rating block (W2c)"`

---

## Task 4: Post detail `/app/community/[id]/post/[postId]`

**Files:** create `apps/web/src/app/(app)/app/community/[id]/post/[postId]/page.tsx`.

- [ ] **Step 1:** Client page. `const { id, postId } = useParams<{id:string;postId:string}>();` `const post = usePost(postId); const comments = useComments(postId); const add = useAddComment();`. Loading→`Skeleton`; `!post.data`→notAvailable. Render a `PostCard`-like block for `post.data` (or reuse `PostCard` with `communityId={id}`), then `<CommentList comments={comments.data ?? []} />`, then an add-comment composer (`Textarea` + send → `add.mutate({ postId, communityId: id, body }, { onSuccess: clear })`).
- [ ] **Step 2:** `pnpm --filter web typecheck` → PASS. Commit: `... -m "feat(web): post detail + comments (W2c)"`

---

## Task 5: Reviews list + write

**Files:** create `apps/web/src/app/(app)/app/community/[id]/reviews/page.tsx`, `apps/web/src/app/(app)/app/community/[id]/reviews/write/page.tsx`.

- [ ] **Step 1: list** — `const { id } = useParams(); const reviews = useCommunityReviews(id); const canReview = useCanReviewCommunity(id);` Render average (`StarRating` + count), a **Write review** `Button asChild` → `/app/community/${id}/reviews/write` when `canReview.data`, then `reviews.data?.reviews.map(r => <ReviewCard review={r} />)` (empty → `t('noReviews')`).
- [ ] **Step 2: write** — gate on `useCanReviewCommunity(id)` (if false → notice + back). `const [rating,setRating]=useState(0); const [body,setBody]=useState(''); const upsert = useUpsertReview(id);` `<StarRating value={rating} onChange={setRating} size={28} />` + `Textarea` + submit (disabled when `rating===0`) → `upsert.mutate({ rating, body: body || undefined }, { onSuccess: () => router.push(\`/app/community/${id}/reviews\`) })`.
- [ ] **Step 3:** `pnpm --filter web typecheck` + `build` → PASS. Commit: `... -m "feat(web): community reviews list + write (W2c)"`

---

## Task 6: End-to-end verification (browser)

No code. `pnpm --filter web dev`; headless Chrome.

- [ ] **Step 1:** typecheck + build → PASS.
- [ ] **Step 2:** Open a community you're a member of → **Posts** tab → compose a text post → it appears; compose one with an image → the signed-url image renders.
- [ ] **Step 3:** Like a post → count updates (optimistic); open the post → add a comment → it appears; comment count reflects on the feed.
- [ ] **Step 4:** **About** shows the average rating + count → Reviews list renders; if eligible, write a review → it appears in the list and the average updates.

---

## Verification (summary)
Per-task typecheck; build after Tasks 3 + 5; browser smoke (Task 6). Finish via superpowers:finishing-a-development-branch.

## Out of scope
Manage (W2d); result-post creation; edit/delete others' content; moderation.
