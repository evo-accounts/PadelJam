# Chat Gate Degrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop a Stream token failure from locking the whole authenticated app; keep the app usable and surface the chat error + retry only inside the chat tab.

**Architecture:** `StreamChatProvider` always mounts `OverlayProvider`/`Chat` once authed (the connect effect already no-ops without a token), removing the full-screen error gate. The chat list screen calls the same (react-query-deduped) `useStreamToken()` and shows a non-blocking retry banner on error.

**Tech Stack:** React Native / Expo Router, stream-chat-expo, `@padel/api` (react-query).

**Spec:** [docs/superpowers/specs/2026-06-21-chat-gate-degrade-design.md](specs/2026-06-21-chat-gate-degrade-design.md)

---

## Task 1: Degrade the gate + move error/retry into the chat list

**Files:**
- Modify: `apps/mobile/components/chat/StreamChatProvider.tsx` (remove the full-screen `isError` gate + now-unused imports/styles)
- Modify: `apps/mobile/app/chat/index.tsx` (add a non-blocking error banner with Retry)

- [ ] **Step 1: Replace the whole of `apps/mobile/components/chat/StreamChatProvider.tsx` with:**

```tsx
import { useMyProfile, useStreamToken } from '@padel/api';
import { useSession } from '@padel/auth';
import { type PropsWithChildren, useEffect } from 'react';
import { Chat, OverlayProvider } from 'stream-chat-expo';

import { streamClient } from '@/lib/streamClient';

export function StreamChatProvider({ children }: PropsWithChildren) {
  const uid = useSession().session?.user.id;
  const tokenQ = useStreamToken();
  const profile = useMyProfile();

  useEffect(() => {
    const data = tokenQ.data;
    // Signed out (or no token yet): ensure the shared client isn't left connected as a prior user.
    if (!uid || !data) {
      if (streamClient.userID) void streamClient.disconnectUser();
      return;
    }
    let cancelled = false;
    // Serialize connect/disconnect on the singleton: skip if already connected as this user
    // (so a profile name/avatar edit doesn't churn the connection), and switch users cleanly.
    void (async () => {
      try {
        if (streamClient.userID === data.userId) return;
        if (streamClient.userID) await streamClient.disconnectUser();
        if (cancelled) return;
        await streamClient.connectUser(
          { id: data.userId, name: profile.data?.full_name ?? 'Player', image: profile.data?.avatar_url ?? undefined },
          data.token,
        );
      } catch {
        /* connect failed; Stream's UI handles its own offline/retry state */
      }
    })();
    return () => {
      cancelled = true;
    };
    // name/image are read at connect time only; identity/token changes (incl. user switch) drive reconnect.
  }, [uid, tokenQ.data, profile.data?.full_name, profile.data?.avatar_url]);

  // Not authed (e.g. on the auth screens): don't gate the app on chat.
  if (!uid) return <>{children}</>;

  // Always mount the Stream provider tree once authed — even if the token fetch errored — so the rest of
  // the app stays usable and chat context exists. A token error is surfaced (with Retry) inside the chat
  // tab, not as an app-wide block. The connect effect above no-ops until a token is available.
  return (
    <OverlayProvider>
      <Chat client={streamClient}>{children}</Chat>
    </OverlayProvider>
  );
}
```

(This removes the `if (tokenQ.isError) { … }` full-screen block and the now-unused `useT`, `Pressable`, `StyleSheet`, `Text`, `View` imports and the `styles` object.)

- [ ] **Step 2: Add the error banner to `apps/mobile/app/chat/index.tsx`.**

Update the import line `import { useSession } from '@padel/auth';` region to also import the token hook — add:
```tsx
import { useStreamToken } from '@padel/api';
```

After `const uid = useSession().session?.user.id;`, add:
```tsx
  const tokenQ = useStreamToken();
```

Insert the banner between the tabs `</View>` and the `<ChannelList … />` (i.e. immediately before `<ChannelList`):
```tsx
      {tokenQ.isError ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{t('connectError')}</Text>
          <Pressable onPress={() => tokenQ.refetch()} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.bannerRetry}>{t('retry')}</Text>
          </Pressable>
        </View>
      ) : null}
```

Add these entries to the `StyleSheet.create({ … })` object in the same file:
```tsx
  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF4E5', paddingHorizontal: 16, paddingVertical: 10 },
  bannerText: { color: '#8A5A00', fontSize: 13, flex: 1 },
  bannerRetry: { color: '#0B7BFF', fontWeight: '700', fontSize: 13, paddingLeft: 12 },
```

(`Pressable`, `Text`, `View`, `StyleSheet` are already imported in this file; `t` comes from the existing `useT('chat')`. The `connectError` and `retry` keys already exist in the `chat` i18n namespace — they were used by the removed gate — so no new i18n is needed.)

- [ ] **Step 3: Typecheck**

Run: `pnpm -w typecheck`
Expected: PASS (13/13). If it flags unused imports/vars in `StreamChatProvider.tsx`, remove them (the replacement in Step 1 already drops `useT`/`Pressable`/`StyleSheet`/`Text`/`View`/`styles`).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/components/chat/StreamChatProvider.tsx apps/mobile/app/chat/index.tsx
git commit -m "fix(chat): don't gate the whole app on Stream connectivity; show retry in chat tab (Phase 1.3)"
```

---

## Task 2: Verify degraded behavior (iOS simulator)

No code. Confirms the app no longer locks on a chat failure and the chat tab shows a retry. Local Supabase + the running dev client (Metro on :8081).

- [ ] **Step 1: Induce a token failure.** Temporarily make `stream-token` fail: in `infra/supabase/config.toml` comment out the `STREAM_API_SECRET` line under `[edge_runtime.secrets]` (or stop exporting it), then restart the stack:
```bash
cd /Users/joaopaulos4/Cursor/PadelJam
pnpm dlx supabase@latest --workdir infra stop && pnpm dlx supabase@latest --workdir infra start
```
`stream-token` will return `500 stream_not_configured`, so `useStreamToken` errors.

- [ ] **Step 2: Reload the app on the simulator** (idb relaunch `com.anonymous.mobile`, or shake→Reload). Sign in if needed.
Expected: app boots to **Home**; Home / Events / Explore / Community / Profile tabs all navigate normally — **no full-screen "Couldn't connect to chat" lock**.

- [ ] **Step 3: Open the Chat tab.**
Expected: a non-blocking banner "Couldn't connect to chat" + **Retry** above the (empty) channel list. The rest of the app remains usable.

- [ ] **Step 4: Restore + retry.** Re-enable `STREAM_API_SECRET` and restart the stack (per Phase 1.2's restart pattern, exporting the secret from `infra/.supabase-deploy.env`). Back in the app, tap **Retry** in the chat tab.
Expected: the token refetches, the connect effect runs, and the channel list loads (chat connects).

---

## Verification (summary)
- `pnpm -w typecheck` (Task 1 Step 3); simulator degrade + retry (Task 2).
- Finish via superpowers:finishing-a-development-branch (merge to `main` after review).

## Out of scope
Conversation-screen error states (Stream renders its own); reconnection backoff; offline queueing.
