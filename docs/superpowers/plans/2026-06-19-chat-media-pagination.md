# Chat Media Pagination + Per-Row Live Refresh (A6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Media gallery loads images beyond the latest 100 messages via infinite scroll; chat-list rows refresh last-message/unread live. Data-shaping logic is pure + unit-tested.

**Architecture:** Pure helpers in `@padel/utils` (image extraction/pagination cursor; last-message preview) with vitest. The gallery screen paginates Stream messages (`id_lt` cursor) using them; a `useChannelPreview` hook subscribes to channel events and feeds `ChannelRow`.

**Tech Stack:** TypeScript pure logic + vitest (`@padel/utils`), React Native, `stream-chat` / `stream-chat-expo`.

**Spec:** [docs/superpowers/specs/2026-06-19-chat-media-pagination-design.md](specs/2026-06-19-chat-media-pagination-design.md)

**Note:** the chat screens need the Stream backend (env-gated `EXPO_PUBLIC_STREAM_API_KEY` + `stream-token`), so Tasks 2–3 are verified by review now + a Stream-configured dev build later. Task 1 is fully locally tested.

---

## Task 1: Pure helpers + tests in `@padel/utils`

**Files:**
- Create: `packages/utils/src/chat-media.ts`
- Create: `packages/utils/src/chat-media.test.ts`
- Create: `packages/utils/src/chat-preview.ts`
- Create: `packages/utils/src/chat-preview.test.ts`
- Modify: `packages/utils/src/index.ts`

- [ ] **Step 1: Write `chat-media.ts`**

```ts
export type MsgLike = {
  id: string;
  text?: string | null;
  type?: string | null;
  attachments?: { type?: string | null; image_url?: string | null; asset_url?: string | null }[] | null;
};

/** Image URLs from one ascending (oldest→newest) Stream page, returned NEWEST-FIRST. */
export function extractImageUrls(messages: MsgLike[]): string[] {
  const urls: string[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    for (const a of messages[i]?.attachments ?? []) {
      if (a?.type === 'image') {
        const u = a.image_url ?? a.asset_url;
        if (u) urls.push(u);
      }
    }
  }
  return urls;
}

/** Concatenate a new page after existing, de-duplicating URLs (preserve first-seen order). */
export function appendImages(existing: string[], page: string[]): string[] {
  const seen = new Set(existing);
  const out = existing.slice();
  for (const u of page) {
    if (!seen.has(u)) { seen.add(u); out.push(u); }
  }
  return out;
}

/** Oldest message id in an ascending page (first element) — the next `id_lt` cursor. */
export function nextCursor(messages: MsgLike[]): string | undefined {
  return messages.length ? messages[0]?.id : undefined;
}

/** A full page (length === limit) implies more history may exist. */
export function pageHasMore(messages: MsgLike[], limit: number): boolean {
  return messages.length === limit;
}
```

- [ ] **Step 2: Write `chat-media.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { extractImageUrls, appendImages, nextCursor, pageHasMore, type MsgLike } from './chat-media';

const img = (id: string, ...urls: string[]): MsgLike => ({
  id, attachments: urls.map((u) => ({ type: 'image', image_url: u })),
});

describe('extractImageUrls', () => {
  it('returns image urls newest-first from an ascending page', () => {
    // ascending: m1 (oldest) → m3 (newest)
    expect(extractImageUrls([img('m1', 'a'), img('m2', 'b'), img('m3', 'c')])).toEqual(['c', 'b', 'a']);
  });
  it('falls back to asset_url when image_url is absent', () => {
    expect(extractImageUrls([{ id: 'm', attachments: [{ type: 'image', asset_url: 'z' }] }])).toEqual(['z']);
  });
  it('skips non-image attachments and messages without attachments', () => {
    expect(extractImageUrls([
      { id: 'm1', attachments: [{ type: 'file', asset_url: 'f' }] },
      { id: 'm2', text: 'hi' },
      img('m3', 'ok'),
    ])).toEqual(['ok']);
  });
  it('handles an empty page', () => {
    expect(extractImageUrls([])).toEqual([]);
  });
});

describe('appendImages', () => {
  it('appends a new page after existing', () => {
    expect(appendImages(['a', 'b'], ['c', 'd'])).toEqual(['a', 'b', 'c', 'd']);
  });
  it('de-duplicates overlap and within-page repeats, preserving order', () => {
    expect(appendImages(['a', 'b'], ['b', 'c', 'c', 'a'])).toEqual(['a', 'b', 'c']);
  });
});

describe('nextCursor', () => {
  it('returns the oldest (first) message id', () => {
    expect(nextCursor([{ id: 'old' }, { id: 'new' }])).toBe('old');
  });
  it('returns undefined for an empty page', () => {
    expect(nextCursor([])).toBeUndefined();
  });
});

describe('pageHasMore', () => {
  it('is true when the page is full', () => {
    expect(pageHasMore([{ id: '1' }, { id: '2' }], 2)).toBe(true);
  });
  it('is false when the page is short', () => {
    expect(pageHasMore([{ id: '1' }], 2)).toBe(false);
  });
});
```

- [ ] **Step 3: Write `chat-preview.ts`**

```ts
import type { MsgLike } from './chat-media';

/** Display string for a channel's most recent message: text, an image label, or empty. */
export function lastMessagePreview(messages: MsgLike[]): string {
  const last = messages.length ? messages[messages.length - 1] : undefined;
  if (!last || last.type === 'deleted') return '';
  const text = last.text?.trim();
  if (text) return text;
  const hasImage = (last.attachments ?? []).some((a) => a?.type === 'image');
  return hasImage ? '📷 Photo' : '';
}
```

- [ ] **Step 4: Write `chat-preview.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { lastMessagePreview } from './chat-preview';

describe('lastMessagePreview', () => {
  it('returns the trimmed text of the most recent message', () => {
    expect(lastMessagePreview([{ id: '1', text: 'older' }, { id: '2', text: '  hi  ' }])).toBe('hi');
  });
  it('labels an image-only message', () => {
    expect(lastMessagePreview([{ id: '1', attachments: [{ type: 'image', image_url: 'u' }] }])).toBe('📷 Photo');
  });
  it('returns empty for a deleted message', () => {
    expect(lastMessagePreview([{ id: '1', type: 'deleted', text: 'gone' }])).toBe('');
  });
  it('returns empty for no messages', () => {
    expect(lastMessagePreview([])).toBe('');
  });
});
```

- [ ] **Step 5: Export from the index**

In `packages/utils/src/index.ts`, append:
```ts
export * from './chat-media';
export * from './chat-preview';
```

- [ ] **Step 6: Verify + commit**

Run: `pnpm --filter @padel/utils test && pnpm -w typecheck`
Expected: new specs pass (alongside existing); typecheck 13/13.
```bash
git add packages/utils/src/chat-media.ts packages/utils/src/chat-media.test.ts packages/utils/src/chat-preview.ts packages/utils/src/chat-preview.test.ts packages/utils/src/index.ts
git commit -m "feat(utils): chat media pagination + last-message preview helpers (A6)"
```

---

## Task 2: Media gallery infinite scroll (`app/chat/[cid]/details.tsx`)

**Files:**
- Modify: `apps/mobile/app/chat/[cid]/details.tsx`

Replace the single-query `useEffect` + `images: string[] | null` state with cursor-paginated state using the Task 1 helpers. Keep the full-screen viewer `Modal` and styles unchanged.

- [ ] **Step 1: Rewrite the component body**

Update imports at the top:
```tsx
import { useT } from '@padel/i18n';
import { appendImages, extractImageUrls, nextCursor, pageHasMore, type MsgLike } from '@padel/utils';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { streamClient } from '@/lib/streamClient';

const COLS = 3;
const GAP = 2;
const PAGE = 100;
```

Replace the component's state + effect (everything from `const [images, setImages] = ...` through the closing of the `useEffect`) with:
```tsx
  const [images, setImages] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [initialised, setInitialised] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);

  const channel = useMemo(() => {
    if (!cid) return null;
    const [type, id] = cid.split(':');
    if (!type || !id) return null;
    return streamClient.channel(type, id);
  }, [cid]);

  const loadMore = useCallback(async () => {
    if (!channel) return;
    setLoading(true);
    try {
      const res = await channel.query({ messages: { limit: PAGE, ...(cursor ? { id_lt: cursor } : {}) } });
      const msgs = res.messages as unknown as MsgLike[];
      setImages((cur) => appendImages(cur, extractImageUrls(msgs)));
      setCursor(nextCursor(msgs));
      setHasMore(pageHasMore(msgs, PAGE));
    } catch {
      setHasMore(false);
    } finally {
      setLoading(false);
      setInitialised(true);
    }
  }, [channel, cursor]);

  // Initial page once the channel resolves.
  useEffect(() => {
    if (channel) void loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  const onEndReached = () => {
    if (hasMore && !loading) void loadMore();
  };
```

- [ ] **Step 2: Update the render to use the new state + infinite scroll**

Replace the conditional block (`{images === null ? (<ActivityIndicator…/>) : images.length === 0 ? (<Text…noPhotos/>) : (<FlatList…/>)}`) with:
```tsx
      {!initialised ? (
        <ActivityIndicator color="#0B1F3A" style={{ marginTop: 32 }} />
      ) : images.length === 0 && !hasMore ? (
        <Text style={styles.empty}>{t('noPhotos')}</Text>
      ) : (
        <FlatList
          data={images}
          numColumns={COLS}
          keyExtractor={(u, i) => u + i}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={{ gap: GAP }}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loading && images.length > 0 ? <ActivityIndicator color="#0B1F3A" style={{ marginVertical: 16 }} /> : null}
          renderItem={({ item, index }) => (
            <Pressable onPress={() => setViewer(index)} accessibilityRole="imagebutton">
              <Image source={{ uri: item }} style={{ width: size, height: size }} contentFit="cover" />
            </Pressable>
          )}
        />
      )}
```
The full-screen viewer `Modal` below stays as-is, except its guard `images && viewer !== null` becomes `viewer !== null` (since `images` is now always an array, never null):
```tsx
          {viewer !== null ? (
            <FlatList
              data={images}
              ...
```
Leave `const size = (Dimensions.get('window').width - GAP * (COLS - 1)) / COLS;` and the styles unchanged.

- [ ] **Step 3: Typecheck**

Run: `pnpm -w typecheck`
Expected: 13/13. Fix any type error (e.g. the `res.messages` cast).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/chat/[cid]/details.tsx
git commit -m "feat(chat): infinite-scroll media gallery beyond 100 messages (A6)"
```

---

## Task 3: Per-row live refresh — `useChannelPreview` + `ChannelRow`

**Files:**
- Create: `apps/mobile/components/chat/useChannelPreview.ts`
- Modify: `apps/mobile/components/chat/ChannelRow.tsx`

- [ ] **Step 1: Write the hook**

Create `apps/mobile/components/chat/useChannelPreview.ts`:
```ts
import { lastMessagePreview, type MsgLike } from '@padel/utils';
import { useEffect, useState } from 'react';
import type { Channel as ChannelType } from 'stream-chat';

/**
 * Live last-message + unread for a channel row. Subscribes to the channel's message events
 * and re-renders on each, so row content stays fresh (ChannelList only re-sorts the list).
 */
export function useChannelPreview(channel: ChannelType): { lastMessage: string; unread: number } {
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    const events = ['message.new', 'message.read', 'message.updated', 'message.deleted'] as const;
    const subs = events.map((e) => channel.on(e, bump));
    return () => subs.forEach((s) => s.unsubscribe());
  }, [channel]);
  return {
    lastMessage: lastMessagePreview(channel.state.messages as unknown as MsgLike[]),
    unread: channel.countUnread(),
  };
}
```

- [ ] **Step 2: Use it in `ChannelRow`**

In `apps/mobile/components/chat/ChannelRow.tsx`:
- Add the import: `import { useChannelPreview } from './useChannelPreview';`
- Replace these three lines in the component body:
  ```tsx
  const messages = channel.state.messages;
  const last = messages.length ? messages[messages.length - 1] : undefined;
  const unread = channel.countUnread();
  ```
  with:
  ```tsx
  const { lastMessage, unread } = useChannelPreview(channel);
  ```
- Update the preview render line:
  ```tsx
  {last?.text ? <Text style={styles.preview} numberOfLines={1}>{last.text}</Text> : null}
  ```
  to:
  ```tsx
  {lastMessage ? <Text style={styles.preview} numberOfLines={1}>{lastMessage}</Text> : null}
  ```
  (`unread` is still referenced by the badge below — unchanged. `isDirect`, `image`, `channelTitle` unchanged.)

- [ ] **Step 3: Typecheck**

Run: `pnpm -w typecheck`
Expected: 13/13.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/components/chat/useChannelPreview.ts apps/mobile/components/chat/ChannelRow.tsx
git commit -m "feat(chat): live per-row last-message + unread refresh (A6)"
```

---

## Verification (end-to-end)

1. **Unit:** `pnpm --filter @padel/utils test` — `chat-media` + `chat-preview` specs pass (with the existing suite).
2. **Types:** `pnpm -w typecheck` (13/13).
3. **Stream-gated (review now; runtime on a Stream-configured dev build):** in a channel with >100 messages and images deep in history, the gallery loads recent images and keeps appending older ones on scroll-to-end until exhausted (footer spinner while loading; `noPhotos` only when truly none); a listed channel's row updates its last message + unread badge live when a message arrives/read, without leaving the list.

## Out of scope (this slice)

Swipe gestures; push-on-new-message (B-group); PT/PT-BR for any new `chat` string (the `'📷 Photo'` label is a `@padel/utils` constant, English; A5 backfill covers `chat` copy — see the spec's A5 ordering note); native dev-build verification.
