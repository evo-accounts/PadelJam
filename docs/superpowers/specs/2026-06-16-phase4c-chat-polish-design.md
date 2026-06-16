# Phase 4C — Chat Polish — Design

*Padel Jam • 2026-06-16 • Brainstormed design / spec*

## Goal

Complete the chat surface (HN-14 + §5.3/5.4): Active/Archived tabs with archive/unarchive,
per-user delete for direct chats, a chat-details media gallery, and an unread badge on the Home
chat icon. All client-side, building on Phases 4A/4B — no backend, no migration, no edge function.

## Scope decisions (made with the user)
1. **One combined 4C spec** (not split).
2. **Tap-to-reveal action menu**, not swipe — Stream's `ChannelList` has no built-in swipe, and a
   gesture-handler Swipeable can't be verified here. A kebab (•••) on each row opens an action sheet
   with the same actions + confirmations the spec mandates (deviates from §5.3's "swipe-left" gesture).
3. **Restructure** `chat/[cid].tsx` → `chat/[cid]/index.tsx` (conversation) + add `chat/[cid]/details.tsx`.
4. **Verification:** scaffold posture (as 4A/4B) — `pnpm -w typecheck` only; Stream behavior
   (archive/delete/media/unread) is verified on a dev build.

## Verified Stream capabilities (stream-chat 9.47, stream-chat-expo 9.3.1)
- `channel.archive()` / `channel.unarchive()` — **persistent** per-member archive (a new message does
  NOT auto-unarchive, matching §5.3). `ChannelList` filters by `archived` for the two tabs.
- `channel.hide(userId?, clearHistory?)` → `channel.hide(null, true)` = per-user hide + clear history
  (the direct-chat "delete": removes from the user's list + erases their message history).
- `channel.countUnread()` per channel; `client.user?.total_unread_count` for the global badge.
- `ChannelList` accepts a custom **`Preview`** prop; reuse `ChannelPreviewMessenger` (avatar / name /
  last message / **unread count** come free) and wrap it with the kebab.
- `channel.type` is `group` / `event` / `messaging` (direct), so the row knows which actions to show.

## Architecture / components

### Chat list — `apps/mobile/app/chat/index.tsx` (rewrite)
- A segmented tab bar: **Active** (default) / **Archived**.
- One `ChannelList` whose `filters` switch with the tab:
  `{ members: { $in: [uid] }, archived: tab === 'archived' }`, `sort: { last_message_at: -1 }`,
  `onSelect → /chat/<cid>`, `Preview={ChannelRow}`.
  *(Plan-time reconciliation: confirm the `archived` filter key in stream-chat 9.47; if unsupported,
  fall back to a single list + client-side split on each channel's member `archived` state.)*

### Custom row — `apps/mobile/components/chat/ChannelRow.tsx`
Renders `<ChannelPreviewMessenger {...props} />` inside a row with a trailing kebab button. The kebab
opens an action-sheet `Modal` whose options depend on the channel + tab (passed via context/prop):
- Active, `channel.type` ∈ {group, event} → **Archive**.
- Active, `messaging` (direct) → **Archive**, **Delete**.
- Archived → **Unarchive**.
Actions:
- **Archive** → confirmation modal — title `archiveTitle` ("Archive this chat?"), body `archiveBody`
  ("You can find it later in the Archived tab."), **Cancel** / **Archive** → `channel.archive()`.
- **Delete** (direct only) → destructive confirmation — title `deleteTitle` ("Delete this chat?"),
  body `deleteBody` ("All messages will be permanently removed and this action cannot be undone."),
  **Cancel** / **Delete** (red) → `channel.hide(null, true)`.
- **Unarchive** → `channel.unarchive()` directly (no confirmation, per §5.3).
After an action, the channel leaves the current tab's filtered list (Stream refreshes the list on the
archive/hide event). The "current tab" is provided to `ChannelRow` (e.g. a small React context the
list sets) so it shows Unarchive vs Archive/Delete correctly.

### Unread badge — `apps/mobile/components/chat/useStreamUnread.ts` + Home icon
`useStreamUnread()` reads `streamClient.user?.total_unread_count` and subscribes to client events
(`message.new`, `notification.message_new`, `notification.mark_read`, `message.read`) to re-read it,
returning the count. The Home-header chat icon (in `(tabs)/_layout.tsx`, added in 4A) renders a red
dot/count when `> 0` (mirrors `NotificationBell`'s dot).

### Chat details — `apps/mobile/app/chat/[cid]/index.tsx` (moved) + `apps/mobile/app/chat/[cid]/details.tsx`
- **Move** the 4A conversation file to `chat/[cid]/index.tsx` unchanged (route `/chat/<cid>` is
  preserved). Make its header title pressable (`headerTitle` render → `Pressable`) → `router.push('/chat/' + cid + '/details')`.
- **`chat/[cid]/details.tsx`** — resolves the channel by cid (same `cid.split(':')` + `watch()` as the
  conversation), title = `details`. A **Media** section: load images via
  `channel.query({ messages: { limit: 100 } })`, collect `message.attachments` of type `image`
  (newest first), render a 3-column grid (`FlatList` `numColumns={3}` of `expo-image` thumbnails).
  Empty → `noPhotos` ("No photos shared yet."). Tap a thumbnail → a full-screen pager `Modal`:
  a horizontal `FlatList` of `expo-image` (paging enabled), starting at the tapped index, back to close.
  *(MVP caps at the recent ~100 messages' images; deeper pagination is a documented follow-up.)*

### i18n — extend the `chat` namespace
`tabActive`, `tabArchived`, `archive`, `delete`, `unarchive`, `cancel`, `archiveTitle`, `archiveBody`,
`deleteTitle`, `deleteBody`, `details`, `media`, `noPhotos`.

## Error handling
- Archive/unarchive/delete failures → the action sheet closes and a non-blocking inline/Alert error
  (`chatUnavailable` from 4B, or a new `actionFailed`); the list self-corrects on the next event.
- Media query failure → the grid shows the empty/`noPhotos` state (no hard error screen).
- Channel-not-resolvable in details → a spinner then back (same tolerance as the conversation screen).

## Explicitly deferred / follow-ups
- **Swipe gestures** (tap menu used instead).
- **Deep media pagination** (caps at recent ~100 messages).
- **Push notifications** for new messages.
- **Native dev-build verification** of archive/delete/media/unread behavior.
- **PT/PT-BR** translations for the new `chat` keys.

## Conventions followed
Reuses 4A/4B Stream client/provider/screens; screens under `apps/mobile/app/chat/`; copy via
`useT('chat')`; the unread badge mirrors `NotificationBell`; `expo-image` for thumbnails; FlatList
for grids; no backend (pure Stream SDK), so the only gate is typecheck (dev-build verification
deferred, consistent with 4A/4B).
