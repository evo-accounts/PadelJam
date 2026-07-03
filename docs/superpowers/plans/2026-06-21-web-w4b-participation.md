# Web W4b — Event participation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Player participation actions on web — join / leave / waiting-list / invitation accept-decline on the event detail page (with deadline + capacity gating), plus the team partner-request flow.

**Architecture:** A pure, unit-tested `participationState` helper in `@padel/utils` (next to `eventDeadlines`); an `EventCTA` component rendering the adaptive state machine; the W4a detail page wires invitations + mutations and swaps its "coming soon" CTA for `EventCTA`; a new `/app/event/[id]/partner-requests` page for team events. Data/mutations via existing `@padel/api` hooks.

**Tech Stack:** Next.js 16 App Router (client), React 19, `@padel/api`, `@padel/utils` (vitest), `@padel/auth` (`useSession`), shadcn/ui, react-i18next.

**Verified facts (from source):**
- `deadlineState(startsAtIso: string, nowMs: number)` → `{ joinCutoffMs, leaveCutoffMs, joinClosed, leaveLocked }`; join closes `JOIN_CUTOFF_MS = 6h` before start, leave locks `LEAVE_CUTOFF_MS = 12h` before. With an empty/invalid `startsAtIso` it returns `NaN` cutoffs and both flags `false`. `formatCountdown(ms)` exists in `@padel/utils`.
- `events` columns used: `organizer_id, starts_at, num_courts, allow_standby, standby_spots, specification ('team'|...), group_id (nullable), status`.
- `useEventParticipants(id)` rows: `{ user_id: string|null, status, is_standby, waiting_list_position: number|null, profiles, ... }`. Capacity math (mobile): `regularCapacity = num_courts*4`; `confirmedRegular` = `status==='confirmed' && !is_standby`; `standbyUsed` = `is_standby`; `totalCapacity = regularCapacity + (allow_standby ? standby_spots??0 : 0)`; `totalIn = confirmedRegular + standbyUsed`.
- `useEventInvitations(id)` → pending rows `{ id, invitee_id: string|null, invited_by: string, status, invitee:{...} }`.
- `usePartnerRequests(id)` → `{ id, requester_id, target_id, status, requester:{id,full_name,avatar_url}, target:{...} }[]`.
- Mutations: `useJoinEvent()`/`useLeaveEvent().mutate({ eventId, groupId })`; `useLeaveWaitingList(eventId).mutate()`; `useAcceptEventInvitation().mutate({ eventId, groupId })`; `useDeclineEventInvitation(eventId).mutate()`; `useRequestPartner(eventId).mutate(targets: string[])`; `useAcceptPartnerRequest(eventId)/useDeclinePartnerRequest(eventId).mutate(requestId)`. All throw `Error(mappedKey)` on failure.
- `useGroupMembers(id)` → `{ user_id, profiles }[]` (W3). `useSession` from `@padel/auth` → `{ session?.user.id }`. `avatarUrl` from `@/lib/upload`.
- W4a detail page `apps/web/src/app/(app)/app/event/[id]/page.tsx` currently renders a disabled CTA at lines ~96–99 (`<Button disabled>{t('comingSoon')}</Button>` + `actionsComingSoon` note) — that block is what Task 3 replaces.

---

## Task 1: `participationState` pure helper + tests (`@padel/utils`)

**Files:**
- Create: `packages/utils/src/event-participation.ts`, `packages/utils/src/event-participation.test.ts`
- Modify: `packages/utils/src/index.ts` (export the new module)

- [ ] **Step 1: Write the helper**

Create `packages/utils/src/event-participation.ts`:
```ts
import { deadlineState } from './eventDeadlines';

export interface PSEvent {
  organizer_id: string;
  starts_at: string | null;
  num_courts: number;
  allow_standby: boolean;
  standby_spots: number | null;
}
export interface PSParticipant {
  user_id: string | null;
  status: string;
  is_standby: boolean;
}
export interface PSInvitation {
  invitee_id: string | null;
}

export interface ParticipationState<P, I> {
  me: P | null;
  myInvite: I | null;
  isOrganizer: boolean;
  regularCapacity: number;
  confirmedRegular: number;
  standbyUsed: number;
  totalCapacity: number;
  totalIn: number;
  joinClosed: boolean;
  leaveLocked: boolean;
  joinCutoffMs: number;
  leaveCutoffMs: number;
}

/**
 * Derives a viewer's relationship to an event plus capacity + deadline gating,
 * mirroring the mobile event-detail screen. Pure: no I/O, `nowMs` passed in.
 */
export function participationState<P extends PSParticipant, I extends PSInvitation>(
  event: PSEvent,
  participants: P[],
  invitations: I[],
  uid: string | null | undefined,
  nowMs: number,
): ParticipationState<P, I> {
  const me = participants.find((p) => p.user_id === uid) ?? null;
  const myInvite = invitations.find((i) => i.invitee_id === uid) ?? null;
  const isOrganizer = uid != null && uid === event.organizer_id;

  const regularCapacity = event.num_courts * 4;
  const confirmedRegular = participants.filter(
    (p) => p.status === 'confirmed' && !p.is_standby,
  ).length;
  const standbyUsed = participants.filter((p) => p.is_standby).length;
  const totalCapacity = regularCapacity + (event.allow_standby ? event.standby_spots ?? 0 : 0);
  const totalIn = confirmedRegular + standbyUsed;

  const { joinCutoffMs, leaveCutoffMs, joinClosed, leaveLocked } = deadlineState(
    event.starts_at ?? '',
    nowMs,
  );

  return {
    me,
    myInvite,
    isOrganizer,
    regularCapacity,
    confirmedRegular,
    standbyUsed,
    totalCapacity,
    totalIn,
    joinClosed,
    leaveLocked,
    joinCutoffMs,
    leaveCutoffMs,
  };
}
```

- [ ] **Step 2: Write the failing test**

Create `packages/utils/src/event-participation.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { participationState, type PSEvent } from './event-participation';

const HOUR = 60 * 60 * 1000;
const baseEvent = (over: Partial<PSEvent> = {}): PSEvent => ({
  organizer_id: 'org',
  starts_at: new Date(100 * HOUR).toISOString(),
  num_courts: 2,
  allow_standby: false,
  standby_spots: null,
  ...over,
});
const now = 0; // far before start

describe('participationState', () => {
  it('computes regular + total capacity (no standby)', () => {
    const s = participationState(baseEvent(), [], [], 'u1', now);
    expect(s.regularCapacity).toBe(8);
    expect(s.totalCapacity).toBe(8);
    expect(s.totalIn).toBe(0);
  });

  it('adds standby spots to total capacity when allowed', () => {
    const s = participationState(
      baseEvent({ allow_standby: true, standby_spots: 3 }),
      [],
      [],
      'u1',
      now,
    );
    expect(s.totalCapacity).toBe(11);
  });

  it('counts confirmed-regular and standby separately', () => {
    const parts = [
      { user_id: 'a', status: 'confirmed', is_standby: false },
      { user_id: 'b', status: 'confirmed', is_standby: true },
      { user_id: 'c', status: 'waiting_list', is_standby: false },
    ];
    const s = participationState(baseEvent({ allow_standby: true, standby_spots: 2 }), parts, [], 'a', now);
    expect(s.confirmedRegular).toBe(1);
    expect(s.standbyUsed).toBe(1);
    expect(s.totalIn).toBe(2);
    expect(s.me?.user_id).toBe('a');
  });

  it('detects organizer and invitee', () => {
    const s1 = participationState(baseEvent(), [], [], 'org', now);
    expect(s1.isOrganizer).toBe(true);
    const s2 = participationState(baseEvent(), [], [{ invitee_id: 'u2' }], 'u2', now);
    expect(s2.isOrganizer).toBe(false);
    expect(s2.myInvite?.invitee_id).toBe('u2');
    expect(s2.me).toBeNull();
  });

  it('gates join 6h before and leave 12h before start', () => {
    const startMs = 100 * HOUR;
    const ev = baseEvent({ starts_at: new Date(startMs).toISOString() });
    // 7h before start: join open, leave open
    const a = participationState(ev, [], [], 'u1', startMs - 7 * HOUR);
    expect(a.joinClosed).toBe(false);
    expect(a.leaveLocked).toBe(false);
    // 5h before: join closed, leave locked
    const b = participationState(ev, [], [], 'u1', startMs - 5 * HOUR);
    expect(b.joinClosed).toBe(true);
    expect(b.leaveLocked).toBe(true);
    // 10h before: join open, leave locked
    const c = participationState(ev, [], [], 'u1', startMs - 10 * HOUR);
    expect(c.joinClosed).toBe(false);
    expect(c.leaveLocked).toBe(true);
  });
});
```

- [ ] **Step 3: Export from the package index**

In `packages/utils/src/index.ts`, add (next to the `eventDeadlines` export): `export * from './event-participation';`

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @padel/utils test`
Expected: PASS (all participationState cases). Then `pnpm --filter @padel/utils typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/utils/src/event-participation.ts packages/utils/src/event-participation.test.ts packages/utils/src/index.ts
git commit -m "feat(utils): participationState helper for event CTA gating (W4b)"
```

---

## Task 2: Extend `event` i18n with CTA + partner keys

**Files:** Modify `apps/web/src/lib/i18n-web.ts` (the `webEvent` bundle — all three locale blocks).

- [ ] **Step 1: Add keys to each locale block**

Add the following to the `en`, `pt-PT`, `pt-BR` blocks of `webEvent` (do NOT duplicate keys already present from W4a, e.g. `comingSoon`, `notAvailable`, `errorTitle` if present — only add the missing ones). Values lifted from the mobile `event` bundle.

English (`en`):
```
joinCta: 'Join', waitlistCta: 'Join waiting list', leaveCta: 'Leave event', leaveWaitlistCta: 'Leave waiting list',
joinAsPlayerCta: 'Join as a player', leaveAsPlayerCta: 'Leave as a player', teamJoinCta: 'Join with a partner',
acceptCta: 'Accept', declineCta: 'Decline',
goingBadge: "You're going", standbyBadge: "You're on standby", waitlistBadge: 'Waiting list · #{{pos}}',
organizerBadge: "You're organizing this event", organizerPlayingBadge: "You're organizing and going!",
invitedBanner: '{{name}} invited you', invitedBannerGeneric: "You're invited",
joiningClosed: 'Joining closed', joinCountdown: '{{time}} left to join', leaveByHint: 'You can leave until {{when}}',
leaveLockedBody: 'Past the drop-out deadline — leave is no longer available.',
manageCta: 'Manage', startCta: 'Start event', viewMatchesCta: 'View matches', viewResultsCta: 'View results',
partnerRequestsTitle: 'Partner requests', choosePartnerTitle: 'Choose a partner',
partnerIncoming: '{{name}} wants to partner with you', partnerRequestPending: 'Requested',
requestPartnerCta: 'Request', noPartnerRequests: 'No partner requests yet',
backToEvent: 'Back to event', notTeamEvent: 'This event does not use partners.',
errorTitle: 'Something went wrong', unknown_error: 'Something went wrong. Please try again.',
```
(NOTE: the mobile `leaveLockedBody` says "message the organizer to leave" — W4b has no DM yet (→W5), so use the
adjusted English above and matching pt strings: pt-PT `'Passou o prazo de desistência — já não é possível sair.'`,
pt-BR `'Passou o prazo de desistência — não é mais possível sair.'`.)

pt-PT:
```
joinCta: 'Aderir', waitlistCta: 'Entrar na lista de espera', leaveCta: 'Sair do evento', leaveWaitlistCta: 'Sair da lista de espera',
joinAsPlayerCta: 'Aderir como jogador', leaveAsPlayerCta: 'Sair como jogador', teamJoinCta: 'Aderir com um parceiro',
acceptCta: 'Aceitar', declineCta: 'Recusar',
goingBadge: 'Vais participar', standbyBadge: 'Estás como suplente', waitlistBadge: 'Lista de espera · #{{pos}}',
organizerBadge: 'Estás a organizar este evento', organizerPlayingBadge: 'Estás a organizar e a participar!',
invitedBanner: '{{name}} convidou-te', invitedBannerGeneric: 'Foste convidado',
joiningClosed: 'Inscrições encerradas', joinCountdown: '{{time}} para aderir', leaveByHint: 'Podes sair até {{when}}',
leaveLockedBody: 'Passou o prazo de desistência — já não é possível sair.',
manageCta: 'Gerir', startCta: 'Iniciar evento', viewMatchesCta: 'Ver jogos', viewResultsCta: 'Ver resultados',
partnerRequestsTitle: 'Pedidos de parceiro', choosePartnerTitle: 'Escolhe um parceiro',
partnerIncoming: '{{name}} quer fazer parceria contigo', partnerRequestPending: 'Pedido enviado',
requestPartnerCta: 'Pedir', noPartnerRequests: 'Ainda não há pedidos de parceiro',
backToEvent: 'Voltar ao evento', notTeamEvent: 'Este evento não usa parceiros.',
errorTitle: 'Algo correu mal', unknown_error: 'Algo correu mal. Tente novamente.',
```
pt-BR:
```
joinCta: 'Entrar', waitlistCta: 'Entrar na lista de espera', leaveCta: 'Sair do evento', leaveWaitlistCta: 'Sair da lista de espera',
joinAsPlayerCta: 'Entrar como jogador', leaveAsPlayerCta: 'Sair como jogador', teamJoinCta: 'Entrar com um parceiro',
acceptCta: 'Aceitar', declineCta: 'Recusar',
goingBadge: 'Você vai participar', standbyBadge: 'Você está na reserva', waitlistBadge: 'Lista de espera · #{{pos}}',
organizerBadge: 'Você está organizando este evento', organizerPlayingBadge: 'Você está organizando e participando!',
invitedBanner: '{{name}} convidou você', invitedBannerGeneric: 'Você foi convidado',
joiningClosed: 'Inscrições encerradas', joinCountdown: '{{time}} para entrar', leaveByHint: 'Você pode sair até {{when}}',
leaveLockedBody: 'Passou o prazo de desistência — não é mais possível sair.',
manageCta: 'Gerenciar', startCta: 'Iniciar evento', viewMatchesCta: 'Ver partidas', viewResultsCta: 'Ver resultados',
partnerRequestsTitle: 'Pedidos de parceiro', choosePartnerTitle: 'Escolha um parceiro',
partnerIncoming: '{{name}} quer fazer dupla com você', partnerRequestPending: 'Pedido enviado',
requestPartnerCta: 'Pedir', noPartnerRequests: 'Ainda não há pedidos de parceiro',
backToEvent: 'Voltar ao evento', notTeamEvent: 'Este evento não usa parceiros.',
errorTitle: 'Algo deu errado', unknown_error: 'Algo deu errado. Tente novamente.',
```
If `comingSoon`/`actionsComingSoon`/`status*` etc. already exist from W4a, leave them. If `errorTitle`/`unknown_error` already exist, do not re-add.

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm --filter web typecheck` → PASS (would error on a duplicate object key).
```bash
git add apps/web/src/lib/i18n-web.ts
git commit -m "feat(web): event participation + partner i18n keys (W4b)"
```

---

## Task 3: `EventCTA` component + wire into the detail page

**Files:**
- Create: `apps/web/src/components/event/EventCTA.tsx`
- Modify: `apps/web/src/app/(app)/app/event/[id]/page.tsx`

- [ ] **Step 1: Create `EventCTA.tsx`**

```tsx
'use client';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import { formatCountdown } from '@padel/utils';
import type { ParticipationState } from '@padel/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface CTAEvent {
  id: string;
  status: string;
  specification: string;
  starts_at: string | null;
}
type Part = { user_id: string | null; status: string; is_standby: boolean; waiting_list_position: number | null };
type Inv = { invitee_id: string | null; invited_by: string };

export function EventCTA({
  event,
  state,
  nowMs,
  inviterName,
  busy,
  error,
  onJoin,
  onLeave,
  onLeaveWaitlist,
  onAccept,
  onDecline,
}: {
  event: CTAEvent;
  state: ParticipationState<Part, Inv>;
  nowMs: number;
  inviterName: string | null;
  busy: boolean;
  error: string | null;
  onJoin: () => void;
  onLeave: () => void;
  onLeaveWaitlist: () => void;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t } = useT('event');
  const { me, myInvite, isOrganizer, totalIn, totalCapacity, joinClosed, leaveLocked, joinCutoffMs } = state;
  const isTeam = event.specification === 'team';
  const partnerHref = `/app/event/${event.id}/partner-requests`;

  // in_progress / completed: live/results view is W4e.
  if (event.status !== 'scheduled') {
    return (
      <div className="flex flex-col gap-2">
        <Button disabled className="w-full sm:w-auto">
          {event.status === 'completed' ? t('viewResultsCta') : t('viewMatchesCta')}
        </Button>
        <p className="text-xs text-muted-foreground">{t('comingSoon')}</p>
      </div>
    );
  }

  const leaveHint = <p className="text-xs text-muted-foreground">{t('leaveByHint', { when: new Date(state.leaveCutoffMs).toLocaleString() })}</p>;
  const errLine = error ? <p className="text-sm text-destructive">{error}</p> : null;

  // Organizer
  if (isOrganizer) {
    return (
      <div className="flex flex-col items-start gap-2">
        <Badge variant="secondary">{me ? t('organizerPlayingBadge') : t('organizerBadge')}</Badge>
        <Button disabled className="w-full sm:w-auto">
          {t('manageCta')}
        </Button>
        <p className="text-xs text-muted-foreground">{t('comingSoon')}</p>
        {me == null && !joinClosed ? (
          isTeam ? (
            <Button asChild variant="outline">
              <Link href={partnerHref}>{t('joinAsPlayerCta')}</Link>
            </Button>
          ) : (
            <Button variant="outline" disabled={busy} onClick={onJoin}>
              {t('joinAsPlayerCta')}
            </Button>
          )
        ) : null}
        {me != null && !leaveLocked ? (
          <>
            <Button variant="outline" disabled={busy} onClick={onLeave}>
              {t('leaveAsPlayerCta')}
            </Button>
            {leaveHint}
          </>
        ) : null}
        {errLine}
      </div>
    );
  }

  // Existing participant
  if (me) {
    if (me.status === 'waiting_list') {
      return (
        <div className="flex flex-col items-start gap-2">
          <Badge variant="secondary">{t('waitlistBadge', { pos: me.waiting_list_position ?? 0 })}</Badge>
          <Button variant="outline" disabled={busy} onClick={onLeaveWaitlist}>
            {t('leaveWaitlistCta')}
          </Button>
          {errLine}
        </div>
      );
    }
    return (
      <div className="flex flex-col items-start gap-2">
        <Badge variant="secondary">{me.is_standby ? t('standbyBadge') : t('goingBadge')}</Badge>
        {leaveLocked ? (
          <p className="text-sm text-muted-foreground">{t('leaveLockedBody')}</p>
        ) : (
          <>
            <Button variant="outline" disabled={busy} onClick={onLeave}>
              {t('leaveCta')}
            </Button>
            {leaveHint}
          </>
        )}
        {errLine}
      </div>
    );
  }

  // Invited (not yet a participant)
  if (myInvite) {
    if (joinClosed) return <p className="text-sm text-muted-foreground">{t('joiningClosed')}</p>;
    return (
      <div className="flex flex-col items-start gap-2">
        <Badge variant="secondary">
          {inviterName ? t('invitedBanner', { name: inviterName }) : t('invitedBannerGeneric')}
        </Badge>
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy} onClick={onDecline}>
            {t('declineCta')}
          </Button>
          <Button disabled={busy} onClick={onAccept}>
            {t('acceptCta')}
          </Button>
        </div>
        {errLine}
      </div>
    );
  }

  // Not in / not invited
  if (joinClosed) return <p className="text-sm text-muted-foreground">{t('joiningClosed')}</p>;
  if (isTeam) {
    return (
      <div className="flex flex-col items-start gap-2">
        <Button asChild>
          <Link href={partnerHref}>{t('teamJoinCta')}</Link>
        </Button>
      </div>
    );
  }
  const joinLabel = totalIn >= totalCapacity ? t('waitlistCta') : t('joinCta');
  return (
    <div className="flex flex-col items-start gap-2">
      {Number.isFinite(joinCutoffMs) ? (
        <p className="text-xs text-muted-foreground">
          {t('joinCountdown', { time: formatCountdown(joinCutoffMs - nowMs) })}
        </p>
      ) : null}
      <Button disabled={busy} onClick={onJoin}>
        {joinLabel}
      </Button>
      {errLine}
    </div>
  );
}
```
VERIFY: `ParticipationState` and `formatCountdown` are exported from `@padel/utils`. If `formatCountdown` expects a non-negative number / different unit, check `packages/utils/src/eventDeadlines.ts` and adapt the call.

- [ ] **Step 2: Wire into the detail page**

In `apps/web/src/app/(app)/app/event/[id]/page.tsx`:
1. Add imports:
```tsx
import { useState } from 'react';
import { useSession } from '@padel/auth';
import { participationState } from '@padel/utils';
import {
  useEventInvitations,
  useJoinEvent,
  useLeaveEvent,
  useLeaveWaitingList,
  useAcceptEventInvitation,
  useDeclineEventInvitation,
} from '@padel/api';
import { EventCTA } from '@/components/event/EventCTA';
```
(merge the `@padel/api` names into the existing import.)
2. Add hooks BEFORE the early returns (with the existing read hooks):
```tsx
const uid = useSession().session?.user.id;
const invitations = useEventInvitations(id);
const joinEvent = useJoinEvent();
const leaveEvent = useLeaveEvent();
const leaveWaitlist = useLeaveWaitingList(id);
const acceptInvite = useAcceptEventInvitation();
const declineInvite = useDeclineEventInvitation(id);
const [nowMs] = useState(() => Date.now());
const [busy, setBusy] = useState(false);
const [ctaError, setCtaError] = useState<string | null>(null);
```
3. After the `if (!event.data) return ...` guard (so `e` is defined), derive state + handlers:
```tsx
const state = participationState(
  e,
  (participants.data ?? []) as Parameters<typeof participationState>[1],
  (invitations.data ?? []) as Parameters<typeof participationState>[2],
  uid,
  nowMs,
);
const inviterName =
  state.myInvite != null
    ? parts.find((p) => p.user_id === state.myInvite!.invited_by)?.profiles?.full_name ?? null
    : null;

const runCta = (fn: () => Promise<unknown>) => {
  setBusy(true);
  setCtaError(null);
  fn()
    .catch((err) => setCtaError(t(err instanceof Error ? err.message : 'unknown_error')))
    .finally(() => setBusy(false));
};
const groupId = e.group_id;
```
Note: the `t(err.message)` maps a known RPC error key to its i18n string; for an unmapped key i18next returns the key itself (acceptable). If you prefer an explicit fallback, wrap with a known-key set like W3b did.
4. Replace the W4a placeholder CTA block (the `<div>` containing `<Button disabled>{t('comingSoon')}</Button>` + `actionsComingSoon`) with:
```tsx
<EventCTA
  event={e}
  state={state}
  nowMs={nowMs}
  inviterName={inviterName}
  busy={busy}
  error={ctaError}
  onJoin={() => runCta(() => joinEvent.mutateAsync({ eventId: id, groupId }))}
  onLeave={() => runCta(() => leaveEvent.mutateAsync({ eventId: id, groupId }))}
  onLeaveWaitlist={() => runCta(() => leaveWaitlist.mutateAsync())}
  onAccept={() => runCta(() => acceptInvite.mutateAsync({ eventId: id, groupId }))}
  onDecline={() => runCta(() => declineInvite.mutateAsync())}
/>
```
(`parts` is the existing `EventParticipant[]` array on the page; if its row type lacks `waiting_list_position`/`is_standby`, the `participationState` generic still works since it only reads the `PSParticipant` subset — use `as` casts on the `participants.data`/`invitations.data` inputs as shown. Keep `EventParticipantsList` usage unchanged.)

- [ ] **Step 3: Typecheck + build + commit**

Run: `pnpm --filter web typecheck && pnpm --filter web build` → PASS.
```bash
git add "apps/web/src/components/event/EventCTA.tsx" "apps/web/src/app/(app)/app/event/[id]/page.tsx"
git commit -m "feat(web): adaptive event CTA — join/leave/waitlist/invite (W4b)"
```

---

## Task 4: Team partner-requests page

**Files:** Create `apps/web/src/app/(app)/app/event/[id]/partner-requests/page.tsx`.

- [ ] **Step 1: Create the page**

```tsx
'use client';
import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import {
  useEvent,
  useEventParticipants,
  usePartnerRequests,
  useGroupMembers,
  useRequestPartner,
  useAcceptPartnerRequest,
  useDeclinePartnerRequest,
} from '@padel/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { avatarUrl } from '@/lib/upload';

export default function PartnerRequestsPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useT('event');
  const uid = useSession().session?.user.id;
  const event = useEvent(id);
  const participants = useEventParticipants(id);
  const requests = usePartnerRequests(id);
  const groupId = event.data?.group_id ?? '';
  const members = useGroupMembers(groupId);
  const requestPartner = useRequestPartner(id);
  const acceptReq = useAcceptPartnerRequest(id);
  const declineReq = useDeclinePartnerRequest(id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    fn()
      .catch((e) => setError(t(e instanceof Error ? e.message : 'unknown_error')))
      .finally(() => setBusy(false));
  };

  const reqs = requests.data ?? [];
  const incoming = reqs.filter((r) => r.target_id === uid && r.status === 'pending');
  const outgoing = reqs.filter((r) => r.requester_id === uid && r.status === 'pending');

  const candidates = useMemo(() => {
    const confirmedIds = new Set(
      (participants.data ?? []).filter((p) => p.status === 'confirmed').map((p) => p.user_id),
    );
    const requestedIds = new Set(
      reqs.filter((r) => r.status === 'pending').flatMap((r) => [r.requester_id, r.target_id]),
    );
    return (members.data ?? []).filter(
      (m) => m.user_id !== uid && !confirmedIds.has(m.user_id) && !requestedIds.has(m.user_id),
    );
  }, [members.data, participants.data, reqs, uid]);

  if (event.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!event.data) return <div className="p-6">{t('notAvailable')}</div>;
  if (event.data.specification !== 'team') {
    return (
      <div className="flex flex-col gap-3 p-6">
        <p className="text-sm text-muted-foreground">{t('notTeamEvent')}</p>
        <Button asChild variant="outline" className="self-start">
          <Link href={`/app/event/${id}`}>{t('backToEvent')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('partnerRequestsTitle')}</h1>
        <Button asChild variant="ghost">
          <Link href={`/app/event/${id}`}>{t('backToEvent')}</Link>
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {incoming.length > 0 ? (
        <Card className="divide-y p-0">
          {incoming.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="size-9">
                  <AvatarImage src={avatarUrl(r.requester?.avatar_url) ?? undefined} />
                  <AvatarFallback>
                    {(r.requester?.full_name ?? '—').slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate text-sm">
                  {t('partnerIncoming', { name: r.requester?.full_name ?? '—' })}
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => declineReq.mutateAsync(r.id))}>
                  {t('declineCta')}
                </Button>
                <Button size="sm" disabled={busy} onClick={() => run(() => acceptReq.mutateAsync(r.id))}>
                  {t('acceptCta')}
                </Button>
              </div>
            </div>
          ))}
        </Card>
      ) : null}

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{t('choosePartnerTitle')}</h2>
        {members.isLoading || participants.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : candidates.length === 0 && outgoing.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noPartnerRequests')}</p>
        ) : (
          <Card className="divide-y p-0">
            {outgoing.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-9">
                    <AvatarImage src={avatarUrl(r.target?.avatar_url) ?? undefined} />
                    <AvatarFallback>
                      {(r.target?.full_name ?? '—').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm font-medium">{r.target?.full_name ?? '—'}</span>
                </div>
                <span className="text-xs text-muted-foreground">{t('partnerRequestPending')}</span>
              </div>
            ))}
            {candidates.map((m) => (
              <div key={m.user_id} className="flex items-center justify-between px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-9">
                    <AvatarImage src={avatarUrl(m.profiles?.avatar_url) ?? undefined} />
                    <AvatarFallback>
                      {(m.profiles?.full_name ?? '—').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm font-medium">{m.profiles?.full_name ?? '—'}</span>
                </div>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => requestPartner.mutateAsync([m.user_id]))}>
                  {t('requestPartnerCta')}
                </Button>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
```
VERIFY: `usePartnerRequests` rows expose `requester_id`, `target_id`, `status`, `requester`/`target` profile embeds (`{ full_name, avatar_url }`). `useGroupMembers(id)` rows expose `user_id` + `profiles`. `useRequestPartner(id).mutateAsync(targets: string[])` (array). All confirmed in source.

- [ ] **Step 2: Typecheck + build + commit**

Run: `pnpm --filter web typecheck && pnpm --filter web build` → PASS.
```bash
git add "apps/web/src/app/(app)/app/event/[id]/partner-requests/page.tsx"
git commit -m "feat(web): team partner-requests page (W4b)"
```

---

## Task 5: Verification

- [ ] **Step 1:** `pnpm --filter @padel/utils test` (participationState) + `pnpm --filter web typecheck && pnpm --filter web build` → all PASS.
- [ ] **Step 2 (browser, local Supabase):** Open a scheduled individual event you're not in → **Join** → CTA flips to "You're going" + **Leave**; Leave → back to Join.
- [ ] **Step 3:** Fill an event to capacity → Join shows **Join waiting list** → join → "Waiting list · #N" + **Leave waiting list**.
- [ ] **Step 4:** Receive an event invitation → inviter banner + **Accept** (become participant) / **Decline**.
- [ ] **Step 5:** Open a **team** event → **Join with a partner** → partner-requests page: request a candidate (moves to "Requested"); as the target, accept an incoming request.
- [ ] **Step 6:** As organizer → "You're organizing" badge + disabled Manage (coming soon) + **Join as player** / **Leave as player**. A within-6h event shows **Joining closed**; a within-12h event shows the leave-locked notice.

---

## Verification (summary)
vitest for the helper; per-task typecheck; build after Tasks 3–4; browser smoke (Task 5). Finish via superpowers:finishing-a-development-branch.

## Out of scope
Create/edit (W4c); manage hub (W4d); start/live/results (W4e); chat + message-organizer DM (W5); `choose_partner` direct pairing.
