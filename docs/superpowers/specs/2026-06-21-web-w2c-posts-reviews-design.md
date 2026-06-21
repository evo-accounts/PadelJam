# Web W2c — Community Posts Feed + Reviews — Design

**Slice:** Web W2c (third of four W2 sub-slices). Adds the community **posts feed** (+ post detail/comments/likes)
and **reviews** (rating block + list + write). W2d (manage) remains.

## Goal

Community social content on web: browse/compose posts (text + optional photo), like + comment, and read/write
reviews — all via `@padel/api` (RLS-enforced).

## Posts (in the community detail **Posts** tab — replaces the W2a "coming soon")

- **Feed**: `useCommunityPosts(id)` → newest-first list of `PostCard`s. Each post: author (avatar+name), body,
  optional image, **like** toggle + count, comment count linking to the post detail.
  - Post shape: `{ id, community_id, author_id, body, image_path, created_at, author: profiles(...), likes: [{count}], comments: [{count}], mine: [{user_id}] }`. **likedByMe** = `mine.length > 0`; **likeCount** = `likes[0]?.count ?? 0`; **commentCount** = `comments[0]?.count ?? 0`.
  - **Like**: `useToggleLike(id).mutate({ postId, liked: likedByMe })` (the hook is already optimistic).
  - **Realtime**: call `useCommunityFeedRealtime(id)` on the detail page so the feed live-updates.
- **Composer** (top of feed): a `Textarea` + optional image picker. Submit → if image, `uploadPostImage(file, id)`
  then `useCreatePost(id).mutate({ body, imagePath })`. **Gating**: show the composer only to members; respect
  `useCommunityPermissions(id)` `members_create_posts` (owner/admin can always post).
- **Post detail** `/app/community/[id]/post/[postId]`: `usePost(postId)` (same shape) + `useComments(postId)`
  (`{ id, post_id, author_id, body, created_at, author: profiles(...) }[]`, asc) rendered by `CommentList` +
  an add-comment composer → `useAddComment().mutate({ postId, communityId, body })` + the like control.

### Post images (private bucket)
`community-post-images` is **private** (member-gated), so display needs a **signed URL**, not `getPublicUrl`:
- `lib/community-images.ts` gains `postImageUrl(path): Promise<string | null>` →
  `supabase.storage.from('community-post-images').createSignedUrl(path, 3600)`.
- A `<PostImage path=...>` client component resolves the signed URL in a `useEffect` and renders an `<img>` (or
  a skeleton/null while resolving).
- `lib/upload.ts` gains `uploadPostImage(file, communityId): Promise<string>` → uploads to
  `community-post-images` at `${communityId}/${uuid}.${ext}` (member-write RLS) and returns the path.

## Reviews

- **About tab** (community detail) gains a **rating block**: `useCommunityReviews(id)` → `{ reviews, average,
  count }`; show average (stars) + count, linking to `/app/community/[id]/reviews`.
- **`/app/community/[id]/reviews`**: list `ReviewCard`s (StarRating + body + author + date); a **Write review**
  button → `/app/community/[id]/reviews/write` shown only when `useCanReviewCommunity(id)` is true.
- **`/app/community/[id]/reviews/write`**: `StarRating` (1–5, required) + optional body `Textarea` →
  `useUpsertReview(id).mutate({ rating, body })`; on success → back to the reviews list. (Upsert: editing an
  existing review re-saves.) Gate the page on `useCanReviewCommunity`.

## Components

`PostCard`, `PostImage` (signed-URL resolver), `PostComposer`, `CommentList`, `ReviewCard`, `StarRating`
(reused for display + input). Under `apps/web/src/components/community/`.

## Reuse

`@padel/api`: `useCommunityPosts`, `usePost`, `useComments`, `useCreatePost`, `useToggleLike`, `useAddComment`,
`useCommunityFeedRealtime`, `useCommunityReviews`, `useCanReviewCommunity`, `useUpsertReview`,
`useCommunityPermissions`. shadcn (present): `Textarea`, `Button`, `Card`, `Avatar`, `Skeleton`, `Separator`.
Extend the `community` i18n namespace (en/pt-PT/pt-BR).

## Error / edge handling

- Empty feed → friendly empty state; loading → `Skeleton`.
- Non-member / no `members_create_posts` → no composer (read-only feed if visible at all).
- Post image: while the signed URL resolves, show a placeholder; on error, hide the image (don't crash).
- Review write: rating required; not-eligible users never reach the write page (gated) — guard server-side too.

## Verification

`pnpm --filter web typecheck` + `build`; browser (local Supabase, headless Chrome): open a community → **Posts**
tab shows the feed → compose a text post (+ an image) → it appears (signed-URL image renders) → like toggles +
count updates → open the post → add a comment → it appears → **About** shows the average rating → (if eligible)
write a review → it lists.

## Out of scope

Manage (W2d); event "result posts" creation (server-generated — just rendered); editing/deleting others' posts
or comments; report/moderation of posts.
