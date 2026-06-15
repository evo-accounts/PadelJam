# Phase 4A — Chat Foundation + Direct Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up Stream Chat and ship direct (1:1) messaging — a token edge function, the `stream-chat-expo` client/provider, a chat list, New Chat (from follows), and a conversation thread (text + photo).

**Architecture:** A Supabase edge function mints a Stream user token (HS256 JWT signed with the Stream API secret); the app connects a singleton `StreamChat` client via a `StreamChatProvider` and renders Stream's prebuilt UI (`ChannelList`/`Channel`/`MessageList`/`MessageInput`). Direct channels are created client-side (no backend sync). The Stream user's name/image are set on `connectUser` (client-side), so the edge function only mints the token.

**Tech Stack:** Supabase Edge Functions (Deno, `djwt`), `@padel/api` (TanStack Query), `stream-chat` + `stream-chat-expo`, Expo Router + React Native, `@padel/i18n`.

**Spec:** `docs/superpowers/specs/2026-06-15-phase4a-chat-foundation-design.md`

**CRITICAL — verification posture (agreed):** Stream is a native module needing a dev build to run. Gates here are `pnpm -w typecheck` + the edge function booting under `functions serve`. Actual connect/send/photo/realtime is **deferred to a dev build** (`expo prebuild` + `expo run:ios`). Stream API key/secret are supplied by the user via env vars and **never committed**.

**CONTROLLER NOTE:** Task 3 (the `stream-chat-expo` install) requires network + reconciling the SDK against Expo SDK 56 — the controller runs it inline (like `expo-location`/`expo-dynamic-app-icon`), then the UI tasks build against the confirmed API. If the install conflicts irreconcilably with SDK 56, STOP and surface to the user (do not force-downgrade blindly).

---

## File Structure

- **Create** `infra/supabase/functions/stream-token/index.ts` — mint a Stream token for the caller.
- **Create** `infra/supabase/functions/stream-token/.env.example` — documents `STREAM_API_KEY`/`STREAM_API_SECRET`.
- **Create** `packages/api/src/chat/queries.ts` — `useStreamToken`.
- **Modify** `packages/api/src/query-keys.ts` — `streamToken`.
- **Modify** `packages/api/src/index.ts` — export `chat/queries`.
- **Modify** `apps/mobile/.env.example` (or the documented env file) — add `EXPO_PUBLIC_STREAM_API_KEY`.
- **Create** `apps/mobile/lib/streamClient.ts` — the singleton `StreamChat` client.
- **Create** `apps/mobile/components/chat/StreamChatProvider.tsx` — connect/disconnect + Stream UI providers.
- **Modify** `apps/mobile/app/_layout.tsx` — mount `StreamChatProvider`.
- **Create** `apps/mobile/app/chat/index.tsx` — chat list.
- **Create** `apps/mobile/app/chat/new.tsx` — New Chat.
- **Create** `apps/mobile/app/chat/[cid].tsx` — conversation.
- **Modify** `apps/mobile/app/(tabs)/_layout.tsx` — add the chat icon to the home header.
- **Modify** `apps/mobile/lib/i18n-mobile.ts` — add the `chat` namespace.

---

## Task 1: stream-token edge function

**Files:**
- Create: `infra/supabase/functions/stream-token/index.ts`
- Create: `infra/supabase/functions/stream-token/.env.example`

- [ ] **Step 1: Write the edge function**

Create `infra/supabase/functions/stream-token/index.ts`:

```ts
// Mints a Stream Chat user token for the authenticated Supabase user. A Stream token is an
// HS256 JWT with a `user_id` claim, signed with the Stream API SECRET (server-side only).
// The client sets the user's name/image on connectUser, so we only mint the token here.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { create } from 'https://deno.land/x/djwt@v3.0.2/mod.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Exported for the (deferred) unit test; pure given (userId, secret).
export async function mintStreamToken(userId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return await create({ alg: 'HS256', typ: 'JWT' }, { user_id: userId }, key);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const secret = Deno.env.get('STREAM_API_SECRET');
  if (!secret) return json({ error: 'stream_not_configured' }, 500);

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();
  if (error || !user) return new Response('Unauthorized', { status: 401 });

  const token = await mintStreamToken(user.id, secret);
  return json({ token, userId: user.id });
});
```

- [ ] **Step 2: Write the env example**

Create `infra/supabase/functions/stream-token/.env.example`:

```
# Stream Chat credentials (get them from the Stream dashboard). Set the real values in the
# function's .env locally (gitignored) and as Supabase secrets in prod:
#   supabase secrets set STREAM_API_KEY=... STREAM_API_SECRET=...
STREAM_API_KEY=
STREAM_API_SECRET=
```

- [ ] **Step 3: Verify the function boots**

The full mint requires `STREAM_API_SECRET` + a real caller JWT (deferred). The automated gate is that the edge runtime loads the function without a parse/import error. Start it in the background, check the log, kill it:

```bash
cd /Users/joaopaulos4/Cursor/PadelJam
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token
( pnpm dlx supabase@latest --workdir infra functions serve stream-token --no-verify-jwt >/tmp/streamfn.log 2>&1 & )
sleep 20
grep -iE "serving|stream-token|error|exception" /tmp/streamfn.log | head
pkill -f "functions serve" || true
```
Expected: the log shows the function served (e.g. a "Serving functions on …" line) with NO import/parse error referencing `djwt` or `stream-token`. If `djwt@v3.0.2` fails to resolve, bump to the latest `djwt` v3 tag shown in the error and re-run.

- [ ] **Step 4: Commit**

```bash
git add infra/supabase/functions/stream-token/index.ts infra/supabase/functions/stream-token/.env.example
git commit -m "feat(chat): stream-token edge function (mint Stream user token)"
```

---

## Task 2: useStreamToken hook

**Files:**
- Create: `packages/api/src/chat/queries.ts`
- Modify: `packages/api/src/query-keys.ts`
- Modify: `packages/api/src/index.ts`

- [ ] **Step 1: Add the query key**

In `packages/api/src/query-keys.ts`, add inside `qk`:

```ts
  streamToken: ['stream-token'] as const,
```

- [ ] **Step 2: Create the hook**

Create `packages/api/src/chat/queries.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import { useDb } from '../client';
import { qk } from '../query-keys';

export type StreamTokenResult = { token: string; userId: string };

// Fetches a Stream Chat token for the current user. The supabase client's functions.invoke
// attaches the caller's auth automatically. Token is reusable for the session.
export const useStreamToken = () => {
  const db = useDb();
  const uid = useSession().session?.user.id;
  return useQuery({
    queryKey: qk.streamToken,
    enabled: !!uid,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await db.functions.invoke('stream-token');
      if (error) throw error;
      return data as StreamTokenResult;
    },
  });
};
```

- [ ] **Step 3: Re-export**

In `packages/api/src/index.ts`, add (near the other query exports):

```ts
export * from './chat/queries';
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @padel/api typecheck`
Expected: PASS. (If `db.functions` is untyped/errors, confirm the supabase client type `TypedClient` exposes `functions` — it does on `@supabase/supabase-js`; if needed, the `data` cast already covers the return.)

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/chat/queries.ts packages/api/src/query-keys.ts packages/api/src/index.ts
git commit -m "feat(api): useStreamToken hook"
```

---

## Task 3: install stream-chat-expo + client singleton  *(CONTROLLER-RUN)*

**Files:**
- Modify: `apps/mobile/package.json` (+ lockfile) via `expo install`
- Modify: `apps/mobile/app.json` (config plugin, if the SDK requires one)
- Create: `apps/mobile/lib/streamClient.ts`
- Modify: `apps/mobile/.env.example`

- [ ] **Step 1: Install the SDK + native peers** *(controller)*

```bash
cd /Users/joaopaulos4/Cursor/PadelJam/apps/mobile
npx expo install stream-chat stream-chat-expo
```
Then install the native peers `stream-chat-expo` requires for Expo SDK 56 (run `npx expo install` for each peer the install/peer-warnings name — typically `react-native-reanimated`, `react-native-gesture-handler`, `react-native-svg`, `@gorhom/bottom-sheet`, `react-native-safe-area-context` (already present), `@react-native-camera-roll/camera-roll` if image picking is enabled). Install exactly what the warnings request; do not guess versions — `expo install` pins compatible ones.

- [ ] **Step 2: Reconcile the SDK API + config plugin** *(controller)*

Read `apps/mobile/node_modules/stream-chat-expo` exports (its `package.json` `main`/`module` + the `.d.ts`) to confirm the exported component names used below (`OverlayProvider`, `Chat`, `ChannelList`, `Channel`, `MessageList`, `MessageInput`) and whether a config plugin must be added to `app.json` (e.g. for reanimated/gesture-handler). Add any required plugin to `app.json` `plugins`. Note any prop-name differences for the UI tasks.

- [ ] **Step 3: Create the client singleton**

Create `apps/mobile/lib/streamClient.ts`:

```ts
import { StreamChat } from 'stream-chat';

// Singleton Stream client. The public API key is safe to ship; the secret stays server-side.
const apiKey = process.env.EXPO_PUBLIC_STREAM_API_KEY ?? '';
export const streamClient = StreamChat.getInstance(apiKey);
```

- [ ] **Step 4: Document the env var**

In `apps/mobile/.env.example` (create it if absent, mirroring the existing `EXPO_PUBLIC_SUPABASE_*` vars), add:

```
EXPO_PUBLIC_STREAM_API_KEY=
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter mobile typecheck`
Expected: PASS (the `stream-chat` import resolves; no UI yet).

- [ ] **Step 6: Commit**

```bash
cd /Users/joaopaulos4/Cursor/PadelJam
git add apps/mobile/package.json apps/mobile/app.json apps/mobile/lib/streamClient.ts apps/mobile/.env.example pnpm-lock.yaml
git commit -m "feat(chat): install stream-chat-expo + client singleton"
```

---

## Task 4: StreamChatProvider + mount + i18n

**Files:**
- Create: `apps/mobile/components/chat/StreamChatProvider.tsx`
- Modify: `apps/mobile/app/_layout.tsx`
- Modify: `apps/mobile/lib/i18n-mobile.ts`

- [ ] **Step 1: Add the `chat` i18n namespace**

In `apps/mobile/lib/i18n-mobile.ts`, add a `mobileChat` const near the other namespaces:

```ts
const mobileChat = {
  en: {
    title: 'Chat',
    newChat: 'New Chat',
    searchPeople: 'Search people you follow',
    messagePlaceholder: 'Message',
    noChats: 'No conversations yet.',
    noFollows: "You're not following anyone yet.",
    connecting: 'Connecting…',
    connectError: "Couldn't connect to chat.",
    retry: 'Retry',
    startChat: 'Start chat',
  },
} as const;
```
Register it in `registerMobileCopy` after the other bundles:
```ts
  instance.addResourceBundle('en', 'chat', mobileChat.en, true, false);
```

- [ ] **Step 2: Create the provider**

Create `apps/mobile/components/chat/StreamChatProvider.tsx`. Connects the singleton on an authed session and renders Stream's UI providers. When unauthed, it passes children through unchanged.

```tsx
import { useMyProfile, useStreamToken } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { type PropsWithChildren, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Chat, OverlayProvider } from 'stream-chat-expo';

import { streamClient } from '@/lib/streamClient';

export function StreamChatProvider({ children }: PropsWithChildren) {
  const { t } = useT('chat');
  const uid = useSession().session?.user.id;
  const tokenQ = useStreamToken();
  const profile = useMyProfile();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const data = tokenQ.data;
    if (!uid || !data) return;
    let cancelled = false;
    streamClient
      .connectUser(
        { id: data.userId, name: profile.data?.full_name ?? 'Player', image: profile.data?.avatar_url ?? undefined },
        data.token,
      )
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setReady(false);
      });
    return () => {
      cancelled = true;
      void streamClient.disconnectUser();
      setReady(false);
    };
    // profile name/image are best-effort; reconnect only on identity/token change.
  }, [uid, tokenQ.data, profile.data?.full_name, profile.data?.avatar_url]);

  // Not authed (e.g. on the auth screens): don't gate the app on chat.
  if (!uid) return <>{children}</>;

  if (tokenQ.isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.msg}>{t('connectError')}</Text>
        <Pressable onPress={() => tokenQ.refetch()} accessibilityRole="button">
          <Text style={styles.retry}>{t('retry')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <OverlayProvider>
      <Chat client={streamClient}>{children}</Chat>
    </OverlayProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#F7F9FC' },
  msg: { color: '#6B7685', fontSize: 15 },
  retry: { color: '#0B7BFF', fontWeight: '700', fontSize: 15 },
});
```

> **Note:** rendering the connect-error gate replaces the whole authed tree only when the *token fetch* errors (rare). The screens themselves tolerate `ready === false` because Stream's components handle their own loading; `ready` is tracked for potential future use (e.g. a splash) and is intentionally not used to block rendering here. If the installed `stream-chat-expo` requires a theme or `i18nInstance` prop on `<Chat>`, add it per the Task 3 reconciliation.

- [ ] **Step 3: Mount the provider**

In `apps/mobile/app/_layout.tsx`, wrap the navigation root with `StreamChatProvider` INSIDE `QueryClientProvider` (so `useStreamToken`/`useMyProfile` work) and inside `SessionProvider` (so the session is available). Read the file; the structure is `I18nextProvider > SessionProvider > QueryClientProvider > <nav root>`. Wrap the `<nav root>` (the ThemeProvider/Stack at ~line 91):

```tsx
import { StreamChatProvider } from '@/components/chat/StreamChatProvider';
// ...
        <QueryClientProvider client={queryClient}>
          <StreamChatProvider>
            {/* existing ThemeProvider / Stack nav root */}
          </StreamChatProvider>
        </QueryClientProvider>
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter mobile typecheck`
Expected: PASS. (If `Chat`/`OverlayProvider` import paths differ, fix per Task 3 reconciliation.)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/chat/StreamChatProvider.tsx 'apps/mobile/app/_layout.tsx' apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(chat): StreamChatProvider + connect + chat i18n"
```

---

## Task 5: chat list + home header chat icon

**Files:**
- Create: `apps/mobile/app/chat/index.tsx`
- Modify: `apps/mobile/app/(tabs)/_layout.tsx`

- [ ] **Step 1: Create the chat list**

Create `apps/mobile/app/chat/index.tsx`:

```tsx
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { Stack, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChannelList } from 'stream-chat-expo';
import type { Channel } from 'stream-chat';

export default function ChatListScreen() {
  const { t } = useT('chat');
  const router = useRouter();
  const uid = useSession().session?.user.id;

  if (!uid) return null;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t('title'),
          headerRight: () => (
            <Pressable onPress={() => router.push('/chat/new' as never)} accessibilityRole="button" hitSlop={12}>
              <Text style={styles.new}>{t('newChat')}</Text>
            </Pressable>
          ),
        }}
      />
      <ChannelList
        filters={{ members: { $in: [uid] } }}
        sort={{ last_message_at: -1 }}
        onSelect={(channel: Channel) => router.push(('/chat/' + channel.cid) as never)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  new: { color: '#0B7BFF', fontWeight: '700', fontSize: 15, paddingHorizontal: 8 },
});
```

> Adjust `ChannelList` prop names (`filters`/`sort`/`onSelect`) only if the Task 3 reconciliation found a different signature — these are the stable Stream v5 names.

- [ ] **Step 2: Add the chat icon to the Home header**

In `apps/mobile/app/(tabs)/_layout.tsx`, change the home (`name="index"`) `Tabs.Screen` `headerRight` to render the chat icon + the existing bell as a row:

```tsx
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
// ...inside TabLayout: const router = useRouter();
        <Tabs.Screen
          name="index"
          options={{
            title: t('tab', { ns: 'home' }),
            headerRight: () => (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingRight: 12 }}>
                <Pressable onPress={() => router.push('/chat' as never)} accessibilityRole="button" hitSlop={10}>
                  <SymbolView name={{ ios: 'bubble.left.and.bubble.right.fill', android: 'chat', web: 'chat' }} size={22} tintColor="#0B1F3A" />
                </Pressable>
                <NotificationBell />
              </View>
            ),
            tabBarIcon: ({ color }) => (
              <SymbolView name={{ ios: 'house.fill', android: 'home', web: 'home' }} tintColor={color} size={28} />
            ),
          }}
        />
```

- [ ] **Step 3: Typecheck (regen routes if needed)**

Run: `pnpm --filter mobile typecheck`
If it errors on unknown routes `/chat` or `/chat/new`, briefly start Metro to regenerate typed routes:
```bash
cd apps/mobile && (npx expo start >/tmp/metro.log 2>&1 &) ; sleep 25 ; pkill -f "expo start" ; cd ../..
```
then re-run. (Pushes use `as never`, so likely unnecessary.) Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/chat/index.tsx 'apps/mobile/app/(tabs)/_layout.tsx'
git commit -m "feat(chat): chat list screen + home header chat icon"
```

---

## Task 6: New Chat + conversation

**Files:**
- Create: `apps/mobile/app/chat/new.tsx`
- Create: `apps/mobile/app/chat/[cid].tsx`

- [ ] **Step 1: Create New Chat**

Create `apps/mobile/app/chat/new.tsx`. Default list = people the user follows; a search box filters within follows; tapping creates/opens a distinct 1:1 channel.

```tsx
import { useFollowing } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { streamClient } from '@/lib/streamClient';

type Person = { id: string; full_name: string | null; avatar_url: string | null };

export default function NewChatScreen() {
  const { t } = useT('chat');
  const router = useRouter();
  const uid = useSession().session?.user.id;
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const following = useFollowing(uid, search);
  const rows = (following.data?.pages.flat() ?? []) as Person[];

  const openChat = async (other: Person) => {
    if (busy || !uid) return;
    setBusy(true);
    try {
      const channel = streamClient.channel('messaging', { members: [uid, other.id] });
      await channel.watch();
      router.replace(('/chat/' + channel.cid) as never);
    } catch {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('newChat') }} />
      <TextInput
        style={styles.search}
        placeholder={t('searchPeople')}
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
      />
      {following.isLoading ? (
        <ActivityIndicator color="#0B1F3A" style={{ marginTop: 32 }} />
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>{t('noFollows')}</Text>
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => openChat(item)} disabled={busy} accessibilityRole="button">
              <Image
                source={item.avatar_url ? { uri: item.avatar_url } : undefined}
                style={styles.avatar}
                contentFit="cover"
              />
              <Text style={styles.name}>{item.full_name ?? '—'}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  search: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, margin: 12, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', marginHorizontal: 12, marginBottom: 6, borderRadius: 12, padding: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E2E8F0' },
  name: { fontSize: 15, fontWeight: '600', color: '#0B1F3A' },
  empty: { textAlign: 'center', marginTop: 48, color: '#6B7685', fontSize: 15 },
});
```

> `useFollowing` returns an infinite query; rows come from `data.pages.flat()`. If the follow-row field names differ from `id`/`full_name`/`avatar_url`, adjust the `Person` type to match `list_following`'s columns (verify in `packages/api/src/profile/queries.ts` / the RPC).

- [ ] **Step 2: Create the conversation**

Create `apps/mobile/app/chat/[cid].tsx`:

```tsx
import { useT } from '@padel/i18n';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { Channel as ChannelType } from 'stream-chat';
// NOTE (reconciled against stream-chat-expo 9.3.1): the input component is MessageComposer,
// not MessageInput (MessageInput is not exported in 9.x).
import { Channel, MessageComposer, MessageList } from 'stream-chat-expo';

import { streamClient } from '@/lib/streamClient';

export default function ConversationScreen() {
  const { t } = useT('chat');
  const { cid } = useLocalSearchParams<{ cid: string }>();
  const [channel, setChannel] = useState<ChannelType | null>(null);

  useEffect(() => {
    if (!cid) return;
    let cancelled = false;
    // cid is "<type>:<id>" — resolve and watch it.
    const [type, id] = cid.split(':');
    const ch = streamClient.channel(type, id);
    ch.watch()
      .then(() => {
        if (!cancelled) setChannel(ch);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cid]);

  if (!channel) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator color="#0B1F3A" />
      </View>
    );
  }

  const title =
    (channel.data?.name as string | undefined) ??
    Object.values(channel.state.members)
      .map((m) => m.user?.name)
      .filter((n) => n && n !== streamClient.user?.name)
      .join(', ') ||
    t('title');

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title }} />
      <Channel channel={channel}>
        <MessageList />
        <MessageComposer />
      </Channel>
    </View>
  );
}
```

> `Channel`/`MessageList`/`MessageComposer` are the Stream prebuilt components (reconciled against 9.3.1 in Task 3 — the input is `MessageComposer`, not `MessageInput`); `MessageComposer` supports text + image attachments out of the box. The header title derives the other member's name for direct chats; group/event channels (4B) will carry `channel.data.name`.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter mobile typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/chat/new.tsx 'apps/mobile/app/chat/[cid].tsx'
git commit -m "feat(chat): New Chat + direct conversation screens"
```

- [ ] **Step 5: Dev-build smoke (deferred — document, do not run here)**

On a dev build with `EXPO_PUBLIC_STREAM_API_KEY` set + `STREAM_API_SECRET` as a Supabase secret:
`expo prebuild && expo run:ios`; sign in; Home header chat icon → chat list; New Chat → pick a follow → send text + a photo; confirm realtime delivery on a second device/account.

---

## Verification gate (whole phase)

```bash
pnpm --filter @padel/api typecheck
pnpm -w typecheck
# edge fn boots (Task 1 Step 3). Stream connect/send is dev-build-only (deferred).
```

---

## Self-Review

**Spec coverage:**
- Token edge fn + Stream user identity → Task 1 (mint) + Task 4 (client sets name/image on connect). ✓
- `useStreamToken` → Task 2. ✓
- `stream-chat-expo` install + config plugin + client singleton → Task 3. ✓
- `StreamChatProvider` (connect/disconnect, providers, error/retry) + mount → Task 4. ✓
- Chat list (HN-14 list shell) + Home header chat icon (HN-03) → Task 5. ✓
- New Chat from follows + search-within-follows (HN-12) → Task 6 Step 1. ✓
- Direct conversation, text + photo (HN-13) → Task 6 Step 2 (Stream `MessageInput`). ✓
- `chat` i18n → Task 4 Step 1. ✓
- Deferred (4B group/event channels, 4C archive/delete/media/unread, global search, push) — out of scope, documented in the spec.

**Placeholder scan:** none. The "adjust per Task 3 reconciliation" notes are real instructions tied to the post-install API check (the one genuine unknown), not vague placeholders — the code given is the stable Stream v5 API and should compile as-is for a current `stream-chat-expo`.

**Type consistency:** `StreamTokenResult { token, userId }` (Task 2) matches the edge fn's JSON (Task 1) and the provider's `connectUser(data.userId, data.token)` (Task 4). `streamClient` (Task 3) imported by the provider + both screens. `qk.streamToken` defined Task 2, used Task 2. `chat` i18n keys (Task 4) cover every `t(...)` in Tasks 4–6. Channel cid handling in Task 6 (`type:id` split) matches the `onSelect(channel.cid)` push in Task 5.

**Known unknown (flagged, controller-owned):** the exact `stream-chat-expo` export/prop surface for Expo SDK 56 — reconciled in Task 3 before the UI tasks; the screen code uses the stable documented API and is adjusted if the installed version differs.
