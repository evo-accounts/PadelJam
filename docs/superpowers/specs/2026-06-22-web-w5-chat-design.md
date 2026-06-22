# Web W5 — Chat (Stream React SDK) — Design

**Slice:** W5. Brings player chat to web via **`stream-chat-react`** (the web SDK; mobile uses `stream-chat-expo`),
reusing the existing `@padel/api` chat hooks. Applies the Phase-1.3 lesson: never gate the app on chat.

## Goal

A signed-in player can, on web, see their conversations, read/send messages (direct, group, and event channels),
start a DM with someone they follow, and open a group's/event's chat — using the same Stream backend + `@padel/api`
chat hooks the mobile app uses.

## Dependencies + client
- Add `stream-chat` + `stream-chat-react` to `apps/web` (pin compatible versions; `stream-chat-react` peers on
  `stream-chat`, `react`, `react-dom`).
- `apps/web/src/lib/streamClient.ts` — `export const streamClient = StreamChat.getInstance(process.env.NEXT_PUBLIC_STREAM_API_KEY ?? '')`
  (mirrors `apps/mobile/lib/streamClient.ts`; the public API key `dv7cn4zhwgvj` is safe to ship — set
  `NEXT_PUBLIC_STREAM_API_KEY` in the gitignored `apps/web/.env.local`).
- `apps/web/src/components/chat/WebChatProvider.tsx` — `'use client'`. Connects the user with the **same
  serialized connect/disconnect logic as mobile's `StreamChatProvider`**:
  - `uid = useSession().session?.user.id`; `tokenQ = useStreamToken()`; `profile = useMyProfile()`.
  - `useEffect` keyed on `[uid, tokenQ.data, profile.data?.full_name, profile.data?.avatar_url]`: if no uid/token →
    disconnect if connected; else if `streamClient.userID !== data.userId`, `disconnectUser()` then
    `connectUser({ id: data.userId, name: full_name ?? 'Player', image: avatar_url ?? undefined }, data.token)`
    inside a try/catch (connect failure is non-fatal). A `cancelled` guard for the async cleanup.
  - Renders `children` plain when `!uid`. Once authed, mounts `<Chat client={streamClient}>{children}</Chat>`
    **even if the token errored** (so the surface stays usable; the connect effect no-ops until a token arrives).
  - Imports the SDK stylesheet: `import 'stream-chat-react/dist/css/v2/index.css';` (confirm the exact path for the
    installed version; v12 ships `dist/css/v2/index.css`).

## Scope / mount
Mount the provider + SDK CSS in a **chat route-group layout** `apps/web/src/app/(app)/app/chat/layout.tsx`
(`'use client'`, wraps `{children}` in `<WebChatProvider>`). This loads the Stream client + stylesheet only on
`/app/chat/**`, keeping the rest of the app light and never blocked by chat. (The W6 nav unread badge uses
`useUnreadCount` — a DB query — and does not depend on this provider.)

## Routes
### `/app/chat` — channel list + active conversation (two-pane)
Desktop two-pane. Left: `ChannelList` with `filters={{ type: 'messaging', members: { $in: [uid] } }}`,
`sort={{ last_message_at: -1 }}`, `options={{ state: true, watch: true, presence: true }}`. Selecting a channel
(via the list's default `onSelect`/`setActiveChannel` from `useChatContext`) sets the active channel; the right
pane renders the active `Channel` → `<Window><MessageList /><MessageInput /></Window>` + `<Thread />`. A
**New message** button → `/app/chat/new`. No active channel → `selectConversation` placeholder. No channels at all
→ `noChannels` empty state.

### `/app/chat/[cid]` — deep-linkable conversation
The same two-pane shell, but on mount sets the active channel to the one matching the `cid` route param (query the
client for the channel by id, `watch()`, `setActiveChannel`). Used by the group/event "Open chat" deep-links so a
thread opens directly while the list stays visible. If the channel can't be loaded (not a member) →
`selectConversation`.

### `/app/chat/new` — start a DM
List `useFollowing(uid)` (avatar + name). On pick: `const ch = streamClient.channel('messaging', { members: [uid, otherId] }); await ch.watch();`
then `router.push('/app/chat/' + ch.cid)`. (Stream dedupes a distinct 2-member messaging channel, so re-DMing the
same person reuses the channel.) Empty following → a friendly note.

## Entry points
- A **Messages** item in the app sidebar `APP_NAV` (`apps/web/src/app/(app)/app/layout.tsx`): `{ key: 'chat',
  href: '/app/chat', labelKey: 'nav.messages', icon: MessageCircle }` (the icon is already imported). Add
  `nav.messages` to the `app` i18n namespace.
- **Open chat** buttons on the **group** detail (`/app/group/[id]`) and **event** detail (`/app/event/[id]`)
  pages → `useEnsureChannel().mutateAsync({ kind: 'group' | 'event', id })` → `{ cid }` →
  `router.push('/app/chat/' + cid)`. Place on the group header area and the event detail near the CTA. Show a busy
  state while ensuring.

## i18n
A small `chat` namespace (web chrome only — the messaging UI is the SDK's) registered in `lib/i18n-web.ts`
(en/pt-PT/pt-BR) via a new `registerWebChatCopy(instance)` called in `Providers.tsx`: `title:'Messages',
newMessage:'New message', startConversation:'Start a conversation', noChannels:'No conversations yet',
selectConversation:'Select a conversation', chatUnavailable:'Chat is unavailable right now.', retry:'Retry',
openChat:'Open chat', following:'Following', noFollowing:'You are not following anyone yet.'`. Also add
`nav.messages` ('Messages') to the existing `app` namespace.

## Reuse
`@padel/api`: `useStreamToken`, `useEnsureChannel`, `useFollowing`, `useMyProfile`. `@padel/auth` `useSession`.
`stream-chat` (`StreamChat`), `stream-chat-react` (`Chat`, `ChannelList`, `Channel`, `Window`, `MessageList`,
`MessageInput`, `Thread`, `useChatContext`). `avatarUrl` (`@/lib/upload`). shadcn `Button`/`Card`/`Avatar`/
`Skeleton` for the chrome around the SDK panes.

## Error / edge handling
- Missing `NEXT_PUBLIC_STREAM_API_KEY` or token error → the `/app/chat` surface shows `chatUnavailable` + a **Retry**
  (`tokenQ.refetch()`); the rest of the app is unaffected (provider is route-scoped). Detect via `tokenQ.isError` /
  the client not being connected.
- Not yet connected → a loading `Skeleton` inside `/app/chat`.
- A `cid` the user can't access → "select a conversation".
- Sign-out elsewhere → the connect effect disconnects the client.

## Verification
`pnpm --filter web typecheck` + `pnpm --filter web build`. Browser: `/app/chat` renders the two-pane shell; with a
configured Stream app + `stream-token` edge function, channels load and a message sends/receives; group/event
**Open chat** → ensure-channel → lands on the thread; **New message** → pick a followed user → opens a DM; nav
**Messages** link active state works. **Note:** a full message round-trip needs a live Stream app + the deployed
`stream-token` edge function (+ the public key in `.env.local`); against local Supabase that may be unconfigured,
so automated verification focuses on the shell rendering + graceful-degrade (no app-wide block when chat can't
connect). The live round-trip is confirmed in the Phase 1.5 device/web verification pass.

## Out of scope
A `@padel/chat` abstraction (the placeholder package stays unused; web uses `stream-chat-react` directly, mobile
`stream-chat-expo`; `@padel/api` is the shared layer); the nav **unread badge** (W6); push notifications; custom
Stream theming beyond the default stylesheet; moderation/admin tooling; message search.
