# Chat Media Pagination + Per-Row Live Refresh (A6) — Design

*Padel Jam • 2026-06-19 • Brainstormed design / spec*

## Goal

Two deferred 4C chat gaps: (1) the channel media gallery should load images **beyond the latest 100 messages**
via infinite scroll over older messages; (2) chat-list rows should refresh their **last-message text + unread
count live** instead of rendering a stale snapshot. The data-shaping logic is extracted into pure, unit-tested
helpers; the Stream-wired parts are review-verified (the Stream backend is env-gated).

## Scope decisions (from the brainstorm)

1. **Both gaps** in this slice (media pagination + per-row live refresh).
2. **Infinite scroll** for the gallery (newest images first; `onEndReached` loads older).
3. **Extract pure logic into `@padel/utils` + vitest**; Stream-dependent wiring verified by review + a
   Stream-configured dev build later.

### Explicitly deferred (unchanged)

Swipe gestures (tap menu shipped instead); push-on-new-message (B-group); native dev-build verification.

## Verified context

- **Chat stack:** `stream-chat` + `stream-chat-expo`. Client singleton
  [apps/mobile/lib/streamClient.ts](../../../apps/mobile/lib/streamClient.ts); provider
  [components/chat/StreamChatProvider.tsx](../../../apps/mobile/components/chat/StreamChatProvider.tsx).
- **Media gallery** ([apps/mobile/app/chat/[cid]/details.tsx](../../../apps/mobile/app/chat/[cid]/details.tsx)):
  on mount calls `channel.query({ messages: { limit: 100 } })`, collects `attachments` where
  `a.type === 'image'` (`a.image_url ?? a.asset_url`) iterating the page in reverse, renders a 3-col `FlatList`
  + a full-screen pager `Modal`. The hard-coded `limit: 100` is the entire cap — no follow-up query.
- **Chat list** ([apps/mobile/app/chat/index.tsx](../../../apps/mobile/app/chat/index.tsx)): Stream's prebuilt
  `ChannelList` with `additionalFlatListProps.renderItem` → a **custom** `ChannelRow`
  ([components/chat/ChannelRow.tsx](../../../apps/mobile/components/chat/ChannelRow.tsx)). `ChannelRow` reads
  `channel.state.messages` (last message) and `channel.countUnread()` **once at render** — no event
  subscription, so row *content* (last message, unread) goes stale even though `ChannelList` re-sorts on
  `last_message_at`. (Contrast: [useStreamUnread.ts](../../../apps/mobile/components/chat/useStreamUnread.ts)
  already subscribes to client events for the global badge — the pattern to mirror per-channel.)
- **`@padel/utils`** holds vitest-tested pure logic (e.g. `eventDeadlines`, `rosterCsv`, `recurrence`) — the home
  for the new helpers. `apps/mobile` imports from `@padel/utils`.
- **Stream message ordering:** `channel.query({ messages })` returns messages **ascending (oldest→newest)**;
  pagination uses `id_lt: <oldestMessageId>` to fetch the next older page.
- **i18n:** `chat` namespace is English-only today (`details`, `media`, `noPhotos`, …). Adding keys English-only
  remains consistent.

## Architecture

### 1. Pure helpers in `@padel/utils` (+ vitest)

A minimal message shape so tests need no Stream runtime:
```ts
export type MsgLike = {
  id: string;
  text?: string | null;
  type?: string | null; // e.g. 'deleted'
  attachments?: { type?: string | null; image_url?: string | null; asset_url?: string | null }[] | null;
};
```

**`chat-media.ts`:**
- `extractImageUrls(messages: MsgLike[]): string[]` — image URLs from one page, **newest-first**. Since Stream
  returns ascending, iterate the page in reverse; for each message include `attachments` with
  `type === 'image'` and a non-empty `image_url ?? asset_url`.
- `appendImages(existing: string[], page: string[]): string[]` — `existing` then `page`, **deduped** (preserve
  first occurrence / order), so overlapping pages or repeated URLs don't double up.
- `nextCursor(messages: MsgLike[]): string | undefined` — the **oldest** message id in the page (i.e. the first
  element, since ascending), or `undefined` when the page is empty. Used as the next `id_lt`.
- `pageHasMore(messages: MsgLike[], limit: number): boolean` — `messages.length === limit`.

**`chat-preview.ts`:**
- `lastMessagePreview(messages: MsgLike[]): string` — display string for the most recent message (the last
  element): its trimmed `text` if present; else `'📷 Photo'` if it has an image attachment; else `''`
  (covers empty / deleted / unknown). Returns `''` for an empty list.

Export all from the package index. Tests in `@padel/utils` cover: ordering (newest-first), `asset_url`
fallback, non-image attachments skipped, dedupe + order in `appendImages`, `nextCursor` on empty/non-empty,
`pageHasMore` at/under the limit, and `lastMessagePreview` for text / image-only / empty / deleted.

### 2. Media gallery — infinite scroll (`app/chat/[cid]/details.tsx`)

- State: `images: string[]`, `cursor: string | undefined`, `hasMore: boolean`, `loading: boolean`.
- `loadPage()` (guard `loading`): 
  ```ts
  const res = await channel.query({ messages: { limit: 100, ...(cursor ? { id_lt: cursor } : {}) } });
  setImages((cur) => appendImages(cur, extractImageUrls(res.messages)));
  setCursor(nextCursor(res.messages));
  setHasMore(pageHasMore(res.messages, 100));
  ```
- Initial load on mount; the grid `FlatList` gets `onEndReached={() => { if (hasMore && !loading) loadPage(); }}`
  (+ `onEndReachedThreshold`) and a footer `ActivityIndicator` while `loading`. Gallery shows newest images
  first; scrolling to the end loads progressively older ones. Empty state (`noPhotos`) shows only when the
  first page(s) yield no images and `!hasMore`.

### 3. Per-row live refresh — `useChannelPreview` + `ChannelRow`

- New hook `useChannelPreview(channel)` (in `components/chat/`):
  ```ts
  // returns { lastMessage: string; unread: number }, recomputed live
  // - derive: lastMessagePreview(channel.state.messages as MsgLike[]) + channel.countUnread()
  // - subscribe: channel.on('message.new' | 'message.read' | 'message.updated' | 'message.deleted', bump)
  //   where `bump` is a setState tick forcing re-derivation; unsubscribe on cleanup.
  ```
- `ChannelRow` uses `useChannelPreview(channel)` for the last-message text + unread badge instead of reading
  `channel.state`/`countUnread()` inline. Everything else (avatar, title, kebab menu) unchanged.

### 4. i18n

If a new visible string is needed (e.g. the image-only label), add it to the `chat` English block. The
`'📷 Photo'` label lives in `@padel/utils` as a default; if it must be localizable, the screen/hook can map it
— but to keep the util pure and avoid coupling, the label stays a constant for this slice (English-only, noted).
PT/PT-BR for any new `chat` key follows the A5 backfill.

> **Ordering note (A5):** A5's i18n parity test lives on a separate branch (`feat/a5-i18n-pt-backfill`). A6 adds
> any new `chat` keys English-only on `main`. When A5 merges, whoever merges second resolves the `chat` block:
> add pt-PT/pt-BR for any A6-added keys so the parity test stays green. Flagged so it isn't a surprise.

## Error handling

- `loadPage` wraps the Stream query in try/catch (set `loading=false`, optionally surface a retry); a failed
  page must not wedge `loading=true` (which would block further `onEndReached`).
- `appendImages` dedupe prevents a repeated final page (Stream returning the same boundary message) from
  duplicating images.
- `useChannelPreview` cleanup must unsubscribe to avoid leaks / setState-after-unmount.

## Testing / verification

- **Unit:** `pnpm --filter @padel/utils test` — the new `chat-media` + `chat-preview` specs pass.
- **Types:** `pnpm -w typecheck` (13/13).
- **Stream-gated (review now; runtime on a Stream-configured dev build):** open a channel with >100 messages
  and several images spread deep in history → the gallery loads the recent images, and scrolling to the end
  keeps appending older ones until exhausted; send/receive a message in a listed channel → the row's last
  message + unread badge update without leaving/re-entering the list.

## Conventions followed

No migration/API; pure helpers in `@padel/utils` with vitest (mirroring `recurrence`/`rosterCsv`); thin screen
+ hook wiring around Stream; English-only new copy (PT/PT-BR via A5). The `useStreamUnread` event-subscription
pattern is mirrored per-channel. Deferred items (swipe, push) stay deferred.
