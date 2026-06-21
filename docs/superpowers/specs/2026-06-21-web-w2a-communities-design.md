# Web W2a — Communities (list + detail + join) — Design

**Slice:** Web W2a (first of four W2 sub-slices). W2 = communities; decomposed into **W2a** (browse + join, this
slice), **W2b** (create + share/QR), **W2c** (posts feed + reviews), **W2d** (manage).

## Goal

Let a player browse communities (their own + suggested) and view a community (header + About + Members) and
**join/leave** — on the existing backend via `@padel/api`.

## Routes (under `apps/web/src/app/(app)/app/community/`, auth-gated; replaces the W0 stub)

- **`/app/community`** — list:
  - **My communities** — `useCommunities()` (`{ role, communities(*) }[]`); a `CommunityCard` per item with a role badge.
  - **Suggested** — `useSuggestedCommunities()` (rows) for discovery.
  - A **Create community** `Button` → `/app/community/create` (the page itself is built in W2b; the link is fine to add now — it will 404 until W2b, so gate it behind `useCanCreateCommunity()` and/or note it).
  - Cards link to `/app/community/[id]`.
- **`/app/community/[id]`** — detail:
  - **Header** (`CommunityHeader`): cover image (`cover_image_path`) + thumbnail (`thumbnail_path`), name, pills
    (type · member count · privacy), description, and the join/leave CTA.
  - **Tabs** (shadcn `Tabs`): **About** + **Members** built now; **Posts** / **Events** / **Groups** tabs render
    a "coming soon" placeholder (Posts→W2c, Groups→W3, Events→W4).
  - **About**: type, privacy, location, admins (from members where role in owner/admin), created date,
    cancellation-rules text/link when `cancellation_rules_enabled`.
  - **Members**: `useCommunityMembers(id)` (`{ user_id, role, profiles(id, full_name, avatar_url) }[]`) — avatar +
    name + role; member count = list length.

## Join / leave

CTA in the header, driven by the community `privacy` and the viewer's membership:
- Determine membership/role: is `[id]` in `useCommunities()` (and the role), else not a member.
- **public** → "Join" → `useJoinCommunity(id).mutate(ack)`.
- **request_to_join** → "Request to join" → same RPC (creates a pending request server-side); reflect a
  "Requested" state best-effort after acting.
- **private** → "Invite only" (disabled; joining is invite-driven, handled in W2d).
- If `cancellation_rules_enabled`: show a rules-acknowledgement checkbox (CTA disabled until checked) and pass
  `ack = true`; otherwise `ack = false`.
- Members (non-action state) see **Leave** → `useLeaveCommunity().mutate(id)`. The backend enforces the
  sole-owner guard; surface its error inline.

## Components

- `components/community/CommunityCard.tsx` — thumbnail + name + type/privacy + role badge; links to detail.
- `components/community/CommunityHeader.tsx` — cover/thumbnail/name/pills/description + CTA slot.
- `components/community/MembersList.tsx` — member rows.
- `lib/community-images.ts` — `communityImageUrl(path, bucket: 'community-thumbnails' | 'community-covers')`
  → `supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl` (display only; upload is W2b).

## Reuse

`@padel/api`: `useCommunities`, `useSuggestedCommunities`, `useCommunity`, `useCommunityMembers`,
`useJoinCommunity`, `useLeaveCommunity`, `useCanCreateCommunity`. shadcn (W0 set): `tabs`, `card`, `avatar`,
`button`, `badge`, `skeleton`, `separator`, `checkbox`?? (checkbox not in W0 set — for the rules-ack use a
`label`+native checkbox or pull `checkbox`; prefer reusing `Switch`/`label` already present, or a simple
controlled `<input type=checkbox>`). New `community` i18n namespace (en/pt-PT/pt-BR).

## Error / edge handling

- Loading → `Skeleton`; archived community → show an "archived" badge (read-only).
- Join/leave optimistic-ish with inline error (esp. the sole-owner leave guard).
- Private community a non-member can't view → RLS returns null → render a "not available" state.

## Deferred (out of this slice)

Create (W2b); posts/reviews (W2c); manage incl. invite/requests/permissions/settings/archive/transfer (W2d);
Events/Groups community tabs (W3/W4); QR/share (W2b); Managing/Participating + Active/Archived switcher +
default-community indicator (light refinement, later).

## Verification

`pnpm --filter web typecheck` + `build`; browser (local Supabase, headless Chrome): `/app/community` shows my +
suggested communities → open one → header + About + Members render (RLS) → join a public community → CTA flips to
member/Leave; a request-to-join community shows the requested state; Posts/Events/Groups tabs show "coming soon".

## Out of scope

Everything in W2b/W2c/W2d; group/event creation; non-community discovery.
