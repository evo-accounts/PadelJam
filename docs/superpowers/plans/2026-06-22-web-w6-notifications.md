# Web W6 — Notifications (+ root→sign-up) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In-app notifications on web — header bell + unread badge + dropdown preview, the notifications feed, and the incoming partner-requests inbox — plus redirecting `/` to the sign-up page.

**Architecture:** A shared `NotificationItem` renderer used by both the header `NotificationBell` dropdown and the `/app/notifications` page; a partner-requests inbox page; the root `(public)` page redirects to `/auth`. All data/mutations via existing `@padel/api` notification hooks.

**Tech Stack:** Next.js 16 App Router (client + one server redirect), React 19, `@padel/api`, `@padel/utils`, shadcn/ui, react-i18next.

**Verified facts (from source):**
- `NotificationRow` = `{ id, type, actor_id, event_id, group_id, community_id, ref_id, actor_name, entity_name, read_at: string|null, cta_done: boolean, created_at }`.
- `useNotifications()` → infinite query; `data.pages.flat()` → `NotificationRow[]`; `hasNextPage`/`fetchNextPage`/`isFetchingNextPage`.
- `useUnreadCount()` → number (count of `read_at IS NULL`). `useNotificationsRealtime()` → side-effect (invalidates unread + notifications).
- `useMarkRead().mutate(id: string)`; `useMarkAllRead().mutate()`; `useClearAll().mutate()`; `useCompleteNotificationCta().mutate(n: NotificationRow)`.
- `usePartnerRequestSummary()` → number (pending count). `useIncomingPartnerRequests()` → `IncomingPartnerRequest[]` = `{ kind: 'event'|'community', request_id, entity_id, entity_name, requester_id, requester_name: string|null, requester_avatar: string|null, created_at }`. `useRespondToRequest().mutate({ kind: 'event'|'community', requestId: string, action: 'accept'|'decline' })`.
- `notificationRoute(n)` (`@padel/utils`) → `/event/<id>` | `/group/<id>` | `/community/<id>` | `/profile/<id>` | null. Web prefixes with `/app`.
- CTA notification types: `event_invite`, `group_invite`, `community_invite`.
- Notification message keys (the `type` is the i18n key, `notifications` namespace, en): `follow:'{{actor}} followed you'`, `event_invite/group_invite/community_invite:'{{actor}} invited you to {{entity}}'`, `community_request_accepted:'Your request to join {{entity}} was accepted'`, `follow_joined_event:'{{actor}} joined {{entity}}'`, `event_cancelled:'{{entity}} was cancelled'`, `event_updated:'{{entity}} was updated — check the new details'`. (Copy the full set + chrome keys from the mobile `notifications` bundle in `apps/mobile/lib/i18n-mobile.ts`.)
- App layout header (`apps/web/src/app/(app)/app/layout.tsx` ~line 99) renders `<NotificationDropdown trigger={<Button…><Bell /><span dot/></Button>} />` (a hardcoded shadcn-studio demo) — replace with `<NotificationBell />`. The chat shortcut button just above links `href="/app"` (should be `/app/chat`). `Bell`/`MessageCircle` already imported.
- `(public)/page.tsx` currently returns a placeholder. `(public)/auth/page.tsx` is the identifier-first auth flow.
- shadcn present: `dropdown-menu, badge, button, card, avatar, skeleton`. `avatarUrl` from `@/lib/upload`. `Providers.tsx` registers `registerWeb*Copy` in sequence (last = `registerWebChatCopy`).

---

## Task 1: i18n `notifications` namespace + root→/auth redirect

**Files:** Modify `apps/web/src/lib/i18n-web.ts`, `apps/web/src/components/Providers.tsx`, `apps/web/src/app/(public)/page.tsx`.

- [ ] **Step 1: `notifications` i18n bundle** — in `i18n-web.ts`, add a `webNotifications` bundle (en/pt-PT/pt-BR) + exported `registerWebNotificationsCopy(instance)` doing `instance.addResourceBundle(locale, 'notifications', webNotifications[locale], true, false)` for each locale (mirror `registerWebGroupCopy`). Copy each locale's values verbatim from the mobile `notifications` bundle (`apps/mobile/lib/i18n-mobile.ts` — three blocks). Keys:
  - Chrome (en shown): `title:'Notifications', partnerRequests:'Partner Requests', pendingCount_one:'{{count}} pending', pendingCount_other:'{{count}} pending', markAllRead:'Mark all as read', clearAll:'Clear all', seeAll:'See all', join:'Join', joined:'Joined', empty:'No notifications yet.', loadError:'Could not load notifications.', accept:'Accept', decline:'Decline', requestsEmpty:'No pending requests.', requestsError:'Could not load requests.', respondError:'Could not complete that action. Please try again.', partnerRequestLabel:'Partner request · {{entity}}', joinRequestLabel:'wants to join {{entity}}'`. (`seeAll` is web-only — translate: pt-PT `'Ver tudo'`, pt-BR `'Ver tudo'`. The rest exist in mobile — copy verbatim, incl. `pendingCount_one/_other`.)
  - Type templates (copy verbatim from mobile, all 3 locales): `follow, event_invite, group_invite, community_invite, community_request_accepted, follow_joined_event, event_cancelled, event_updated` (+ any other type keys present in the mobile `notifications` block — copy the complete set).
- [ ] **Step 2: register** — in `Providers.tsx`, add `registerWebNotificationsCopy` to the `@/lib/i18n-web` import and call it after `registerWebChatCopy(instance);`.
- [ ] **Step 3: root redirect** — replace `apps/web/src/app/(public)/page.tsx` with:
```tsx
import { redirect } from 'next/navigation';

export default function PublicHome() {
  redirect('/auth');
}
```
(A server component; `redirect` throws to navigate. No `'use client'`.)
- [ ] **Step 4:** `pnpm --filter web typecheck && pnpm --filter web build` → PASS (build confirms `/` compiles as a redirect). Commit:
```bash
git add apps/web/src/lib/i18n-web.ts apps/web/src/components/Providers.tsx "apps/web/src/app/(public)/page.tsx"
git commit -m "feat(web): notifications i18n + root→/auth redirect (W6)"
```

---

## Task 2: shared `NotificationItem` + header `NotificationBell`

**Files:**
- Create: `apps/web/src/components/notifications/NotificationItem.tsx`, `apps/web/src/components/notifications/NotificationBell.tsx`
- Modify: `apps/web/src/app/(app)/app/layout.tsx`

- [ ] **Step 1: `NotificationItem.tsx`**
```tsx
'use client';
import { useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { useMarkRead, useCompleteNotificationCta, type NotificationRow } from '@padel/api';
import { notificationRoute } from '@padel/utils';
import { Button } from '@/components/ui/button';

const CTA_TYPES = new Set(['event_invite', 'group_invite', 'community_invite']);

export function NotificationItem({ n, onNavigate }: { n: NotificationRow; onNavigate?: () => void }) {
  const { t, i18n } = useT('notifications');
  const router = useRouter();
  const markRead = useMarkRead();
  const completeCta = useCompleteNotificationCta();

  const message = t(n.type, {
    actor: n.actor_name ?? '',
    entity: n.entity_name ?? '',
    defaultValue: n.entity_name ?? n.actor_name ?? '',
  });
  const when = new Date(n.created_at).toLocaleString(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const onRowClick = () => {
    if (!n.read_at) markRead.mutate(n.id);
    const route = notificationRoute(n);
    if (route) router.push(`/app${route}`);
    onNavigate?.();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onRowClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onRowClick();
      }}
      className={`flex items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
        n.read_at ? '' : 'bg-primary/5'
      }`}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm">{message}</span>
        <span className="text-xs text-muted-foreground">{when}</span>
      </div>
      {CTA_TYPES.has(n.type) ? (
        n.cta_done ? (
          <span className="shrink-0 text-xs text-muted-foreground">{t('joined')}</span>
        ) : (
          <Button
            size="sm"
            className="shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              completeCta.mutate(n);
            }}
          >
            {t('join')}
          </Button>
        )
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: `NotificationBell.tsx`**
```tsx
'use client';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useT } from '@padel/i18n';
import {
  useNotifications,
  useUnreadCount,
  useNotificationsRealtime,
  useMarkAllRead,
} from '@padel/api';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { NotificationItem } from './NotificationItem';

export function NotificationBell() {
  const { t } = useT('notifications');
  useNotificationsRealtime();
  const unread = useUnreadCount();
  const notifications = useNotifications();
  const markAllRead = useMarkAllRead();

  const count = unread.data ?? 0;
  const recent = (notifications.data?.pages.flat() ?? []).slice(0, 8);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t('title')}>
          <Bell />
          {count > 0 ? (
            <span className="bg-destructive text-destructive-foreground absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4">
              {count > 9 ? '9+' : count}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2">
          <span className="text-sm font-semibold">{t('title')}</span>
          {count > 0 ? (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => markAllRead.mutate()}
            >
              {t('markAllRead')}
            </button>
          ) : null}
        </div>
        <div className="max-h-96 divide-y overflow-y-auto">
          {notifications.isLoading ? (
            <Skeleton className="m-3 h-16" />
          ) : recent.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('empty')}</p>
          ) : (
            recent.map((n) => <NotificationItem key={n.id} n={n} />)
          )}
        </div>
        <Link
          href="/app/notifications"
          className="block border-t px-4 py-2 text-center text-sm font-medium hover:bg-muted/50"
        >
          {t('seeAll')}
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```
(Note: clicking a `NotificationItem` inside the dropdown navigates via the router; the dropdown closes on outropside-click naturally. Optionally pass `onNavigate` to force-close — not required.)

- [ ] **Step 3: wire into the layout header** — in `apps/web/src/app/(app)/app/layout.tsx`:
  1. Replace the `<NotificationDropdown trigger={…} />` block with `<NotificationBell />`. Remove the now-unused `import NotificationDropdown from '@/components/shadcn-studio/blocks/dropdown-notification';`. Add `import { NotificationBell } from '@/components/notifications/NotificationBell';`.
  2. Fix the chat shortcut button just above it: change its `<Link href="/app">` to `<Link href="/app/chat">`.
  (Keep `Bell`/`MessageCircle` imports — `Bell` may now be unused in the layout since it moved into NotificationBell; if `tsc`'s `noUnusedLocals` flags `Bell`, remove it from the layout's lucide import.)

- [ ] **Step 4:** `pnpm --filter web typecheck && pnpm --filter web build` → PASS. Commit:
```bash
git add apps/web/src/components/notifications "apps/web/src/app/(app)/app/layout.tsx"
git commit -m "feat(web): notification bell + shared item + header wiring (W6)"
```

---

## Task 3: `/app/notifications` feed page

**Files:** Create `apps/web/src/app/(app)/app/notifications/page.tsx`.

- [ ] **Step 1:**
```tsx
'use client';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import {
  useNotifications,
  useMarkAllRead,
  useClearAll,
  usePartnerRequestSummary,
} from '@padel/api';
import { NotificationItem } from '@/components/notifications/NotificationItem';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function NotificationsPage() {
  const { t } = useT('notifications');
  const list = useNotifications();
  const markAllRead = useMarkAllRead();
  const clearAll = useClearAll();
  const summary = usePartnerRequestSummary();

  const rows = list.data?.pages.flat() ?? [];
  const pending = summary.data ?? 0;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => markAllRead.mutate()}>
            {t('markAllRead')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => clearAll.mutate()}>
            {t('clearAll')}
          </Button>
        </div>
      </div>

      <Link
        href="/app/notifications/partner-requests"
        className="flex items-center justify-between rounded-lg border px-4 py-3 hover:bg-muted/50"
      >
        <span className="text-sm font-medium">{t('partnerRequests')}</span>
        <span className="text-sm text-primary">{t('pendingCount', { count: pending })}</span>
      </Link>

      {list.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : list.isError ? (
        <p className="text-sm text-destructive">{t('loadError')}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('empty')}</p>
      ) : (
        <Card className="divide-y p-0">
          {rows.map((n) => (
            <NotificationItem key={n.id} n={n} />
          ))}
        </Card>
      )}

      {list.hasNextPage ? (
        <Button
          variant="outline"
          className="self-center"
          disabled={list.isFetchingNextPage}
          onClick={() => list.fetchNextPage()}
        >
          {t('seeAll')}
        </Button>
      ) : null}
    </div>
  );
}
```
(The "load more" button reuses `seeAll`; if you prefer a distinct label, add a `loadMore` key — but reusing `seeAll` is acceptable. Alternatively reuse the `event`/`group` `loadMore` is cross-namespace; keep `seeAll` to avoid adding keys.)

- [ ] **Step 2:** `pnpm --filter web typecheck && pnpm --filter web build` → PASS. Commit:
```bash
git add "apps/web/src/app/(app)/app/notifications/page.tsx"
git commit -m "feat(web): notifications feed page (W6)"
```

---

## Task 4: `/app/notifications/partner-requests` inbox

**Files:** Create `apps/web/src/app/(app)/app/notifications/partner-requests/page.tsx`.

- [ ] **Step 1:**
```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import { useIncomingPartnerRequests, useRespondToRequest } from '@padel/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { avatarUrl } from '@/lib/upload';

export default function PartnerRequestsPage() {
  const { t } = useT('notifications');
  const list = useIncomingPartnerRequests();
  const respond = useRespondToRequest();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = (kind: 'event' | 'community', requestId: string, action: 'accept' | 'decline') => {
    setError(null);
    setBusyId(requestId);
    respond
      .mutateAsync({ kind, requestId, action })
      .catch(() => setError(t('respondError')))
      .finally(() => setBusyId(null));
  };

  const rows = list.data ?? [];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('partnerRequests')}</h1>
        <Button asChild variant="ghost" size="sm">
          <Link href="/app/notifications">{t('title')}</Link>
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {list.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : list.isError ? (
        <p className="text-sm text-destructive">{t('requestsError')}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('requestsEmpty')}</p>
      ) : (
        <Card className="divide-y p-0">
          {rows.map((r) => {
            const name = r.requester_name ?? '—';
            const label =
              r.kind === 'event'
                ? t('partnerRequestLabel', { entity: r.entity_name })
                : `${name} ${t('joinRequestLabel', { entity: r.entity_name })}`;
            return (
              <div key={r.request_id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-9">
                    <AvatarImage src={avatarUrl(r.requester_avatar) ?? undefined} />
                    <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">{name}</span>
                    <span className="truncate text-xs text-muted-foreground">{label}</span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === r.request_id}
                    onClick={() => act(r.kind, r.request_id, 'decline')}
                  >
                    {t('decline')}
                  </Button>
                  <Button
                    size="sm"
                    disabled={busyId === r.request_id}
                    onClick={() => act(r.kind, r.request_id, 'accept')}
                  >
                    {t('accept')}
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
```
(VERIFY `useIncomingPartnerRequests` rows are `{ kind, request_id, entity_name, requester_name, requester_avatar, ... }` and `useRespondToRequest().mutateAsync({ kind, requestId, action })` — confirmed in `packages/api/src/notifications/`. The `joinRequestLabel` is `'wants to join {{entity}}'` so it's prefixed with the name; `partnerRequestLabel` is `'Partner request · {{entity}}'` standalone.)

- [ ] **Step 2:** `pnpm --filter web typecheck && pnpm --filter web build` → PASS. Commit:
```bash
git add "apps/web/src/app/(app)/app/notifications/partner-requests/page.tsx"
git commit -m "feat(web): incoming partner-requests inbox (W6)"
```

---

## Task 5: Verification

- [ ] **Step 1:** `pnpm --filter web typecheck && pnpm --filter web build` → PASS.
- [ ] **Step 2 (browser):** Visit `/` (signed out) → redirected to `/auth` (the sign-up flow). 
- [ ] **Step 3 (signed in):** the header **bell** shows an unread badge when there are unread notifications; opening it shows the recent-notifications dropdown + **Mark all read** + **See all**.
- [ ] **Step 4:** **See all** → `/app/notifications` lists notifications with the correct per-type message; clicking one marks it read (badge decrements) and navigates to the entity (`/app/event/…` etc.); an `event_invite` shows **Join** (→ Joined). **Mark all read** clears the badge; **Clear all** empties the feed.
- [ ] **Step 5:** the **Partner requests** entry → `/app/notifications/partner-requests` lists incoming requests; **Accept**/**Decline** respond and remove the row.
- [ ] **Step 6:** the header **chat** shortcut now links to `/app/chat`.

(Notifications are server-generated — against local Supabase, verify with any seeded data; otherwise confirm the shell, empty states, the `/`→`/auth` redirect, and the live badge/realtime wiring.)

---

## Verification (summary)
Per-task typecheck; build after each UI task; browser smoke (Task 5). Finish via superpowers:finishing-a-development-branch.

## Out of scope
W7 marketing landing (dropped); push delivery + device badge (Phase 1.4); notification settings toggles (W1 settings); server-side notification generation.
