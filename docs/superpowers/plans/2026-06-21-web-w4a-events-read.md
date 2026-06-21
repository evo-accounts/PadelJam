# Web W4a — Events (read) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read-only events on web — Your-Events list (All/Organizing/Going), event detail (header/details/players/result), and the community + group Events tabs — via existing `@padel/api` hooks.

**Architecture:** New `event` i18n namespace + components under `apps/web/src/components/event/`, a `/app/events` list route (replacing the placeholder), an `/app/event/[id]` detail route, and wiring two existing "coming soon" Events tabs. All data via existing read hooks; no mutations.

**Tech Stack:** Next.js 16 App Router (client), React 19, `@padel/api` (TanStack Query incl. `useInfiniteQuery`), shadcn/ui, react-i18next (`useT` = `useTranslation`).

**Verified facts (from source):**
- `useMyEvents(filter: 'all'|'organizing'|'going')` → `useInfiniteQuery`; `.data.pages` is an array of pages, each page an array of `events` rows. Returns only upcoming `scheduled` + `in_progress`, ordered `starts_at asc`. Use `data.pages.flat()`, `hasNextPage`, `fetchNextPage`, `isFetchingNextPage`, `isLoading`.
- `useEvent(id)` → `events` row + `venue:venues(name, address)` (i.e. `event.venue?.name`/`event.venue?.address`). No organizer join.
- `events` row columns used here: `id, name, status, starts_at, series_id, event_type, scoring_mode, scoring_value, entrance_fee_enabled, entrance_fee_amount, entrance_fee_method, has_location, location_text, manual_location_name, manual_location_address, venue_id, thumbnail_path, organizer_id, group_id, description`. `status ∈ {scheduled, in_progress, completed}`.
- `useEventParticipants(id)` → rows `{ id, user_id: string|null, status: string, is_standby, has_paid, guest_name: string|null, joined_at, profiles: {id, full_name, avatar_url}|null }[]`. Participant `status ∈ {confirmed, waiting_list, ...}`. Display name = `profiles?.full_name ?? guest_name ?? '—'`. **Organizer name** = `participants.find(p => p.user_id === event.organizer_id)?.profiles?.full_name`.
- `useEventTeams(id)` → `{ id, team_number, is_confirmed, player_a: P|null, player_b: P|null }[]` where `P = { id, user_id, guest_name, status, profiles: {full_name, avatar_url}|null }`. Ordered by `team_number`.
- `useEventResultSummary(id)` → `{ rank: number, name: string|null, points: number }[]` (RPC `event_result_summary`).
- `useCommunityEvents(id)` / `useGroupEvents(id)` → `events[]`. `useEventRealtime(id)` → side-effect hook.
- `event_type` enum values seen in mobile: `americano`, `mexicano`. `scoring_mode`: `classic`, `points`, `time`. `entrance_fee_method`: `cash`, `mba`.
- `avatarUrl(path)` from `@/lib/upload`. `useT` returns `{ t, i18n }`; locale = `i18n.language`. Date format precedent: `new Date(s).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })`.
- shadcn present: `tabs, card, badge, avatar, skeleton, button, separator`.

---

## Task 1: `event` i18n namespace + read components

**Files:**
- Modify: `apps/web/src/lib/i18n-web.ts` (add `webEvent` bundle + `registerWebEventCopy`), `apps/web/src/components/Providers.tsx` (call it).
- Create: `apps/web/src/components/event/EventCard.tsx`, `EventParticipantsList.tsx`, `EventResultTable.tsx`.

- [ ] **Step 1: Add the `webEvent` bundle + register fn**

In `apps/web/src/lib/i18n-web.ts`, add a `webEvent` object with `en`, `pt-PT`, `pt-BR` blocks and an exported `registerWebEventCopy(instance)` that calls `instance.addResourceBundle(locale, 'event', webEvent[locale], true, false)` for each locale (mirror the existing `registerWebGroupCopy` exactly).

English (`en`) keys/values:
```
title: 'Events', filterAll: 'All', filterOrganizing: 'Organizing', filterGoing: 'Going',
emptyEvents: 'You have no upcoming events.', loadMore: 'Load more',
notAvailable: 'This event is not available.',
statusScheduled: 'Scheduled', statusInProgress: 'In progress', statusCompleted: 'Completed',
detailsTitle: 'Details', playersTitle: 'Players', aboutTitle: 'About',
feeLabel: 'Fee', feeFree: 'Free', formatLabel: 'Format', scoringLabel: 'Scoring',
organizerLabel: 'Organizer', locationTbd: 'Location to be confirmed', recurrentTag: 'Recurring',
confirmedGroup: 'Confirmed', waitlistGroup: 'Waiting list', invitedGroup: 'Invited', teamsTitle: 'Teams',
teamLabel: 'Team {{number}}', resultTitle: 'Result', rank: '#', points: 'Points',
emptyPlayers: 'No players yet.', emptyResult: 'No result yet.', comingSoon: 'Coming soon',
actionsComingSoon: 'More actions coming soon.',
typeAmericanoLabel: 'Americano', typeMexicanoLabel: 'Mexicano',
scoringClassicLabel: 'Classic sets', scoringPointsLabel: 'Points', scoringTimeLabel: 'Time',
feeCashLabel: 'Cash', feeMbaLabel: 'MB WAY',
```
pt-PT values:
```
title: 'Eventos', filterAll: 'Todos', filterOrganizing: 'A organizar', filterGoing: 'Vou participar',
emptyEvents: 'Não tem eventos futuros.', loadMore: 'Ver mais',
notAvailable: 'Este evento não está disponível.',
statusScheduled: 'Agendado', statusInProgress: 'A decorrer', statusCompleted: 'Concluído',
detailsTitle: 'Detalhes', playersTitle: 'Jogadores', aboutTitle: 'Sobre',
feeLabel: 'Taxa', feeFree: 'Grátis', formatLabel: 'Formato', scoringLabel: 'Pontuação',
organizerLabel: 'Organizador', locationTbd: 'Local a confirmar', recurrentTag: 'Recorrente',
confirmedGroup: 'Confirmados', waitlistGroup: 'Lista de espera', invitedGroup: 'Convidados', teamsTitle: 'Equipas',
teamLabel: 'Equipa {{number}}', resultTitle: 'Resultado', rank: '#', points: 'Pontos',
emptyPlayers: 'Ainda não há jogadores.', emptyResult: 'Ainda não há resultado.', comingSoon: 'Brevemente',
actionsComingSoon: 'Mais ações brevemente.',
typeAmericanoLabel: 'Americano', typeMexicanoLabel: 'Mexicano',
scoringClassicLabel: 'Sets clássicos', scoringPointsLabel: 'Pontos', scoringTimeLabel: 'Tempo',
feeCashLabel: 'Dinheiro', feeMbaLabel: 'MB WAY',
```
pt-BR values (Brazilian variants):
```
title: 'Eventos', filterAll: 'Todos', filterOrganizing: 'Organizando', filterGoing: 'Vou participar',
emptyEvents: 'Você não tem eventos futuros.', loadMore: 'Ver mais',
notAvailable: 'Este evento não está disponível.',
statusScheduled: 'Agendado', statusInProgress: 'Em andamento', statusCompleted: 'Concluído',
detailsTitle: 'Detalhes', playersTitle: 'Jogadores', aboutTitle: 'Sobre',
feeLabel: 'Taxa', feeFree: 'Grátis', formatLabel: 'Formato', scoringLabel: 'Pontuação',
organizerLabel: 'Organizador', locationTbd: 'Local a confirmar', recurrentTag: 'Recorrente',
confirmedGroup: 'Confirmados', waitlistGroup: 'Lista de espera', invitedGroup: 'Convidados', teamsTitle: 'Times',
teamLabel: 'Time {{number}}', resultTitle: 'Resultado', rank: '#', points: 'Pontos',
emptyPlayers: 'Ainda não há jogadores.', emptyResult: 'Ainda não há resultado.', comingSoon: 'Em breve',
actionsComingSoon: 'Mais ações em breve.',
typeAmericanoLabel: 'Americano', typeMexicanoLabel: 'Mexicano',
scoringClassicLabel: 'Sets clássicos', scoringPointsLabel: 'Pontos', scoringTimeLabel: 'Tempo',
feeCashLabel: 'Dinheiro', feeMbaLabel: 'MB WAY',
```

- [ ] **Step 2: Wire `registerWebEventCopy` in Providers**

In `apps/web/src/components/Providers.tsx`: add `registerWebEventCopy` to the import from `@/lib/i18n-web`, and call `registerWebEventCopy(instance);` right after the existing `registerWebGroupCopy(instance);` line.

- [ ] **Step 3: `EventCard.tsx`**

Create `apps/web/src/components/event/EventCard.tsx`:
```tsx
'use client';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface EventCardEvent {
  id: string;
  name: string;
  starts_at: string | null;
  status: string;
  venue?: { name: string | null; address: string | null } | null;
  location_text?: string | null;
  manual_location_name?: string | null;
}

const STATUS_KEY: Record<string, string> = {
  scheduled: 'statusScheduled',
  in_progress: 'statusInProgress',
  completed: 'statusCompleted',
};

export function EventCard({ event }: { event: EventCardEvent }) {
  const { t, i18n } = useT('event');
  const when = event.starts_at
    ? new Date(event.starts_at).toLocaleString(i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;
  const where =
    event.venue?.name ?? event.manual_location_name ?? event.location_text ?? t('locationTbd');
  return (
    <Link href={`/app/event/${event.id}`} className="block">
      <Card className="overflow-hidden py-0 transition-shadow hover:shadow-md">
        <CardContent className="flex flex-col gap-1 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium">{event.name}</span>
            <Badge variant="secondary">{t(STATUS_KEY[event.status] ?? 'statusScheduled')}</Badge>
          </div>
          {when ? <span className="text-sm text-muted-foreground">{when}</span> : null}
          <span className="truncate text-sm text-muted-foreground">{where}</span>
        </CardContent>
      </Card>
    </Link>
  );
}
```

- [ ] **Step 4: `EventParticipantsList.tsx`**

Create `apps/web/src/components/event/EventParticipantsList.tsx`:
```tsx
'use client';
import { useT } from '@padel/i18n';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { avatarUrl } from '@/lib/upload';

export interface EventParticipant {
  id: string;
  user_id: string | null;
  status: string;
  guest_name: string | null;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
}
export interface EventTeamPlayer {
  guest_name: string | null;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
}
export interface EventTeam {
  id: string;
  team_number: number;
  player_a: EventTeamPlayer | null;
  player_b: EventTeamPlayer | null;
}

function nameOf(p: { guest_name: string | null; profiles: { full_name: string | null } | null } | null): string {
  return p?.profiles?.full_name ?? p?.guest_name ?? '—';
}

function Row({ p }: { p: EventTeamPlayer }) {
  const name = nameOf(p);
  return (
    <li className="flex items-center gap-3 py-2">
      <Avatar className="size-9">
        <AvatarImage src={avatarUrl(p.profiles?.avatar_url) ?? undefined} />
        <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className="truncate text-sm font-medium">{name}</span>
    </li>
  );
}

export function EventParticipantsList({
  participants,
  teams,
}: {
  participants: EventParticipant[];
  teams: EventTeam[];
}) {
  const { t } = useT('event');

  if (teams.length > 0) {
    return (
      <div className="flex flex-col gap-4">
        {teams.map((team) => (
          <div key={team.id} className="flex flex-col gap-1">
            <p className="text-sm font-medium text-muted-foreground">
              {t('teamLabel', { number: team.team_number })}
            </p>
            <ul className="flex flex-col">
              {team.player_a ? <Row p={team.player_a} /> : null}
              {team.player_b ? <Row p={team.player_b} /> : null}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  if (participants.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('emptyPlayers')}</p>;
  }

  const confirmed = participants.filter((p) => p.status === 'confirmed');
  const waiting = participants.filter((p) => p.status === 'waiting_list');
  const invited = participants.filter((p) => p.status === 'invited');

  const groups: { key: string; label: string; rows: EventParticipant[] }[] = [
    { key: 'confirmed', label: t('confirmedGroup'), rows: confirmed },
    { key: 'waiting', label: t('waitlistGroup'), rows: waiting },
    { key: 'invited', label: t('invitedGroup'), rows: invited },
  ].filter((g) => g.rows.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g.key} className="flex flex-col gap-1">
          <p className="text-sm font-medium text-muted-foreground">{g.label}</p>
          <ul className="flex flex-col">
            {g.rows.map((p) => (
              <Row key={p.id} p={p} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: `EventResultTable.tsx`**

Create `apps/web/src/components/event/EventResultTable.tsx`:
```tsx
'use client';
import { useT } from '@padel/i18n';

export interface EventResultRow {
  rank: number;
  name: string | null;
  points: number;
}

export function EventResultTable({ rows }: { rows: EventResultRow[] }) {
  const { t } = useT('event');
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('emptyResult')}</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-muted-foreground">
          <th className="w-10 py-2 font-medium">{t('rank')}</th>
          <th className="py-2 font-medium">{t('playersTitle')}</th>
          <th className="w-20 py-2 text-right font-medium">{t('points')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.rank}-${i}`} className="border-t">
            <td className="py-2">{r.rank}</td>
            <td className="truncate py-2">{r.name ?? '—'}</td>
            <td className="py-2 text-right">{r.points}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter web typecheck` → PASS.
```bash
git add apps/web/src/lib/i18n-web.ts apps/web/src/components/Providers.tsx apps/web/src/components/event
git commit -m "feat(web): event i18n + read components (W4a)"
```

---

## Task 2: Your-Events list `/app/events`

**Files:** Modify (replace) `apps/web/src/app/(app)/app/events/page.tsx`.

- [ ] **Step 1: Replace the placeholder with the list page**

```tsx
'use client';
import { useState } from 'react';
import { useT } from '@padel/i18n';
import { useMyEvents, type MyEventsFilter } from '@padel/api';
import { EventCard, type EventCardEvent } from '@/components/event/EventCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

function EventList({ filter }: { filter: MyEventsFilter }) {
  const { t } = useT('event');
  const q = useMyEvents(filter);
  if (q.isLoading) return <Skeleton className="h-24 w-full" />;
  const rows = (q.data?.pages.flat() ?? []) as EventCardEvent[];
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{t('emptyEvents')}</p>;
  return (
    <div className="flex flex-col gap-3">
      {rows.map((e) => (
        <EventCard key={e.id} event={e} />
      ))}
      {q.hasNextPage ? (
        <Button
          variant="outline"
          className="self-center"
          disabled={q.isFetchingNextPage}
          onClick={() => q.fetchNextPage()}
        >
          {t('loadMore')}
        </Button>
      ) : null}
    </div>
  );
}

export default function EventsPage() {
  const { t } = useT('event');
  const [tab, setTab] = useState<MyEventsFilter>('all');
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <Tabs value={tab} onValueChange={(v) => setTab(v as MyEventsFilter)}>
        <TabsList>
          <TabsTrigger value="all">{t('filterAll')}</TabsTrigger>
          <TabsTrigger value="organizing">{t('filterOrganizing')}</TabsTrigger>
          <TabsTrigger value="going">{t('filterGoing')}</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="pt-4">
          <EventList filter="all" />
        </TabsContent>
        <TabsContent value="organizing" className="pt-4">
          <EventList filter="organizing" />
        </TabsContent>
        <TabsContent value="going" className="pt-4">
          <EventList filter="going" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```
VERIFY: `MyEventsFilter` is exported from `@padel/api` (it is — `packages/api/src/events/queries.ts:293`). If the `EventCardEvent` cast complains, ensure the `events` row has the fields `EventCardEvent` declares (it does: `id, name, starts_at, status, venue, location_text, manual_location_name` — note `venue` is only present on `useEvent`, NOT on `my_events` rows; for the list the `venue` field will be `undefined`, which the optional prop handles. The card falls back to `location_text`/`manual_location_name`/TBD).

- [ ] **Step 2: Typecheck + build + commit**

Run: `pnpm --filter web typecheck && pnpm --filter web build` → PASS.
```bash
git add "apps/web/src/app/(app)/app/events/page.tsx"
git commit -m "feat(web): your-events list with All/Organizing/Going (W4a)"
```

---

## Task 3: Event detail `/app/event/[id]`

**Files:** Create `apps/web/src/app/(app)/app/event/[id]/page.tsx`.

- [ ] **Step 1: Create the detail page**

```tsx
'use client';
import { useParams } from 'next/navigation';
import { useT } from '@padel/i18n';
import {
  useEvent,
  useEventParticipants,
  useEventTeams,
  useEventResultSummary,
  useEventRealtime,
} from '@padel/api';
import {
  EventParticipantsList,
  type EventParticipant,
  type EventTeam,
} from '@/components/event/EventParticipantsList';
import { EventResultTable, type EventResultRow } from '@/components/event/EventResultTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

const STATUS_KEY: Record<string, string> = {
  scheduled: 'statusScheduled',
  in_progress: 'statusInProgress',
  completed: 'statusCompleted',
};
const cap = (s: string | null | undefined) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useT('event');
  useEventRealtime(id);
  const event = useEvent(id);
  const participants = useEventParticipants(id);
  const teams = useEventTeams(id);
  const result = useEventResultSummary(id);

  if (event.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!event.data) return <div className="p-6">{t('notAvailable')}</div>;

  const e = event.data;
  const parts = (participants.data ?? []) as unknown as EventParticipant[];
  const teamRows = (teams.data ?? []) as unknown as EventTeam[];

  const when = e.starts_at
    ? new Date(e.starts_at).toLocaleString(i18n.language, {
        dateStyle: 'full',
        timeStyle: 'short',
      })
    : null;
  const where =
    e.venue?.name ??
    (e.has_location ? e.manual_location_name : null) ??
    e.location_text ??
    t('locationTbd');
  const venueAddress = e.venue?.address ?? (e.has_location ? e.manual_location_address : null);
  const organizerName =
    parts.find((p) => p.user_id === e.organizer_id)?.profiles?.full_name ?? null;

  const formatText = e.event_type ? t(`type${cap(e.event_type)}Label`) : null;
  const scoringText = e.scoring_mode
    ? e.scoring_mode === 'classic'
      ? t(`scoring${cap(e.scoring_mode)}Label`)
      : `${t(`scoring${cap(e.scoring_mode)}Label`)} · ${e.scoring_value ?? ''}`
    : null;
  const feeText = e.entrance_fee_enabled
    ? e.entrance_fee_method != null
      ? `${e.entrance_fee_amount ?? 0} · ${t(`fee${cap(e.entrance_fee_method)}Label`)}`
      : `${e.entrance_fee_amount ?? 0}`
    : t('feeFree');

  const details: { label: string; value: string }[] = [];
  if (formatText) details.push({ label: t('formatLabel'), value: formatText });
  if (scoringText) details.push({ label: t('scoringLabel'), value: scoringText });
  details.push({ label: t('feeLabel'), value: feeText });
  if (organizerName) details.push({ label: t('organizerLabel'), value: organizerName });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{e.name}</h1>
          <Badge variant="secondary">{t(STATUS_KEY[e.status] ?? 'statusScheduled')}</Badge>
          {e.series_id ? <Badge variant="outline">{t('recurrentTag')}</Badge> : null}
        </div>
        {when ? <p className="text-sm text-muted-foreground">{when}</p> : null}
        <div className="text-sm text-muted-foreground">
          <p>{where}</p>
          {venueAddress ? <p>{venueAddress}</p> : null}
        </div>
        {e.description ? <p className="pt-2 text-sm">{e.description}</p> : null}
      </div>

      <div>
        <Button disabled className="w-full sm:w-auto">
          {t('comingSoon')}
        </Button>
        <p className="pt-2 text-xs text-muted-foreground">{t('actionsComingSoon')}</p>
      </div>

      <Separator />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('detailsTitle')}</h2>
        <dl className="flex flex-col gap-2">
          {details.map((d) => (
            <div key={d.label} className="flex justify-between gap-4 text-sm">
              <dt className="text-muted-foreground">{d.label}</dt>
              <dd className="text-right font-medium">{d.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Separator />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('playersTitle')}</h2>
        {participants.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <EventParticipantsList participants={parts} teams={teamRows} />
        )}
      </section>

      {e.status === 'completed' ? (
        <>
          <Separator />
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t('resultTitle')}</h2>
            {result.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <EventResultTable rows={(result.data ?? []) as EventResultRow[]} />
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
```
NOTE on the `as unknown as` casts: the `useEventParticipants` / `useEventTeams` hooks return rows typed via `.returns<>()`; the component interfaces (`EventParticipant`/`EventTeam`) intentionally declare only the subset of fields used. If the hook's exported row type is directly assignable, drop the cast. If typecheck complains about extra/cast, keep the `as unknown as` bridge (it's confined to this page). Confirm the actual returned field names (`user_id`, `status`, `guest_name`, `profiles`, `team_number`, `player_a`, `player_b`) match — they do per the hook source.

- [ ] **Step 2: Typecheck + build + commit**

Run: `pnpm --filter web typecheck && pnpm --filter web build` → PASS.
```bash
git add "apps/web/src/app/(app)/app/event/[id]/page.tsx"
git commit -m "feat(web): event detail (header/details/players/result) read-only (W4a)"
```

---

## Task 4: Community + group Events tabs

**Files:** Modify `apps/web/src/app/(app)/app/community/[id]/page.tsx` and `apps/web/src/app/(app)/app/group/[id]/page.tsx`.

- [ ] **Step 1: Community Events tab**

In `apps/web/src/app/(app)/app/community/[id]/page.tsx`:
1. Add `useCommunityEvents` to the `@padel/api` import.
2. Add `const events = useCommunityEvents(id);` with the other hooks (before any early return).
3. Import `EventCard` (`import { EventCard, type EventCardEvent } from '@/components/event/EventCard';`).
4. Replace the `events` `TabsContent` body (currently `<p ...>{t('comingSoon')}</p>`) with:
```tsx
<TabsContent value="events" className="flex flex-col gap-3 pt-4">
  {events.isLoading ? (
    <Skeleton className="h-24 w-full" />
  ) : (events.data ?? []).length === 0 ? (
    <p className="text-center text-sm text-muted-foreground">{t('comingSoon')}</p>
  ) : (
    (events.data ?? []).map((ev) => (
      <EventCard key={ev.id} event={ev as unknown as EventCardEvent} />
    ))
  )}
</TabsContent>
```
(`t` here is the `community` namespace; `comingSoon` exists there. `EventCard` uses its own `event` namespace internally, so no extra translator needed.)

- [ ] **Step 2: Group Events tab**

In `apps/web/src/app/(app)/app/group/[id]/page.tsx`:
1. Add `useGroupEvents` to the `@padel/api` import.
2. Add `const events = useGroupEvents(id);` with the other hooks (before early returns).
3. Import `EventCard` + type.
4. Replace the `events` `TabsContent` body (currently the `comingSoon` paragraph) with the same loading/empty/list pattern as Step 1 (using `events` from `useGroupEvents`). The group page's `t` is the `group` namespace, which has `comingSoon`.

- [ ] **Step 3: Typecheck + build + commit**

Run: `pnpm --filter web typecheck && pnpm --filter web build` → PASS.
```bash
git add "apps/web/src/app/(app)/app/community/[id]/page.tsx" "apps/web/src/app/(app)/app/group/[id]/page.tsx"
git commit -m "feat(web): community + group Events tabs read list (W4a)"
```

---

## Task 5: End-to-end verification (browser)

No code. `pnpm --filter web dev` against local Supabase; browser.

- [ ] **Step 1:** `pnpm --filter web typecheck && pnpm --filter web build` → PASS.
- [ ] **Step 2:** `/app/events` lists your upcoming events; All/Organizing/Going tabs filter; if >1 page, **Load more** appends.
- [ ] **Step 3:** Open an event → header (name, status badge, date, location, recurring tag if applicable) + Details (format/scoring/fee/organizer) + Players (grouped by status, or teams if the event has teams) render. The disabled CTA + "more actions coming soon" note shows.
- [ ] **Step 4:** A **completed** event shows the Result leaderboard. An `in_progress` event shows its status badge.
- [ ] **Step 5:** Community detail **Events** tab and a group detail **Events** tab each list events → opening one lands on `/app/event/[id]`.

---

## Verification (summary)
Per-task typecheck; build after Tasks 2–4; browser smoke (Task 5). Finish via superpowers:finishing-a-development-branch.

## Out of scope
All event actions (W4b); create/edit wizard (W4c); manage hub (W4d); live match + detailed standings (W4e); event chat (W5).
