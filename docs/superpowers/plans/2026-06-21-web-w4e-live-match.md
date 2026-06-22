# Web W4e — In-progress match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The live match engine on web at `/app/event/[id]/live` — start (incl. team setup), live scoring, leaderboard, timer, finish + publish — wiring the event-detail CTA to it.

**Architecture:** Pure match-view helpers in `@padel/utils` (vitest). One client route `/app/event/[id]/live` owns the status state machine (`scheduled` pre-start → `in_progress` tabs → `completed`), composed from focused components under `apps/web/src/components/event/live/`. All data/mutations via existing `@padel/api` hooks.

**Tech Stack:** Next.js 16 App Router (client), React 19, `@padel/api`, `@padel/utils` (vitest), shadcn/ui, react-i18next.

**Verified facts (from source):**
- `useStartEvent(id).mutate({ eventType, confirmedParticipantIds: string[], numCourts })` — americano schedule computed inside the hook; mexicano/up_and_down seeded server-side.
- `useSubmitScore(id).mutate({ matchId, sideA, sideB, notPlayed? })`; `useGenerateNextRound(id).mutate()`; `useFinishEvent(id).mutate({ countsOverride?, finishMessage? })`; `useSetEventTimer(id).mutate('start'|'pause'|'resume'|'reset')`; `useSetEventRanking(id).mutate(enabled)`; `usePostEventResult(id).mutate(communityId)`; `useAssignToTeam(id).mutate({ participantId, teamNumber, slot: 'a'|'b', targetName? })`; `useRemoveFromTeam(id).mutate({ participantId, targetName? })`; `useSwitchPlayers(id).mutate({ participantA, participantB })`. All throw `Error(mappedKey)`.
- `useEventRounds(id)` → `event_rounds` rows `{ id, event_id, round_number, status, rests, ... }` ordered `round_number` asc (`rests` is jsonb — an array of participant ids).
- `useEventMatches(id)` → rows `{ id, round_id, court_number, match_number, side_a_score, side_b_score, status, match_players: { side: string, participant_id, event_participants: { id, user_id, guest_name, profiles: {full_name, avatar_url}|null }|null }[] }`. **match status ∈ `'pending' | 'played' | 'not_played'`** (a round/all is "scored" when every match `status !== 'pending'`).
- `useEventStandings(id)` → `{ entity_id, is_team, points, wins, draws, losses, rank }[]`.
- `useEventTimer(id)` → `{ duration_seconds, started_at, paused_at, status: 'idle'|'running'|'paused' } | null`.
- `useEventParticipants(id)` rows include `{ id, user_id, status, is_standby, guest_name, profiles }`; `useEventTeams(id)` rows `{ id, team_number, is_confirmed, player_a, player_b }` (players = `{ id, user_id, guest_name, status, profiles:{full_name,avatar_url}|null }|null`).
- events row: `status ('scheduled'|'in_progress'|'completed')`, `event_type`, `specification`, `num_courts`, `players_submit_results`, `counts_for_ranking`, `finish_message`, `organizer_id`, `community_id?`/`group_id`.
- shadcn present: `tabs, dialog, alert-dialog, card, input, switch, textarea, button, badge, avatar, skeleton, select`. `avatarUrl` from `@/lib/upload`. `useSession` from `@padel/auth`.
- Mobile reference: `apps/mobile/app/event/[id]/live.tsx`, `apps/mobile/components/event/TeamManage.tsx`, `apps/mobile/lib/i18n-mobile.ts` (event bundle, 3 locales).

---

## Task 1: `match-view` pure helpers + vitest

**Files:** Create `packages/utils/src/match-view.ts`, `packages/utils/src/match-view.test.ts`; modify `packages/utils/src/index.ts`.

- [ ] **Step 1: `match-view.ts`** (primitives only — no `@padel/api`):
```ts
export interface MatchStatusLike { status: string }

/** A round (or the whole event) is scored when every match is no longer pending. */
export function allScored(matches: MatchStatusLike[]): boolean {
  return matches.length > 0 && matches.every((m) => m.status !== 'pending');
}

/** Can the organizer start? Individual events need numCourts*4 confirmed players;
 *  team events need numCourts*2 confirmed teams. */
export function setupComplete(input: {
  specification: string;
  confirmedCount: number;
  confirmedTeamCount: number;
  numCourts: number;
}): boolean {
  if (input.specification === 'team') {
    return input.confirmedTeamCount >= input.numCourts * 2;
  }
  return input.confirmedCount >= input.numCourts * 4;
}

/** Resolve a standings row's display name. */
export function standingsName(
  row: { entity_id: string; is_team: boolean },
  participantNameById: Record<string, string>,
  teamNumberById: Record<string, number>,
  teamLabel: (n: number) => string,
): string {
  if (row.is_team) return teamLabel(teamNumberById[row.entity_id] ?? 0);
  return participantNameById[row.entity_id] ?? '—';
}
```

- [ ] **Step 2: `match-view.test.ts`**:
```ts
import { describe, it, expect } from 'vitest';
import { allScored, setupComplete, standingsName } from './match-view';

describe('allScored', () => {
  it('false when empty or any pending', () => {
    expect(allScored([])).toBe(false);
    expect(allScored([{ status: 'played' }, { status: 'pending' }])).toBe(false);
  });
  it('true when all played/not_played', () => {
    expect(allScored([{ status: 'played' }, { status: 'not_played' }])).toBe(true);
  });
});

describe('setupComplete', () => {
  it('individual needs numCourts*4 confirmed', () => {
    expect(setupComplete({ specification: 'classic', confirmedCount: 7, confirmedTeamCount: 0, numCourts: 2 })).toBe(false);
    expect(setupComplete({ specification: 'classic', confirmedCount: 8, confirmedTeamCount: 0, numCourts: 2 })).toBe(true);
  });
  it('team needs numCourts*2 confirmed teams', () => {
    expect(setupComplete({ specification: 'team', confirmedCount: 99, confirmedTeamCount: 3, numCourts: 2 })).toBe(false);
    expect(setupComplete({ specification: 'team', confirmedCount: 0, confirmedTeamCount: 4, numCourts: 2 })).toBe(true);
  });
});

describe('standingsName', () => {
  const tl = (n: number) => `Team ${n}`;
  it('resolves participant + team names', () => {
    expect(standingsName({ entity_id: 'p1', is_team: false }, { p1: 'Ana' }, {}, tl)).toBe('Ana');
    expect(standingsName({ entity_id: 't1', is_team: true }, {}, { t1: 3 }, tl)).toBe('Team 3');
    expect(standingsName({ entity_id: 'x', is_team: false }, {}, {}, tl)).toBe('—');
  });
});
```

- [ ] **Step 3:** Add `export * from './match-view';` to `packages/utils/src/index.ts`.
- [ ] **Step 4:** `pnpm --filter @padel/utils test` (all pass) + `pnpm --filter @padel/utils typecheck`. Commit:
```bash
git add packages/utils/src/match-view.ts packages/utils/src/match-view.test.ts packages/utils/src/index.ts
git commit -m "feat(utils): match-view helpers (allScored/setupComplete/standingsName) (W4e)"
```

---

## Task 2: `event` i18n — live/match/timer/finish/team keys

**Files:** Modify `apps/web/src/lib/i18n-web.ts` (the `webEvent` bundle, all three locales).

- [ ] **Step 1:** Add the keys below to each locale block that are NOT already present (typecheck catches dupes). Lift each locale's value from the mobile `event` bundle (`apps/mobile/lib/i18n-mobile.ts`) where present; web-only keys use the English fallback + natural pt.

Lift from mobile: `liveTitle, waitingToStart, matchesTab, leaderboardTab, timerTab, sideALabel, sideBLabel, vsLabel, tapToScore, enterScoreTitle, saveScoreCta, notPlayedToggle, notPlayedBadge, matchPending, noMatches, restingTitle, addRoundCta, standingsEmpty, rankCol, playerCol, pointsCol, recordCol, finishCta, finishConfirmTitle, finishConfirmBody, finishEarlyTitle, finishEarlyBody, finishMessageLabel, finishMessageTitle, finishMessagePlaceholder, rankingToggleLabel, rankingIncludeCta, rankingExcludeCta, shareResultsCta, completedTitle, yourMatchLabel, startCta` (note `teamLabel` already exists from W4a). Team-setup keys (from `TeamManage`/mobile): `assignTitle, assignNoneEligible, teamSlotEmpty, removeFromTeamCta, switchPlayerCta, teamUnpaired, slotActionTitle, continue`.
Web-only fallbacks (en; translate pt): `timerStart:'Start', timerPause:'Pause', timerResume:'Resume', timerReset:'Reset', generateRoundCta:'Generate next round', roundLabel:'Round {{n}}', courtLabel:'Court {{n}}', readyToStart:'{{confirmed}} of {{needed}} players confirmed', wDL:'{{w}}-{{d}}-{{l}}', backToEvent:'Back to event'`. Reuse existing `cancel`, `forbidden`, `unknown_error`, `notAvailable`, `teamLabel`.

- [ ] **Step 2:** `pnpm --filter web typecheck` → PASS. Commit:
```bash
git add apps/web/src/lib/i18n-web.ts
git commit -m "feat(web): live match i18n (W4e)"
```

---

## Task 3: `/live` shell + status routing + individual-event start

**Files:** Create `apps/web/src/app/(app)/app/event/[id]/live/page.tsx`.

- [ ] **Step 1:** The page loads all the live hooks (before early returns), derives permissions + counts, and routes by status. For this task, render: `scheduled` (non-organizer → waiting; organizer individual → readiness + Start; organizer team → a "team setup" placeholder, real UI in Task 4), `in_progress` → a tab placeholder (Tasks 5-6), `completed` → a placeholder (Task 7). Full page scaffold:
```tsx
'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import {
  useEvent, useEventParticipants, useEventTeams, useEventRounds, useEventMatches,
  useEventStandings, useEventTimer, useEventRealtime, useStartEvent,
} from '@padel/api';
import { setupComplete } from '@padel/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function EventLivePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useT('event');
  const uid = useSession().session?.user.id;
  useEventRealtime(id);
  const event = useEvent(id);
  const participants = useEventParticipants(id);
  const teams = useEventTeams(id);
  const rounds = useEventRounds(id);
  const matches = useEventMatches(id);
  const standings = useEventStandings(id);
  const timer = useEventTimer(id);
  const start = useStartEvent(id);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'matches' | 'leaderboard' | 'timer'>('matches');

  if (event.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!event.data) return <div className="p-6">{t('notAvailable')}</div>;

  const e = event.data;
  const parts = participants.data ?? [];
  const isOrganizer = uid != null && e.organizer_id === uid;
  const isParticipant = parts.some((p) => p.user_id === uid);
  const canScore = isOrganizer || (e.players_submit_results && isParticipant);
  const confirmed = parts.filter((p) => p.status === 'confirmed');
  const confirmedTeamCount = (teams.data ?? []).filter((tm) => tm.is_confirmed).length;
  const ready = setupComplete({
    specification: e.specification,
    confirmedCount: confirmed.length,
    confirmedTeamCount,
    numCourts: e.num_courts,
  });

  const onStart = () => {
    setErr(null);
    start
      .mutateAsync({
        eventType: e.event_type,
        confirmedParticipantIds: confirmed.map((p) => p.id),
        numCourts: e.num_courts,
      })
      .catch((x) => setErr(t(x instanceof Error ? x.message : 'unknown_error')));
  };

  const backLink = (
    <Button asChild variant="ghost" className="self-start">
      <Link href={`/app/event/${id}`}>{t('backToEvent')}</Link>
    </Button>
  );

  // --- scheduled ---
  if (e.status === 'scheduled') {
    if (!isOrganizer) {
      return (
        <div className="flex flex-col gap-4 p-6">
          {backLink}
          <p className="text-sm text-muted-foreground">{t('waitingToStart')}</p>
        </div>
      );
    }
    if (e.specification === 'team') {
      return (
        <div className="flex flex-col gap-4 p-6">
          {backLink}
          {/* Task 4 renders <TeamSetup eventId={id} numCourts={e.num_courts} canStart={ready} onStart={onStart} /> */}
          <p className="text-sm text-muted-foreground">{t('assignTitle')}</p>
          {err ? <p className="text-sm text-destructive">{err}</p> : null}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-4 p-6">
        {backLink}
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-6">
            <p className="text-sm text-muted-foreground">
              {t('readyToStart', { confirmed: confirmed.length, needed: e.num_courts * 4 })}
            </p>
            <Button disabled={!ready || start.isPending} onClick={onStart}>
              {t('startCta')}
            </Button>
            {err ? <p className="text-sm text-destructive">{err}</p> : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- in_progress / completed (Tasks 5-7 fill these) ---
  return (
    <div className="flex flex-col gap-4 p-6">
      {backLink}
      <h1 className="text-xl font-semibold">
        {e.status === 'completed' ? t('completedTitle') : t('liveTitle')}
      </h1>
      {/* Task 5-6: tabs (matches/leaderboard/timer); Task 7: finish + completed view */}
    </div>
  );
}
```
Note: keep `rounds`/`matches`/`standings`/`timer`/`tab`/`canScore` even if unused in this task — Tasks 5-7 consume them. If `noUnusedLocals` flags any, prefix with a `void` reference or add an eslint-safe usage; simplest is to land Tasks 5-6 together — but to keep this task self-contained, reference them in a hidden `data-*`-style no-op or temporarily omit the truly-unused ones and re-add in Task 5. Prefer: omit `rounds/matches/standings/timer/tab/setTab/canScore` here and add them in Task 5 (declare only what this task uses: event/participants/teams/start). Adjust the imports accordingly.

- [ ] **Step 2:** `pnpm --filter web typecheck && pnpm --filter web build` → PASS. Commit:
```bash
git add "apps/web/src/app/(app)/app/event/[id]/live/page.tsx"
git commit -m "feat(web): live route shell + individual-event start (W4e)"
```

---

## Task 4: Team setup (team-event pre-start)

**Files:** Create `apps/web/src/components/event/live/TeamSetup.tsx`; modify the live page (render it in the team branch).

- [ ] **Step 1: `TeamSetup.tsx`** — props `{ eventId: string; numCourts: number; canStart: boolean; starting: boolean; onStart: () => void }`. Loads `useEventTeams(eventId)` + `useEventParticipants(eventId)` + the mutations `useAssignToTeam`, `useRemoveFromTeam`, `useSwitchPlayers`. Render the team grid: for each team `{ team_number, player_a, player_b }`, two slots. Empty slot → a button opening a `Dialog`/`Select` of **eligible** participants (confirmed, not already assigned to any team's a/b) → `assign.mutate({ participantId, teamNumber: team_number, slot, targetName })`. Filled slot → name + a remove button (`removeFromTeam.mutate({ participantId, targetName })`). (Switch-players can be a follow-up affordance: a "switch" action picking two assigned players → `switchPlayers.mutate({ participantA, participantB })`; include if straightforward, else a `teamUnpaired` hint is acceptable.) Below: a **Start** `Button` (`startCta`) disabled unless `canStart`/`starting`, calling `onStart`. Map errors inline.
  - Eligibility: build a `Set` of assigned participant ids from all teams' `player_a?.id`/`player_b?.id`; eligible = confirmed participants whose `id` ∉ that set.
- [ ] **Step 2:** In the live page team branch, replace the placeholder with `<TeamSetup eventId={id} numCourts={e.num_courts} canStart={ready} starting={start.isPending} onStart={onStart} />`.
- [ ] **Step 3:** `pnpm --filter web typecheck && pnpm --filter web build` → PASS. Commit:
```bash
git add apps/web/src/components/event/live "apps/web/src/app/(app)/app/event/[id]/live/page.tsx"
git commit -m "feat(web): team setup (assign/remove/switch) + team start gate (W4e)"
```

---

## Task 5: Matches tab — MatchCard + ScoreDialog + RoundSelector + generate round

**Files:** Create `apps/web/src/components/event/live/{MatchCard,ScoreDialog,RoundSelector,MatchesTab}.tsx`; modify the live page (render the tabs scaffold + Matches tab for `in_progress`).

- [ ] **Step 1: helpers in MatchesTab** — given `matches` (for the event) + `rounds`: `selectedRoundId` state (default the latest round id); `roundMatches` = matches with `round_id === selectedRoundId` sorted by `court_number`; `latestRound` = last of `rounds`; `latestComplete` = `allScored(matches.filter(m => m.round_id === latestRound.id))` (from `@padel/utils`); resting names from `latestRound.rests` resolved via a participant-name map.
- [ ] **Step 2: `MatchCard.tsx`** — props `{ match, onScore }`. Show Side A players vs Side B players (names from `match.match_players` filtered by `side==='a'`/`'b'`, name = `event_participants.profiles?.full_name ?? event_participants.guest_name ?? '—'`), the score (`side_a_score`–`side_b_score`) or `tapToScore`/`notPlayedBadge`/`matchPending` per `status`. Clickable (calls `onScore(match)`) only when an `canScore` prop is true.
- [ ] **Step 3: `ScoreDialog.tsx`** — a shadcn `Dialog`. Props `{ match, open, onOpenChange, onSubmit }`. Numeric Side A / Side B `Input`s (default from existing scores; min 0) + a **not played** `Switch` (`notPlayedToggle`). Save (`saveScoreCta`) → `onSubmit({ sideA, sideB, notPlayed })`. The MatchesTab wires this to `useSubmitScore(id).mutate({ matchId, sideA, sideB, notPlayed })`.
- [ ] **Step 4: `RoundSelector.tsx`** — props `{ rounds, selectedId, onSelect }`. A row of round buttons (`roundLabel` with `round_number`), highlighting the selected.
- [ ] **Step 5: `MatchesTab.tsx`** — composes RoundSelector + the round's MatchCards grouped by court (`courtLabel`) + the resting list (`restingTitle`) + (organizer only) a **Generate next round** `Button` (`generateRoundCta`, `useGenerateNextRound(id)`) enabled when `latestComplete`. Manages the ScoreDialog open state + submit (`useSubmitScore`). Empty → `noMatches`.
- [ ] **Step 6:** In the live page, for `in_progress` (and `completed`), render a shadcn `Tabs` (`matchesTab`/`leaderboardTab`/`timerTab`) and put `<MatchesTab .../>` in the matches tab. Re-add the `rounds/matches/canScore` hooks/derivations to the page (from Task 3's note) and pass what MatchesTab needs (or have MatchesTab load its own hooks given `eventId` + `canScore` + `isOrganizer`). Prefer: `MatchesTab` takes `{ eventId, canScore, isOrganizer }` and loads `useEventRounds`/`useEventMatches`/`useEventParticipants` itself.
- [ ] **Step 7:** `pnpm --filter web typecheck && pnpm --filter web build` → PASS. Commit:
```bash
git add apps/web/src/components/event/live "apps/web/src/app/(app)/app/event/[id]/live/page.tsx"
git commit -m "feat(web): live matches tab + scoring + generate round (W4e)"
```

---

## Task 6: Leaderboard + Timer tabs

**Files:** Create `apps/web/src/components/event/live/{Leaderboard,MatchTimer}.tsx`; modify the live page (wire the two tabs).

- [ ] **Step 1: `Leaderboard.tsx`** — props `{ eventId }`. Loads `useEventStandings`, `useEventParticipants`, `useEventTeams`. Build `participantNameById` (`{ [p.id]: p.profiles?.full_name ?? p.guest_name ?? '—' }`) and `teamNumberById` (`{ [tm.id]: tm.team_number }`). A table: rank / name (`standingsName(row, participantNameById, teamNumberById, n => t('teamLabel', { n }))` from `@padel/utils`) / points / record (`wDL` with wins-draws-losses). Empty → `standingsEmpty`.
- [ ] **Step 2: `MatchTimer.tsx`** — props `{ eventId, isOrganizer }`. Loads `useEventTimer(eventId)` + `useSetEventTimer(eventId)`. Compute the displayed seconds: if `status==='running'` and `started_at`, elapsed = now − started_at (tick every 1s via `useEffect`+`setInterval`+`useState`); remaining = `duration_seconds − elapsed` (clamp ≥ 0); if `paused`, use `paused_at`. Render mm:ss. Organizer controls: Start/Pause/Resume/Reset buttons (`timerStart/Pause/Resume/Reset`) calling `setTimer.mutate(action)`, shown per `status` (idle→Start; running→Pause+Reset; paused→Resume+Reset). Use `useState(() => Date.now())`-style or a ticking `now` state; avoid `Date.now()` in render without a tick.
- [ ] **Step 3:** Wire both into the live page's Tabs (`leaderboard` → `<Leaderboard eventId={id} />`, `timer` → `<MatchTimer eventId={id} isOrganizer={isOrganizer} />`).
- [ ] **Step 4:** `pnpm --filter web typecheck && pnpm --filter web build` → PASS. Commit:
```bash
git add apps/web/src/components/event/live "apps/web/src/app/(app)/app/event/[id]/live/page.tsx"
git commit -m "feat(web): live leaderboard + timer tabs (W4e)"
```

---

## Task 7: Finish flow + completed view + share + wire EventCTA

**Files:** Create `apps/web/src/components/event/live/FinishDialog.tsx`; modify the live page + `apps/web/src/components/event/EventCTA.tsx`.

- [ ] **Step 1: `FinishDialog.tsx`** — props `{ eventId, allScored, countsForRanking }`. A `Dialog` triggered by a **Finish** button (`finishCta`). Title/body = `allScored ? finishConfirmTitle/Body : finishEarlyTitle/Body`. A finish-message `Textarea` (`finishMessageLabel`, placeholder `finishMessagePlaceholder`). A ranking include/exclude `Switch` (seeded from `countsForRanking`; on toggle `useSetEventRanking(eventId).mutate(enabled)`). Confirm → `useFinishEvent(eventId).mutate({ countsOverride: <ranking enabled state>, finishMessage })`. Map errors inline.
- [ ] **Step 2: live page — in_progress** shows the FinishDialog trigger (organizer only) above/below the tabs, passing `allScored(matches.data ?? [])` and `e.counts_for_ranking`.
- [ ] **Step 3: live page — completed** view: the `<Leaderboard eventId={id} />` (final standings) + the `e.finish_message` (if set) + an organizer **Share results** `Button` (`shareResultsCta`) → `usePostEventResult(id).mutate(e.community_id ?? '')` (pass the event's community id; the RPC only needs the event — the arg is for cache invalidation). Surface success/error inline.
- [ ] **Step 4: wire EventCTA** (`apps/web/src/components/event/EventCTA.tsx`): the `status !== 'scheduled'` branch — replace the disabled button with a `Link` to `/app/event/${event.id}/live` (label `viewResultsCta` when completed else `viewMatchesCta`). In the organizer `scheduled` branch, add a **Start / set up** `Link` to `/app/event/${event.id}/live` (e.g. a primary button before the Manage link). Keep join/leave-as-player.
- [ ] **Step 5:** `pnpm --filter web typecheck && pnpm --filter web build` → PASS. Commit:
```bash
git add apps/web/src/components/event/live apps/web/src/components/event/EventCTA.tsx "apps/web/src/app/(app)/app/event/[id]/live/page.tsx"
git commit -m "feat(web): finish flow + completed view + share + live CTA wiring (W4e)"
```

---

## Task 8: Verification

- [ ] **Step 1:** `pnpm --filter @padel/utils test` (match-view) + `pnpm --filter web typecheck && pnpm --filter web build` → all PASS.
- [ ] **Step 2 (browser, as organizer):** an individual event with ≥ `numCourts*4` confirmed → `/live` → **Start** → Matches render (round 1, grouped by court, resting list).
- [ ] **Step 3:** Tap a match → ScoreDialog → enter a score (and try "not played") → save → Leaderboard tab reflects it; **Generate next round** appears once the round is fully scored → adds a round.
- [ ] **Step 4:** Timer tab → Start/Pause/Resume/Reset. **Finish** → dialog (finish-early warning if unscored; message + ranking toggle) → `completed` shows final standings + finish message; **Share results** posts to the feed.
- [ ] **Step 5:** A **team** event → team setup (assign players to slots, remove/switch) → Start gated until enough teams → Start → score.
- [ ] **Step 6:** A non-organizer sees the waiting notice (scheduled) and read-only matches/leaderboard (in_progress). EventCTA links route to `/live` for view + organizer start.

---

## Verification (summary)
vitest for match-view; per-task typecheck; build after Tasks 3-7; browser smoke (Task 8). Finish via superpowers:finishing-a-development-branch.

## Out of scope
Editing a completed match's score post-finish; spectator animations; event chat (W5).
