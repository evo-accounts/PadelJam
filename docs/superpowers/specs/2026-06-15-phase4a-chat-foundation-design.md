# Phase 4A — Chat Foundation + Direct Messaging — Design

*Padel Jam • 2026-06-15 • Brainstormed design / spec*

## Goal

Stand up **Stream Chat** and ship **direct (1:1) messaging** end-to-end: a token edge
function + Stream user sync, the `stream-chat-expo` client wired into the app, a chat list,
New Chat (from the follow list), and a conversation thread (text + photo). This is the
foundation slice of Phase 4 (HN-10..15); it delivers **HN-12** (direct chat from follows) and
**HN-13** (text + photo) and the chat shell that HN-14/15 build on.

**Decision (roadmap):** chat uses the **Stream Chat managed SDK**, NOT the self-built
`chats`/`chat_members`/`chat_messages` tables sketched in `Requirements/home.md`. Stream owns
message storage, membership, read state, and realtime. No chat SQL tables are created.

## Phase 4 decomposition (this spec covers 4A only)
- **4A (this doc):** token edge fn + Stream user sync + `stream-chat-expo` + provider + chat
  list + New Chat (follows) + direct conversation. Direct chats work without backend sync
  (the client creates 1:1 channels).
- **4B (later):** automatic **group / event** channels + membership sync from
  `group_members` / `event_participants` (HN-10/11).
- **4C (later):** Active/Archived tabs + archive/unarchive, direct delete (hide + clear
  history), chat-details media gallery, unread badges (HN-14 + §5.3/5.4 UX).

## Scope decisions (made with the user)
1. **Build 4A first**; 4B and 4C are separate specs.
2. **Stream keys via env-var names — values supplied by the user, never committed.** App reads
   `EXPO_PUBLIC_STREAM_API_KEY`; the edge function reads `STREAM_API_KEY` + `STREAM_API_SECRET`
   (Supabase secrets / function env). The repo references the names only.
3. **Scaffold + typecheck/edge-fn gates.** Stream is a native module needing a dev build to run;
   here the gates are `pnpm -w typecheck` + the edge function compiling/serving (+ an optional
   local token-mint smoke if the secret is set). Real connect/send is verified later on a dev
   build (`expo prebuild` + `expo run:ios`). Same posture as the app-icon scaffold.
4. **New Chat = follow list + search within follows** (`useFollowing`'s `search` param).
   Messaging arbitrary non-followed users via global name search is deferred to 4C / the
   Discovery-search redesign — keeps 4A self-contained (no new search RPC).

## Architecture

```
stream-token edge fn (server, service-role):
  verify Supabase JWT → read profile(full_name, avatar_url)
  → StreamChat(server, KEY, SECRET).upsertUser({id: uid, name, image})
  → createToken(uid) → { token, userId }

@padel/api: useStreamToken()  // supabase.functions.invoke('stream-token')

apps/mobile:
  StreamChatProvider  // singleton StreamChat client (EXPO_PUBLIC_STREAM_API_KEY);
                      // on session → fetch token → connectUser; disconnect on sign-out;
                      // wraps app in Stream OverlayProvider + Chat
  Home header chat icon → /chat
  /chat        ChannelList  filter {members:{$in:[uid]}} sort {last_message_at:-1}  → /chat/[cid]
  /chat/new    useFollowing(uid) default + search → tap → channel('messaging',{members:[uid,other]}) → /chat/[cid]
  /chat/[cid]  Channel + MessageList + MessageInput (text + image; Stream uploads)
```

## Components

### `infra/supabase/functions/stream-token/index.ts`
- POST only; resolve caller via `userClient.auth.getUser()` (anon client + caller JWT) — 401 if absent. (Mirrors `complete-account`.)
- Service-role client reads `profiles(full_name, avatar_url)` for the caller.
- `import { StreamChat } from 'npm:stream-chat'`; `const server = StreamChat.getInstance(STREAM_API_KEY, STREAM_API_SECRET)`.
  `await server.upsertUser({ id: uid, name: full_name ?? 'Player', image: avatar_url ?? undefined })`.
  `const token = server.createToken(uid)`.
- Return `{ token, userId: uid }` as JSON. Env: `STREAM_API_KEY`, `STREAM_API_SECRET`, plus the standard `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`.
- `infra/supabase/functions/stream-token/.env.example` documents the two Stream vars (the real
  `.env` is gitignored, as with the other functions).

### `packages/api/src/chat/queries.ts`
- `useStreamToken()` — `useQuery` (or a lazy fetch) wrapping `db.functions.invoke('stream-token')`;
  returns `{ token: string; userId: string }`. `enabled: !!uid`, `staleTime` long (tokens are
  reusable); the provider calls it once per session. New query key `qk.streamToken`.

### Mobile
- **Install:** `cd apps/mobile && npx expo install stream-chat-expo stream-chat` + the native peers
  it requires (e.g. `react-native-reanimated`, `react-native-gesture-handler`, `react-native-svg`,
  `@gorhom/bottom-sheet`, etc. — install exactly what `stream-chat-expo` peer-warns for the Expo SDK
  56 set). Add any required config plugin to `app.json`. Reconcile the exact import surface from the
  installed version before writing the screens (the SDK's component names are stable: `OverlayProvider`,
  `Chat`, `ChannelList`, `Channel`, `MessageList`, `MessageInput`, `useChatContext`).
- **`apps/mobile/lib/streamClient.ts`** — `StreamChat.getInstance(EXPO_PUBLIC_STREAM_API_KEY)` singleton.
- **`apps/mobile/components/chat/StreamChatProvider.tsx`** — on an authed session, `useStreamToken()`
  → `client.connectUser({ id: userId, name }, token)`; render children inside `<OverlayProvider><Chat client={client}>`;
  `disconnectUser()` on sign-out / unmount; expose loading + error (retry) states. Mounted high in the
  authed tree (the tabs layout or the root authed layout).
- **`apps/mobile/app/chat/index.tsx`** — `ChannelList` with `filters={{ members: { $in: [uid] } }}`,
  `sort={{ last_message_at: -1 }}`, `onSelect={(ch) => router.push('/chat/' + ch.cid)}`. Empty/connect-error states.
- **`apps/mobile/app/chat/new.tsx`** — default list = `useFollowing(uid)`; a search `TextInput` re-queries
  `useFollowing(uid, search)`. Tap a person → `const ch = client.channel('messaging', { members: [uid, otherId] }); await ch.watch();` → `router.replace('/chat/' + ch.cid)`. Errors inline.
- **`apps/mobile/app/chat/[cid].tsx`** — resolve the channel by cid (`client.channel(...,...)` / from `client.activeChannels` or query), `await channel.watch()`, render `<Channel channel={channel}><MessageList /><MessageInput /></Channel>`. Title = the channel name or the other member's name. (Header-tap → chat details is 4C.)
- **Home header chat icon** — in `apps/mobile/app/(tabs)/_layout.tsx`, the home `Tabs.Screen` `headerRight`
  becomes a small row: the chat icon (`SymbolView` `bubble.left.and.bubble.right` / android `chat`) → `/chat`,
  then the existing `NotificationBell`.
- **i18n** — new `chat` namespace: `title`, `newChat`, `searchPeople`, `messagePlaceholder`, `noChats`,
  `connecting`, `connectError`, `retry`, `startChat`, `noFollows`.

## Error handling
- `useStreamToken` / `connectUser` failure → the provider renders a connect-error state with a retry;
  the rest of the app still works (chat is isolated under the provider).
- New-chat channel creation failure → inline error, stays on the New Chat screen.
- Missing `EXPO_PUBLIC_STREAM_API_KEY` → the client init throws a clear dev error (documented in the env example).

## Explicitly deferred / follow-ups
- **Automatic group/event channels + membership sync** (HN-10/11) → 4B.
- **Archive/Archived tab, direct delete (hide+clear), chat-details media gallery, unread badges/counts**
  (HN-14 + §5.3/5.4) → 4C.
- **Global name search** to message non-followed users → 4C / Discovery-search.
- **Push notifications** for new messages (Stream push) → later.
- **Native dev-build verification** of connect/send/photo/realtime.
- **PT/PT-BR** translations for the `chat` namespace (English-only for now).

## Implementation reconciliation (post-build note)
The edge function was implemented to **mint a raw HS256 JWT (`djwt`)** rather than use the
`stream-chat` server SDK's `upsertUser` + `createToken` — this avoids importing the Node SDK into
Deno and reading `profiles` server-side. **Stream user identity (name/image) is therefore set
client-side on `connectUser`** (in `StreamChatProvider`), not server-side. Consequence: a user's
name/avatar in a channel is only as fresh as that user's last connect. For 4B (group/event
channels) this client-only identity model is fine for the connecting user; if richer server-side
identity sync is needed, add a Stream server `upsertUser` (via the REST API or the Node SDK) then.

## Conventions followed
Edge function under `infra/supabase/functions/` (service-role, JWT-verified, `jsr:@supabase/supabase-js@2`
pattern from `complete-account`); secrets via env, `.env.example` documents names, real `.env` gitignored;
thin `@padel/api` hook wrapping the supabase client; `qk` query key; native dep via `expo install` + config
plugin (like `expo-location`/`expo-dynamic-app-icon`); screens under `apps/mobile/app/chat/`; copy via
`useT('chat')`; per-tab header via `Tabs.Screen` options.

## Open items for the implementation plan
- **Reconcile the installed `stream-chat-expo` API + required native peers + config plugin** against the
  version that resolves for Expo SDK 56 — right after install, before writing the provider/screens. This is
  the main unknown (mirrors the app-icon API-reconciliation step).
- Confirm `db.functions.invoke` typing in `@padel/api` (the supabase client exposes `.functions.invoke`).
- Decide where the channel is resolved in `/chat/[cid]` (watch by cid) vs passing the channel via context
  from the list — pick the simplest that typechecks against the installed SDK.
