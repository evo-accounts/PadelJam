# Phase 4C — Chat Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the chat surface — Active/Archived tabs with archive/unarchive, per-user delete for direct chats, a chat-details media gallery, and an unread badge on the Home chat icon.

**Architecture:** All client-side, built on the 4A/4B Stream client. The chat list gets a tab toggle driving a `ChannelList` `archived` filter, with a custom row (`ChannelRow`) that reads channel data directly + a kebab action sheet (archive/delete/unarchive) + confirmation modals. A `useStreamUnread` hook drives a badge on the Home chat icon. The conversation file moves under `chat/[cid]/` to host a `details.tsx` media gallery.

**Tech Stack:** `stream-chat` + `stream-chat-expo` (9.x), Expo Router + React Native, `expo-image`, `@padel/i18n`. No backend/migration/edge fn.

**Spec:** `docs/superpowers/specs/2026-06-16-phase4c-chat-polish-design.md`

**Verification posture (agreed, as 4A/4B):** `pnpm -w typecheck` only; Stream behavior (archive/delete/media/unread) is dev-build-only (deferred).

**Verified Stream API (stream-chat 9.47):** `channel.archive()` / `channel.unarchive()` (persistent), `channel.hide(null, true)` (per-user hide + clear history), `channel.countUnread()`, `client.user?.total_unread_count`, `channel.type` ∈ {group,event,messaging}, `channel.query({ messages: { limit } })`.

**Two stable-but-unverified-here API points (reconcile at build per task):**
- `ChannelList` custom row prop is **`Preview`** (a component receiving `{ channel }`). If the installed prop name/shape differs, adjust per the SDK types (the row is otherwise self-contained).
- The `archived` boolean **filter** key on `ChannelList` `filters`. If stream-chat 9.47's `ChannelFilters` type rejects `archived`, cast the filters object (`as never`/the SDK's filter type) — the value is a documented Stream channel filter.

---

## File Structure
- **Create** `apps/mobile/components/chat/useStreamUnread.ts` — global unread count hook.
- **Create** `apps/mobile/components/chat/ChatHeaderButton.tsx` — Home chat icon + unread badge.
- **Modify** `apps/mobile/app/(tabs)/_layout.tsx` — use `ChatHeaderButton` in the home header.
- **Create** `apps/mobile/components/chat/ChannelRow.tsx` — custom list row: content + kebab + action sheet + confirmation modals.
- **Modify** `apps/mobile/app/chat/index.tsx` — Active/Archived tabs + `ChannelList` (archived filter) + `Preview={ChannelRow}`.
- **Move** `apps/mobile/app/chat/[cid].tsx` → `apps/mobile/app/chat/[cid]/index.tsx` + add pressable header → details.
- **Create** `apps/mobile/app/chat/[cid]/details.tsx` — media grid + full-screen pager.
- **Modify** `apps/mobile/lib/i18n-mobile.ts` — extend the `chat` namespace.

---

## Task 1: useStreamUnread + Home chat-icon badge

**Files:**
- Create: `apps/mobile/components/chat/useStreamUnread.ts`
- Create: `apps/mobile/components/chat/ChatHeaderButton.tsx`
- Modify: `apps/mobile/app/(tabs)/_layout.tsx`

- [ ] **Step 1: Create the unread hook**

Create `apps/mobile/components/chat/useStreamUnread.ts`:

```ts
import { useEffect, useState } from 'react';

import { streamClient } from '@/lib/streamClient';

// Global Stream unread count for the current user. Reads total_unread_count and re-reads on any
// client event that can change it. Returns 0 when not connected.
export function useStreamUnread(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const read = () => setCount(streamClient.user?.total_unread_count ?? 0);
    read();
    const sub = streamClient.on((event) => {
      if (
        typeof event.total_unread_count === 'number' ||
        event.type === 'message.new' ||
        event.type === 'message.read' ||
        event.type.startsWith('notification.')
      ) {
        read();
      }
    });
    return () => sub.unsubscribe();
  }, []);
  return count;
}
```

- [ ] **Step 2: Create the chat header button**

Create `apps/mobile/components/chat/ChatHeaderButton.tsx`:

```tsx
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { useStreamUnread } from '@/components/chat/useStreamUnread';

export function ChatHeaderButton() {
  const router = useRouter();
  const unread = useStreamUnread();
  return (
    <Pressable onPress={() => router.push('/chat' as never)} accessibilityRole="button" accessibilityLabel="Chat" hitSlop={10} style={styles.wrap}>
      <SymbolView name={{ ios: 'bubble.left.and.bubble.right.fill', android: 'chat', web: 'chat' }} size={22} tintColor="#0B1F3A" />
      {unread > 0 ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 4 },
  dot: { position: 'absolute', top: 2, right: 2, width: 10, height: 10, borderRadius: 5, backgroundColor: '#D7263D', borderWidth: 1.5, borderColor: '#F7F9FC' },
});
```

- [ ] **Step 3: Use it in the home header**

In `apps/mobile/app/(tabs)/_layout.tsx`, the home (`name="index"`) `Tabs.Screen` `headerRight` currently inlines a chat `Pressable` + `<NotificationBell />`. Replace the inline chat `Pressable` with `<ChatHeaderButton />`. Add the import `import { ChatHeaderButton } from '@/components/chat/ChatHeaderButton';` and drop the now-unused inline chat-icon `SymbolView`/`router.push('/chat')` (keep `<NotificationBell />`). Result:

```tsx
            headerRight: () => (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingRight: 12 }}>
                <ChatHeaderButton />
                <NotificationBell />
              </View>
            ),
```
If removing the inline chat icon makes `router`/`SymbolView` unused in `_layout.tsx`, remove those now-dead bits to satisfy `noUnusedLocals` (but `SymbolView` is still used by the tab `tabBarIcon`s, and `router` may be used elsewhere — only remove if genuinely unused).

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter mobile typecheck`
Expected: PASS. (If `streamClient.on`'s event type lacks `total_unread_count`, read it via `(event as { total_unread_count?: number }).total_unread_count` — Stream's `Event` type includes it, but cast if needed.)

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/chat/useStreamUnread.ts apps/mobile/components/chat/ChatHeaderButton.tsx 'apps/mobile/app/(tabs)/_layout.tsx'
git commit -m "feat(chat): unread badge on the Home chat icon"
```

---

## Task 2: i18n keys

**Files:**
- Modify: `apps/mobile/lib/i18n-mobile.ts`

- [ ] **Step 1: Extend the `chat` namespace**

In `apps/mobile/lib/i18n-mobile.ts`, add to the existing `mobileChat.en` object (after the 4A/4B keys):

```ts
    tabActive: 'Active',
    tabArchived: 'Archived',
    archive: 'Archive',
    delete: 'Delete',
    unarchive: 'Unarchive',
    cancel: 'Cancel',
    archiveTitle: 'Archive this chat?',
    archiveBody: 'You can find it later in the Archived tab.',
    deleteTitle: 'Delete this chat?',
    deleteBody: 'All messages will be permanently removed and this action cannot be undone.',
    details: 'Details',
    media: 'Media',
    noPhotos: 'No photos shared yet.',
    actionFailed: "Couldn't complete that action.",
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter mobile typecheck` → PASS.
```bash
git add apps/mobile/lib/i18n-mobile.ts
git commit -m "feat(chat): chat-polish i18n keys"
```

---

## Task 3: ChannelRow (custom row + actions)

**Files:**
- Create: `apps/mobile/components/chat/ChannelRow.tsx`

The row renders its own content from channel data (no dependency on Stream's internal preview
component) + a kebab → action sheet → confirmation modals. It receives the channel and the current
tab via props (the list passes them in Task 4).

- [ ] **Step 1: Create ChannelRow**

Create `apps/mobile/components/chat/ChannelRow.tsx`:

```tsx
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Channel as ChannelType } from 'stream-chat';

import { streamClient } from '@/lib/streamClient';
import { useT } from '@padel/i18n';

type Tab = 'active' | 'archived';

function channelTitle(channel: ChannelType): string {
  const name = (channel.data as { name?: string } | undefined)?.name;
  if (name) return name;
  return (
    Object.values(channel.state.members)
      .map((m) => m.user?.name)
      .filter((n): n is string => !!n && n !== streamClient.user?.name)
      .join(', ') || 'Chat'
  );
}

export function ChannelRow({ channel, tab }: { channel: ChannelType; tab: Tab }) {
  const { t } = useT('chat');
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | 'archive' | 'delete'>(null);

  const isDirect = channel.type === 'messaging';
  const messages = channel.state.messages;
  const last = messages.length ? messages[messages.length - 1] : undefined;
  const unread = channel.countUnread();
  const image = (channel.data as { image?: string } | undefined)?.image;

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch {
      Alert.alert(t('actionFailed'));
    } finally {
      setConfirm(null);
      setMenuOpen(false);
    }
  };

  return (
    <View style={styles.row}>
      <Pressable style={styles.main} onPress={() => router.push(('/chat/' + channel.cid) as never)} accessibilityRole="button">
        <Image source={image ? { uri: image } : undefined} style={styles.avatar} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{channelTitle(channel)}</Text>
          {last?.text ? <Text style={styles.preview} numberOfLines={1}>{last.text}</Text> : null}
        </View>
        {unread > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{unread}</Text></View> : null}
      </Pressable>
      <Pressable onPress={() => setMenuOpen(true)} accessibilityRole="button" hitSlop={10} style={styles.kebab}>
        <Text style={styles.kebabDots}>•••</Text>
      </Pressable>

      {/* action sheet */}
      {menuOpen ? (
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.sheet}>
            {tab === 'archived' ? (
              <Pressable style={styles.sheetRow} onPress={() => run(() => channel.unarchive())} accessibilityRole="button">
                <Text style={styles.sheetText}>{t('unarchive')}</Text>
              </Pressable>
            ) : (
              <>
                <Pressable style={styles.sheetRow} onPress={() => { setMenuOpen(false); setConfirm('archive'); }} accessibilityRole="button">
                  <Text style={styles.sheetText}>{t('archive')}</Text>
                </Pressable>
                {isDirect ? (
                  <Pressable style={styles.sheetRow} onPress={() => { setMenuOpen(false); setConfirm('delete'); }} accessibilityRole="button">
                    <Text style={[styles.sheetText, { color: '#D7263D' }]}>{t('delete')}</Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        </Pressable>
      ) : null}

      {/* confirmation modals */}
      {confirm ? (
        <Pressable style={styles.backdrop} onPress={() => setConfirm(null)}>
          <View style={styles.confirm}>
            <Text style={styles.confirmTitle}>{t(confirm === 'archive' ? 'archiveTitle' : 'deleteTitle')}</Text>
            <Text style={styles.confirmBody}>{t(confirm === 'archive' ? 'archiveBody' : 'deleteBody')}</Text>
            <View style={styles.confirmActions}>
              <Pressable onPress={() => setConfirm(null)} accessibilityRole="button"><Text style={styles.cancel}>{t('cancel')}</Text></Pressable>
              <Pressable
                onPress={() => run(() => (confirm === 'archive' ? channel.archive() : channel.hide(null, true)))}
                accessibilityRole="button"
              >
                <Text style={[styles.confirmCta, confirm === 'delete' && { color: '#D7263D' }]}>
                  {t(confirm === 'archive' ? 'archive' : 'delete')}
                </Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E2E8F0' },
  title: { fontSize: 15, fontWeight: '700', color: '#0B1F3A' },
  preview: { fontSize: 13, color: '#6B7685', marginTop: 2 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#0B7BFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  kebab: { paddingHorizontal: 8, paddingVertical: 8 },
  kebabDots: { fontSize: 16, color: '#6B7685', fontWeight: '700' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },
  sheet: { backgroundColor: '#fff', borderRadius: 12, minWidth: 220, overflow: 'hidden' },
  sheetRow: { paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  sheetText: { fontSize: 15, color: '#0B1F3A', fontWeight: '600' },
  confirm: { backgroundColor: '#fff', borderRadius: 14, padding: 20, marginHorizontal: 32, gap: 8 },
  confirmTitle: { fontSize: 16, fontWeight: '700', color: '#0B1F3A' },
  confirmBody: { fontSize: 14, color: '#3A4A5E' },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24, marginTop: 12 },
  cancel: { fontSize: 15, color: '#6B7685', fontWeight: '600' },
  confirmCta: { fontSize: 15, color: '#0B7BFF', fontWeight: '700' },
});
```

> The row is self-contained (reads `channel.data`, `channel.state.messages`, `channel.countUnread()`), so it does not depend on Stream's internal preview component name. `channel.unarchive`/`archive`/`hide` are the verified 9.47 methods.

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter mobile typecheck` → PASS. (If `channel.countUnread()` / `channel.state.messages` typings differ, adjust minimally; both are standard stream-chat 9.x.)
```bash
git add apps/mobile/components/chat/ChannelRow.tsx
git commit -m "feat(chat): ChannelRow with archive/delete/unarchive action sheet"
```

---

## Task 4: chat list Active/Archived tabs

**Files:**
- Modify: `apps/mobile/app/chat/index.tsx`

- [ ] **Step 1: Rewrite the chat list with tabs**

Replace `apps/mobile/app/chat/index.tsx` with:

```tsx
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Channel } from 'stream-chat';
import { ChannelList } from 'stream-chat-expo';

import { ChannelRow } from '@/components/chat/ChannelRow';

type Tab = 'active' | 'archived';

export default function ChatListScreen() {
  const { t } = useT('chat');
  const router = useRouter();
  const uid = useSession().session?.user.id;
  const [tab, setTab] = useState<Tab>('active');

  if (!uid) return null;

  // The list row gets the current tab so it shows Unarchive vs Archive/Delete.
  const Preview = (props: { channel: Channel }) => <ChannelRow channel={props.channel} tab={tab} />;

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
      <View style={styles.tabs}>
        {(['active', 'archived'] as const).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[styles.tab, tab === k && styles.tabActive]} accessibilityRole="button">
            <Text style={[styles.tabText, tab === k && styles.tabTextActive]}>{t(k === 'active' ? 'tabActive' : 'tabArchived')}</Text>
          </Pressable>
        ))}
      </View>
      <ChannelList
        key={tab}
        filters={{ members: { $in: [uid] }, archived: tab === 'archived' }}
        sort={{ last_message_at: -1 }}
        Preview={Preview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  new: { color: '#0B7BFF', fontWeight: '700', fontSize: 15, paddingHorizontal: 8 },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#0B7BFF' },
  tabText: { fontSize: 15, color: '#6B7685', fontWeight: '600' },
  tabTextActive: { color: '#0B7BFF', fontWeight: '700' },
});
```

> **Reconcile (build-time):** (a) the `Preview` prop — Stream RN `ChannelList` accepts a custom row via `Preview`; if the prop/param shape differs in 9.3.1, adapt `Preview` to the SDK's signature (it still just needs `props.channel`). (b) the `archived` filter — if `ChannelFilters` typing rejects `archived`, cast the `filters` object. The `key={tab}` forces the list to re-query when the tab flips. Removing the old `onSelect`-based navigation is intentional — `ChannelRow` navigates on row tap.

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter mobile typecheck` → PASS (resolve the two reconcile points if flagged).
```bash
git add apps/mobile/app/chat/index.tsx
git commit -m "feat(chat): Active/Archived tabs + custom row in the chat list"
```

---

## Task 5: chat details + media gallery (route restructure)

**Files:**
- Move: `apps/mobile/app/chat/[cid].tsx` → `apps/mobile/app/chat/[cid]/index.tsx`
- Create: `apps/mobile/app/chat/[cid]/details.tsx`

- [ ] **Step 1: Move the conversation file under a folder + add the details entry**

```bash
cd /Users/joaopaulos4/Cursor/PadelJam/apps/mobile/app/chat
mkdir -p '[cid]'
git mv '[cid].tsx' '[cid]/index.tsx'
```
Then edit `apps/mobile/app/chat/[cid]/index.tsx` to make the header title open details. Replace its
`<Stack.Screen options={{ title }} />` with a pressable header title:

```tsx
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, Text } from 'react-native';
// ...inside the component (after channel is resolved), add: const router = useRouter();
      <Stack.Screen
        options={{
          headerTitle: () => (
            <Pressable onPress={() => router.push(('/chat/' + cid + '/details') as never)} accessibilityRole="button">
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#0B1F3A' }}>{title}</Text>
            </Pressable>
          ),
        }}
      />
```
(Keep the rest of the file — `Channel`/`MessageList`/`MessageComposer`, the watch effect, the `title` derivation — unchanged. Add `useRouter` to the existing `expo-router` import and `Pressable, Text` to the `react-native` import.)

- [ ] **Step 2: Create the details + media gallery screen**

Create `apps/mobile/app/chat/[cid]/details.tsx`:

```tsx
import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Dimensions, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { streamClient } from '@/lib/streamClient';

const COLS = 3;
const GAP = 2;

export default function ChatDetailsScreen() {
  const { t } = useT('chat');
  const { cid } = useLocalSearchParams<{ cid: string }>();
  const [images, setImages] = useState<string[] | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);

  useEffect(() => {
    if (!cid) return;
    let cancelled = false;
    const [type, id] = cid.split(':');
    if (!type || !id) return;
    const channel = streamClient.channel(type, id);
    channel
      .query({ messages: { limit: 100 } })
      .then((res) => {
        const urls: string[] = [];
        // newest first
        for (let i = res.messages.length - 1; i >= 0; i--) {
          for (const a of res.messages[i].attachments ?? []) {
            if (a.type === 'image' && (a.image_url || a.asset_url)) urls.push((a.image_url ?? a.asset_url) as string);
          }
        }
        if (!cancelled) setImages(urls);
      })
      .catch(() => {
        if (!cancelled) setImages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [cid]);

  const size = (Dimensions.get('window').width - GAP * (COLS - 1)) / COLS;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('details') }} />
      <Text style={styles.section}>{t('media')}</Text>
      {images === null ? (
        <ActivityIndicator color="#0B1F3A" style={{ marginTop: 32 }} />
      ) : images.length === 0 ? (
        <Text style={styles.empty}>{t('noPhotos')}</Text>
      ) : (
        <FlatList
          data={images}
          numColumns={COLS}
          keyExtractor={(u, i) => u + i}
          columnWrapperStyle={{ gap: GAP }}
          contentContainerStyle={{ gap: GAP }}
          renderItem={({ item, index }) => (
            <Pressable onPress={() => setViewer(index)} accessibilityRole="imagebutton">
              <Image source={{ uri: item }} style={{ width: size, height: size }} contentFit="cover" />
            </Pressable>
          )}
        />
      )}

      <Modal visible={viewer !== null} transparent={false} animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={styles.viewer}>
          <Pressable style={styles.close} onPress={() => setViewer(null)} accessibilityRole="button">
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
          {images && viewer !== null ? (
            <FlatList
              data={images}
              horizontal
              pagingEnabled
              initialScrollIndex={viewer}
              getItemLayout={(_, i) => ({ length: Dimensions.get('window').width, offset: Dimensions.get('window').width * i, index: i })}
              keyExtractor={(u, i) => 'full' + u + i}
              renderItem={({ item }) => (
                <Image source={{ uri: item }} style={{ width: Dimensions.get('window').width, height: '100%' }} contentFit="contain" />
              )}
            />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  section: { fontSize: 13, fontWeight: '700', color: '#6B7685', textTransform: 'uppercase', paddingHorizontal: 12, paddingVertical: 10 },
  empty: { textAlign: 'center', marginTop: 48, color: '#6B7685', fontSize: 15 },
  viewer: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  close: { position: 'absolute', top: 48, right: 20, zIndex: 1, padding: 8 },
  closeText: { color: '#fff', fontSize: 22, fontWeight: '700' },
});
```

- [ ] **Step 3: Typecheck (regen routes if needed)**

Run: `pnpm --filter mobile typecheck`
If it errors on the moved/new routes, briefly start Metro to regenerate typed routes:
```bash
cd apps/mobile && (npx expo start >/tmp/metro.log 2>&1 &) ; sleep 25 ; pkill -f "expo start" ; cd ../..
```
then re-run. Expected: PASS. (Pushes use `as never`; the `git mv` keeps `/chat/<cid>` working as the folder index.)

- [ ] **Step 4: Commit**

```bash
git add 'apps/mobile/app/chat/[cid]/index.tsx' 'apps/mobile/app/chat/[cid]/details.tsx'
git commit -m "feat(chat): chat details media gallery + pressable conversation header"
```

- [ ] **Step 5: Dev-build smoke (deferred — document, don't run here)**

On a dev build: archive a chat → moves to Archived tab, stays archived after a new message; unarchive → back to Active; delete a direct chat → gone + history cleared; send photos then open the conversation header → Media grid shows them, tap → full-screen pager; unread count on the Home chat icon updates on a new inbound message.

---

## Verification gate (whole phase)

```bash
pnpm --filter mobile typecheck
pnpm -w typecheck
# Stream archive/delete/media/unread behavior is dev-build-only (deferred).
```

---

## Self-Review

**Spec coverage:**
- Active/Archived tabs (§5.3) → Task 4 (`ChannelList` archived filter + tab bar). ✓
- Archive + confirmation modal (group/event/direct) → Task 3 (`channel.archive()` + `archiveTitle`/`archiveBody`). ✓
- Direct delete (per-user hide + clear history) + destructive confirmation → Task 3 (`channel.hide(null, true)`, direct-only). ✓
- Unarchive (Archived tab, no confirm) → Task 3 (`channel.unarchive()`). ✓
- Group/event vs direct action sets (group/event: Archive only; direct: Archive+Delete) → Task 3 (`isDirect` from `channel.type`). ✓
- Unread: per-row (Task 3 `countUnread()` badge) + Home chat-icon badge (HN-14) → Task 1 (`useStreamUnread` + `ChatHeaderButton`). ✓
- Chat details via header tap + Media grid + full-screen pager (§5.4) → Task 5. ✓
- i18n → Task 2. ✓
- Deferred (swipe, deep media pagination, push) documented in the spec.

**Placeholder scan:** none — complete code in every code step. The two "reconcile at build" notes (the `Preview` prop + `archived` filter) are real, scoped contingencies tied to typecheck, like 4A's `MessageComposer` reconciliation.

**Type consistency:** `ChannelRow({ channel, tab })` (Task 3) matches the `Preview` wrapper in Task 4 (`<ChannelRow channel={props.channel} tab={tab} />`). `useStreamUnread` (Task 1) used by `ChatHeaderButton` (Task 1). i18n keys (Task 2) cover every `t(...)` in Tasks 3–5. `channel.archive/unarchive/hide/countUnread/query` are the verified 9.47 methods. The moved `chat/[cid]/index.tsx` preserves the `/chat/<cid>` route the chat list + ensure-channel push to; details at `/chat/<cid>/details`.

**Known unknowns (flagged):** the `ChannelList` `Preview` prop signature + the `archived` filter key (both Task 4, reconciled against the installed SDK at build, caught by typecheck). Everything else uses verified APIs.
