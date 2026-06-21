# Chat Gate Degrade — Design

**Slice:** Phase 1.3 (launch blocker / robustness) from the requirements-audit roadmap.

## Problem

`apps/mobile/components/chat/StreamChatProvider.tsx` wraps the entire authenticated app. When the Stream token
fetch errors (`tokenQ.isError`), it returns a **full-screen** "Couldn't connect to chat / Retry" view
(lines 48-57), locking the user out of everything — events, groups, profile, settings — not just chat. A
transient Stream/network failure (or, locally, a missing Stream key) makes the whole app unusable.

## Constraint

The chat screens (`<ChannelList>` in `app/chat/index.tsx`, `<Channel>`/`<MessageList>` in
`app/chat/[cid]/index.tsx`) require Stream's `OverlayProvider`/`Chat` React context. So the fix cannot render
bare `children` on error — it must keep the provider tree mounted while not blocking the rest of the app.

## Approach (chosen)

Move the error+retry from the app-wide gate into the chat tab.

1. **`StreamChatProvider.tsx`** — remove the `if (tokenQ.isError)` full-screen early-return. Once authed
   (`uid` present), **always** render:
   ```tsx
   <OverlayProvider>
     <Chat client={streamClient}>{children}</Chat>
   </OverlayProvider>
   ```
   The existing connect `useEffect` already early-returns when there's no `uid` or no `tokenQ.data`, so on a
   token error it simply doesn't connect — the app stays fully usable and Stream context is always present.
   react-query retries transient token failures on its own; on success the effect fires and chat connects.
   Keep the existing `if (!uid) return <>{children}</>;` branch unchanged.

2. **`app/chat/index.tsx` (chat list)** — call `useStreamToken()` (react-query dedupes, so this is the same
   shared query instance as the provider's) and, when `tokenQ.isError`, render a small **non-blocking banner**
   above the `ChannelList`: the `connectError` copy + a **Retry** button that calls `tokenQ.refetch()`. This
   confines the chat error + retry to the chat tab and preserves the affordance the old full-screen gate had.

## Reuse

- Existing `chat` i18n keys `connectError` and `retry` (already used by the removed gate) — no new keys, so no
  i18n parity-test impact.
- `useStreamToken` from `@padel/api`; `streamClient` from `@/lib/streamClient`.

## Error handling

- Persistent token failure: every non-chat tab works normally; the chat tab shows the banner plus Stream's own
  empty/loading state.
- Retry: `tokenQ.refetch()` → on success the provider's connect effect runs and the channel list populates.

## Verification

Local simulator:
1. Force a token failure (e.g. temporarily unset the local `STREAM_API_SECRET` and restart, so `stream-token`
   returns 500) → app boots to Home, **all tabs navigable**, only the chat tab shows the "Couldn't connect"
   banner (no full-screen lock).
2. Restore the Stream config, tap **Retry** in the chat tab → chat connects and the channel list loads.
3. `pnpm -w typecheck` (13/13).

## Scope

- Two files: `apps/mobile/components/chat/StreamChatProvider.tsx`, `apps/mobile/app/chat/index.tsx`.
- No migration, no new dependencies, no new i18n keys.

## Out of scope

- Per-screen chat error states beyond the list banner (the conversation screen already renders Stream's own
  states); reconnection backoff tuning; offline message queueing.
