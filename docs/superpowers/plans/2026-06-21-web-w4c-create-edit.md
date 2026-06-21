# Web W4c — Create + Edit event wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A full-parity multi-step create-event wizard (`/app/community/[id]/event-create`) + an edit form (`/app/event/[id]/edit`) on web, reusing `createEventSchema`/`updateEventSchema` from `@padel/api`.

**Architecture:** Pure draft logic (`WizardDraft` type, `defaultDraft`, per-step `stepIsValid`, `draftToCreateInput` builder) lives in `@padel/utils` (tested with vitest; uses primitives so it stays free of an `@padel/api` dependency). The web wizard (`apps/web/src/components/event/wizard/`) renders a desktop stepper over a single draft state; the create page owns the state + submit; the edit page reuses the field sub-components in a single form. Enums + schemas come from `@padel/api`.

**Tech Stack:** Next.js 16 App Router (client), React 19, `@padel/api`, `@padel/utils` (vitest), shadcn/ui, react-i18next.

**Verified facts (from source):**
- `@padel/utils` does NOT depend on `@padel/api` — keep the pure module on primitives; validate enums at submit via `createEventSchema`.
- Enums (from `@padel/api`): `EVENT_TYPES=['americano','mexicano','up_and_down']`, `SPECIFICATIONS=['classic','mixed','team']`, `SCORING_MODES=['points','time','classic']`, `ORGANIZER_ROLES=['organizing_only','organizing_and_playing']`, `ENTRANCE_FEE_METHODS=['cash','at_club','mba']`.
- `createEventSchema` fields (camelCase): `groupId(uuid|null), eventType, specification, scoringMode, scoringValue(int|null), manualLocationName?, manualLocationAddress?, venueId?(uuid), locationLat?, locationLng?, hasLocation(bool), numCourts(int≥1), startsAt(datetime ISO), durationMinutes(int>0), allowStandby(bool), standbySpots?(int), isPrivate(bool), entranceFee{enabled,amount?,method?,mbaNumber?}, playersSubmitResults(bool), organizerRole, name(1..80), description?(≤500), thumbnailPath?, series?{dayOfWeek 1-7,startTime "HH:MM",durationMinutes,inviteLeadDays 3|5|7}, invitees?[{invitee_id?,name?,email?,phone?}], courtIds?[uuid]`. Refines: standalone⇒private (`standalone_must_be_private`), fee.enabled⇒amount+method (`fee_requires_amount_and_method`), name (`name_required`).
- `updateEventSchema` = the same minus `groupId/eventType/specification/series/invitees/courtIds` (edit subset: name, description, thumbnailPath, startsAt, durationMinutes, scoringMode, scoringValue, allowStandby, standbySpots, isPrivate, entranceFee, playersSubmitResults, organizerRole, manualLocation*, venueId, locationLat/Lng, hasLocation, numCourts).
- `useCreateEvent().mutateAsync(input: CreateEventInput)` → new event uuid. `useUpdateEvent(id).mutate({ values: UpdateEventInput, groupId: string|null })`. `useCanCreateEvent(groupId)` → boolean query. `useCommunityGroups(id)`, `useGroupMembers(id)`, `useSearchVenues(query)` (enabled when query non-empty; rows from `search_venues`). `useEvent(id)` → events row (+ venue). `useSession` (uid). `uploadCommunityImage(file, id, bucket)` — bucket union currently `'community-thumbnails'|'community-covers'`.
- shadcn present: `input, textarea, switch, select, label, button, card, skeleton`. NO `radio-group` — use a local `SelectableCard` button group for single-choice enums.
- Mobile reference for step components + i18n: `apps/mobile/components/event/wizard/` and `apps/mobile/lib/i18n-mobile.ts` (event bundle, all 3 locales).

---

## Task 1: pure wizard logic in `@padel/utils` + extend upload bucket

**Files:**
- Create: `packages/utils/src/event-wizard.ts`, `packages/utils/src/event-wizard.test.ts`
- Modify: `packages/utils/src/index.ts`
- Modify: `apps/web/src/lib/upload.ts` (bucket union)

- [ ] **Step 1: `event-wizard.ts`** — primitives only, no `@padel/api` import.
```ts
export interface WizardSeries {
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  inviteLeadDays: 3 | 5 | 7;
}
export interface WizardInvitee {
  invitee_id?: string;
  name?: string;
  email?: string;
  phone?: string;
}
export interface WizardEntranceFee {
  enabled: boolean;
  amount?: number;
  method?: string;
  mbaNumber?: string;
}
/** Camel-case event draft (primitives only — enums validated at submit by createEventSchema). */
export interface WizardDraft {
  groupId: string | null;
  eventType?: string;
  specification?: string;
  scoringMode?: string;
  scoringValue: number | null;
  manualLocationName?: string;
  manualLocationAddress?: string;
  venueId?: string;
  hasLocation: boolean;
  numCourts: number;
  startsAt?: string;
  durationMinutes: number;
  allowStandby: boolean;
  standbySpots?: number;
  isPrivate: boolean;
  entranceFee: WizardEntranceFee;
  playersSubmitResults: boolean;
  organizerRole: string;
  name: string;
  description?: string;
  series?: WizardSeries;
  invitees?: WizardInvitee[];
}

export const defaultWizardDraft: WizardDraft = {
  groupId: null,
  scoringValue: null,
  hasLocation: false,
  numCourts: 1,
  durationMinutes: 90,
  allowStandby: false,
  isPrivate: false,
  entranceFee: { enabled: false },
  playersSubmitResults: false,
  organizerRole: 'organizing_and_playing',
  name: '',
};

/** Per-step Next-button gates, keyed by step number 1..10. nowMs injected for testability. */
export const stepIsValid: Record<number, (d: WizardDraft, nowMs: number) => boolean> = {
  1: () => true,
  2: (d) => Boolean(d.eventType),
  3: (d) => Boolean(d.specification),
  4: (d) =>
    Boolean(d.scoringMode) &&
    (d.scoringMode === 'classic' || (d.scoringValue != null && d.scoringValue > 0)),
  5: () => true,
  6: (d) => d.numCourts >= 1,
  7: (d, nowMs) =>
    Boolean(d.startsAt) && d.durationMinutes > 0 && new Date(d.startsAt as string).getTime() > nowMs,
  8: (d) =>
    !d.entranceFee.enabled ||
    (d.entranceFee.amount != null && d.entranceFee.amount > 0 && Boolean(d.entranceFee.method)),
  9: (d) => d.name.trim().length > 0,
  10: () => true,
};

/** Build the camelCase CreateEventInput-shaped object from the draft (+ resolved thumbnail path). */
export function draftToCreateInput(d: WizardDraft, thumbnailPath?: string): Record<string, unknown> {
  return {
    groupId: d.groupId,
    eventType: d.eventType,
    specification: d.specification,
    scoringMode: d.scoringMode,
    scoringValue: d.scoringMode === 'classic' ? null : d.scoringValue,
    manualLocationName: d.manualLocationName || undefined,
    manualLocationAddress: d.manualLocationAddress || undefined,
    venueId: d.venueId || undefined,
    hasLocation: d.hasLocation,
    numCourts: d.numCourts,
    startsAt: d.startsAt,
    durationMinutes: d.durationMinutes,
    allowStandby: d.allowStandby,
    standbySpots: d.allowStandby ? d.standbySpots : undefined,
    isPrivate: d.groupId === null ? true : d.isPrivate,
    entranceFee: {
      enabled: d.entranceFee.enabled,
      amount: d.entranceFee.enabled ? d.entranceFee.amount : undefined,
      method: d.entranceFee.enabled ? d.entranceFee.method : undefined,
      mbaNumber: d.entranceFee.method === 'mba' ? d.entranceFee.mbaNumber : undefined,
    },
    playersSubmitResults: d.playersSubmitResults,
    organizerRole: d.organizerRole,
    name: d.name.trim(),
    description: d.description?.trim() || undefined,
    thumbnailPath: thumbnailPath || undefined,
    series: d.series,
    invitees: d.invitees && d.invitees.length > 0 ? d.invitees : undefined,
  };
}
```

- [ ] **Step 2: `event-wizard.test.ts`** — validate the builder against `createEventSchema`? NO (utils can't import api). Test the pure shape + predicates directly:
```ts
import { describe, it, expect } from 'vitest';
import { stepIsValid, draftToCreateInput, defaultWizardDraft, type WizardDraft } from './event-wizard';

const HOUR = 60 * 60 * 1000;
const full = (over: Partial<WizardDraft> = {}): WizardDraft => ({
  ...defaultWizardDraft,
  groupId: 'g1',
  eventType: 'americano',
  specification: 'classic',
  scoringMode: 'points',
  scoringValue: 24,
  startsAt: new Date(100 * HOUR).toISOString(),
  name: 'Friday Padel',
  ...over,
});

describe('stepIsValid', () => {
  it('step2/3 require type/spec', () => {
    expect(stepIsValid[2](defaultWizardDraft, 0)).toBe(false);
    expect(stepIsValid[2](full(), 0)).toBe(true);
    expect(stepIsValid[3](full({ specification: undefined }), 0)).toBe(false);
  });
  it('step4 needs a positive value unless classic', () => {
    expect(stepIsValid[4](full({ scoringMode: 'points', scoringValue: 0 }), 0)).toBe(false);
    expect(stepIsValid[4](full({ scoringMode: 'classic', scoringValue: null }), 0)).toBe(true);
  });
  it('step7 requires a future start', () => {
    expect(stepIsValid[7](full({ startsAt: new Date(100 * HOUR).toISOString() }), 50 * HOUR)).toBe(true);
    expect(stepIsValid[7](full({ startsAt: new Date(10 * HOUR).toISOString() }), 50 * HOUR)).toBe(false);
  });
  it('step8 requires amount+method when fee enabled', () => {
    expect(stepIsValid[8](full({ entranceFee: { enabled: true } }), 0)).toBe(false);
    expect(stepIsValid[8](full({ entranceFee: { enabled: true, amount: 5, method: 'cash' } }), 0)).toBe(true);
  });
  it('step9 requires a name', () => {
    expect(stepIsValid[9](full({ name: '  ' }), 0)).toBe(false);
  });
});

describe('draftToCreateInput', () => {
  it('forces isPrivate for standalone (no group)', () => {
    const out = draftToCreateInput(full({ groupId: null, isPrivate: false }));
    expect(out.isPrivate).toBe(true);
  });
  it('nulls scoringValue for classic and drops fee fields when disabled', () => {
    const out = draftToCreateInput(full({ scoringMode: 'classic', scoringValue: 9 }));
    expect(out.scoringValue).toBeNull();
    expect((out.entranceFee as { amount?: number }).amount).toBeUndefined();
  });
  it('passes the thumbnail path through', () => {
    expect(draftToCreateInput(full(), 'evt/x.jpg').thumbnailPath).toBe('evt/x.jpg');
  });
});
```

- [ ] **Step 3:** Add `export * from './event-wizard';` to `packages/utils/src/index.ts`.

- [ ] **Step 4: extend the web upload bucket union** — in `apps/web/src/lib/upload.ts`, change the `uploadCommunityImage` `bucket` parameter type from `'community-thumbnails' | 'community-covers'` to `'community-thumbnails' | 'community-covers' | 'event-thumbnails'`. No other change.

- [ ] **Step 5:** `pnpm --filter @padel/utils test` (all pass) + `pnpm --filter @padel/utils typecheck` + `pnpm --filter web typecheck`. Commit:
```bash
git add packages/utils/src/event-wizard.ts packages/utils/src/event-wizard.test.ts packages/utils/src/index.ts apps/web/src/lib/upload.ts
git commit -m "feat(utils): event wizard draft logic + builder; web event-thumbnails bucket (W4c)"
```

---

## Task 2: `event` i18n — wizard keys

**Files:** Modify `apps/web/src/lib/i18n-web.ts` (the `webEvent` bundle, all three locale blocks).

- [ ] **Step 1:** Lift the wizard keys from the mobile `event` bundle (`apps/mobile/lib/i18n-mobile.ts` — it has en, pt-PT, pt-BR). For EACH of the three web `webEvent` locale blocks, add every key below that is not already present (W4a/W4b already added `type*Label`, `scoring*Label`, `fee*Label`, `forbidden`, `group_not_found`, `unknown_error`, status/detail keys — do NOT duplicate). Copy the value for the matching locale from the mobile bundle verbatim; where a key has no mobile equivalent, use the English fallback shown.

Step nav + titles: `step1Title, step1Subtitle, step2Title, step3Title, step4Title, step5Title, step6Title, step7Title, step8Title, step9Title, step10Title`, `nextCta:'Next', backCta:'Back', createEventCta:'Create event', stepProgress:'Step {{current}} of {{total}}'`.
Group step: `noGroupOption, noGroupHint, noGroupsYet`.
Spec option labels: `specClassicLabel:'Classic', specMixedLabel:'Mixed', specTeamLabel:'Team'`.
Organizer role: `organizerRoleLabel`, `roleOrganizing_onlyLabel:'Organizing only', roleOrganizing_and_playingLabel:'Organizing and playing'`.
Scoring: `scoringValueLabel:'Points / minutes'` (the numeric value label).
Location: `locationLabel, venueSearchLabel:'Search a venue', manualLocationLabel:'Enter manually', locationNameLabel:'Venue name', locationAddressLabel:'Address', noVenueResults:'No venues found'`.
Courts: `courtsLabel`.
Schedule: `startsAtLabel:'Date & time', durationLabel:'Duration (minutes)', recurringToggle:'Repeat weekly', dayOfWeekLabel:'Day of week', startTimeLabel:'Start time', inviteLeadLabel:'Invite players', leadDays3:'3 days before', leadDays5:'5 days before', leadDays7:'7 days before', day1:'Monday', day2:'Tuesday', day3:'Wednesday', day4:'Thursday', day5:'Friday', day6:'Saturday', day7:'Sunday'`.
Preferences: `standbyToggle:'Allow standby players', standbySpotsLabel:'Standby spots', privateToggle:'Private event', feeToggle:'Charge an entrance fee', feeAmountLabel:'Amount', feeMethodLabel:'Payment method', feeMbaNumberLabel:'MB WAY number', playersSubmitToggle:'Players can submit results'`.
Details: `nameLabel:'Event name', namePlaceholder:'e.g. Friday Americano', descriptionLabel2:'Description', thumbnailLabel:'Cover image'` (note: `descriptionLabel`/`thumbnailLabel` may already exist from W4a; if so reuse them and skip the `2` variant — verify and only add what's missing).
Invite: `inviteTitle:'Invite players', autoInviteNote:'All group members will be invited automatically.', addInviteeCta:'Add', inviteeNameLabel:'Name', inviteeEmailLabel:'Email', inviteePhoneLabel:'Phone', noInvitees:'No one added yet'`.
Edit: `editTitle:'Edit event', saveCta:'Save changes'` (`save`/`saving` may already exist from W3/W4 — reuse).
Validation/errors (only add if missing): `name_required:'Please enter an event name.', invalid_time:'Enter a valid time.', standalone_must_be_private:'Standalone events must be private.', fee_requires_amount_and_method:'Enter a fee amount and payment method.', recurring_events:'This action cannot be applied to a recurring series.', not_editable:'This event can no longer be edited.'` (+ pt-PT/pt-BR from the mobile bundle).

Use the mobile bundle's exact pt-PT/pt-BR values where the key exists there (e.g. `step*Title`, `noGroup*`, `courtsLabel`, `durationLabel`, `locationLabel`, `organizerRoleLabel`, the error keys). For keys with no mobile match, translate naturally (pt-PT/pt-BR).

- [ ] **Step 2:** `pnpm --filter web typecheck` (catches duplicate keys) → PASS. Commit:
```bash
git add apps/web/src/lib/i18n-web.ts
git commit -m "feat(web): event create/edit wizard i18n (W4c)"
```

---

## Task 3: wizard shell + shared bits (create page scaffold)

**Files:**
- Create: `apps/web/src/components/event/wizard/SelectableCard.tsx`, `StepIndicator.tsx`
- Create: `apps/web/src/components/event/wizard/types.ts` (web step prop types)
- Create: `apps/web/src/app/(app)/app/community/[id]/event-create/page.tsx` (shell only — renders step placeholders; real steps land in Tasks 4–5)

- [ ] **Step 1: `SelectableCard.tsx`** — a button-card for single/multi choice:
```tsx
'use client';
import { cn } from '@/lib/utils';

export function SelectableCard({
  title,
  subtitle,
  selected,
  onClick,
}: {
  title: string;
  subtitle?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full flex-col items-start gap-0.5 rounded-lg border p-4 text-left transition-colors',
        selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
      )}
    >
      <span className="font-medium">{title}</span>
      {subtitle ? <span className="text-sm text-muted-foreground">{subtitle}</span> : null}
    </button>
  );
}
```
(Verify `cn` is exported from `@/lib/utils` — it is, shadcn standard.)

- [ ] **Step 2: `StepIndicator.tsx`**:
```tsx
'use client';
import { useT } from '@padel/i18n';
export function StepIndicator({ stepIndex, total }: { stepIndex: number; total: number }) {
  const { t } = useT('event');
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-muted-foreground">
        {t('stepProgress', { current: stepIndex + 1, total })}
      </p>
      <div className="flex gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full ${i <= stepIndex ? 'bg-primary' : 'bg-muted'}`}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `types.ts`**:
```ts
import type { WizardDraft } from '@padel/utils';
export interface StepProps {
  draft: WizardDraft;
  patch: (partial: Partial<WizardDraft>) => void;
  communityId: string;
}
```

- [ ] **Step 4: create page shell** `apps/web/src/app/(app)/app/community/[id]/event-create/page.tsx` — owns the draft state + nav; renders a placeholder per step for now (Tasks 4–5 replace the switch with real step components). Keep `nowMs` for step-7 validation; gate with `useCanCreateEvent`.
```tsx
'use client';
import { useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useT } from '@padel/i18n';
import { defaultWizardDraft, stepIsValid, type WizardDraft } from '@padel/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StepIndicator } from '@/components/event/wizard/StepIndicator';

const TOTAL = 10;

export default function EventCreatePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const presetGroup = useSearchParams().get('groupId');
  const { t } = useT('event');
  const [draft, setDraft] = useState<WizardDraft>(() => ({
    ...defaultWizardDraft,
    groupId: presetGroup ?? null,
  }));
  const [stepIndex, setStepIndex] = useState(0);
  const [nowMs] = useState(() => Date.now());
  const patch = (partial: Partial<WizardDraft>) => setDraft((d) => ({ ...d, ...partial }));

  const stepNo = stepIndex + 1;
  const canAdvance = useMemo(() => stepIsValid[stepNo]?.(draft, nowMs) ?? true, [stepNo, draft, nowMs]);
  const isLast = stepIndex === TOTAL - 1;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-6">
      <StepIndicator stepIndex={stepIndex} total={TOTAL} />
      <Card>
        <CardContent className="py-6">
          {/* Tasks 4–5 render the real step here based on stepNo */}
          <p className="text-sm text-muted-foreground">{t(`step${stepNo}Title`)}</p>
        </CardContent>
      </Card>
      <div className="flex justify-between">
        <Button variant="outline" disabled={stepIndex === 0} onClick={() => setStepIndex((i) => i - 1)}>
          {t('backCta')}
        </Button>
        {isLast ? (
          <Button disabled={!canAdvance}>{t('createEventCta')}</Button>
        ) : (
          <Button disabled={!canAdvance} onClick={() => setStepIndex((i) => i + 1)}>
            {t('nextCta')}
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5:** `pnpm --filter web typecheck && pnpm --filter web build` → PASS. Commit:
```bash
git add apps/web/src/components/event/wizard "apps/web/src/app/(app)/app/community/[id]/event-create/page.tsx"
git commit -m "feat(web): event wizard shell + step indicator + selectable card (W4c)"
```

---

## Task 4: step components 1–6 (Group / Type / Spec / Scoring / Location / Courts)

**Files:** Create `apps/web/src/components/event/wizard/steps/Step{1Group,2Type,3Spec,4Scoring,5Location,6Courts}.tsx`. Modify the create page to render steps 1–6.

- [ ] **Step 1: Step1Group** (`useCommunityGroups(communityId)` + standalone):
```tsx
'use client';
import { useT } from '@padel/i18n';
import { useCommunityGroups } from '@padel/api';
import { SelectableCard } from '../SelectableCard';
import { Skeleton } from '@/components/ui/skeleton';
import type { StepProps } from '../types';

export function Step1Group({ draft, patch, communityId }: StepProps) {
  const { t } = useT('event');
  const groups = useCommunityGroups(communityId);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">{t('step1Title')}</h2>
        <p className="text-sm text-muted-foreground">{t('step1Subtitle')}</p>
      </div>
      {groups.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="flex flex-col gap-2">
          {(groups.data ?? []).map((g) => (
            <SelectableCard
              key={g.id}
              title={g.name}
              selected={draft.groupId === g.id}
              onClick={() => patch({ groupId: g.id })}
            />
          ))}
          <SelectableCard
            title={t('noGroupOption')}
            subtitle={t('noGroupHint')}
            selected={draft.groupId === null}
            onClick={() => patch({ groupId: null, isPrivate: true })}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Step2Type / Step3Spec / Step4Scoring** — enum SelectableCard grids using the `@padel/api` consts. Example Step2Type (mirror for Spec with `SPECIFICATIONS` + `spec*Label`):
```tsx
'use client';
import { useT } from '@padel/i18n';
import { EVENT_TYPES } from '@padel/api';
import { SelectableCard } from '../SelectableCard';
import type { StepProps } from '../types';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function Step2Type({ draft, patch }: StepProps) {
  const { t } = useT('event');
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t('step2Title')}</h2>
      <div className="flex flex-col gap-2">
        {EVENT_TYPES.map((v) => (
          <SelectableCard
            key={v}
            title={t(`type${cap(v)}Label`)}
            selected={draft.eventType === v}
            onClick={() => patch({ eventType: v })}
          />
        ))}
      </div>
    </div>
  );
}
```
Step3Spec: same with `SPECIFICATIONS` and label `spec${cap(v)}Label` (note `up_and_down`→`Up_and_down` casing isn't needed here; spec values are single words). Step4Scoring: `SCORING_MODES` SelectableCards (label `scoring${cap(v)}Label`) + when `draft.scoringMode && draft.scoringMode !== 'classic'`, an `<Input type="number">` bound to `scoringValue` (label `scoringValueLabel`).

- [ ] **Step 3: Step5Location** — venue search + manual:
```tsx
'use client';
import { useState } from 'react';
import { useT } from '@padel/i18n';
import { useSearchVenues } from '@padel/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectableCard } from '../SelectableCard';
import type { StepProps } from '../types';

export function Step5Location({ draft, patch }: StepProps) {
  const { t } = useT('event');
  const [query, setQuery] = useState('');
  const venues = useSearchVenues(query);
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{t('step5Title')}</h2>
      <div className="space-y-2">
        <Label>{t('venueSearchLabel')}</Label>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} />
        {query.trim() && (venues.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noVenueResults')}</p>
        ) : null}
        <div className="flex flex-col gap-2">
          {(venues.data ?? []).map((v: { id: string; name: string; address?: string | null }) => (
            <SelectableCard
              key={v.id}
              title={v.name}
              subtitle={v.address ?? undefined}
              selected={draft.venueId === v.id}
              onClick={() => patch({ venueId: v.id, hasLocation: true, manualLocationName: undefined, manualLocationAddress: undefined })}
            />
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t('manualLocationLabel')}</Label>
        <Input
          placeholder={t('locationNameLabel')}
          value={draft.manualLocationName ?? ''}
          onChange={(e) => patch({ manualLocationName: e.target.value, venueId: undefined, hasLocation: e.target.value.trim().length > 0 })}
        />
        <Input
          placeholder={t('locationAddressLabel')}
          value={draft.manualLocationAddress ?? ''}
          onChange={(e) => patch({ manualLocationAddress: e.target.value })}
        />
      </div>
    </div>
  );
}
```
(VERIFY `useSearchVenues` row shape — `search_venues` returns `{ id, name, address? }` or similar; adapt the inline type to the real columns; if it returns more/different fields, match them.)

- [ ] **Step 4: Step6Courts** — a numeric stepper bound to `numCourts` (min 1): two `Button`s (−/+) around the value, label `courtsLabel`.

- [ ] **Step 5:** Wire steps 1–6 into the create page: replace the placeholder with a `switch (stepNo)` rendering each step, passing `{ draft, patch, communityId: id }`. (Steps 7–10 still placeholders until Task 5.)

- [ ] **Step 6:** `pnpm --filter web typecheck && pnpm --filter web build` → PASS. Commit:
```bash
git add apps/web/src/components/event/wizard/steps "apps/web/src/app/(app)/app/community/[id]/event-create/page.tsx"
git commit -m "feat(web): event wizard steps 1-6 (group/type/spec/scoring/location/courts) (W4c)"
```

---

## Task 5: step components 7–10 + submit

**Files:** Create `Step{7Schedule,8Preferences,9Details,10Invite}.tsx`. Modify the create page (render 7–10 + submit handler).

- [ ] **Step 1: Step7Schedule** — `startsAt` via `<input type="datetime-local">` (store as ISO: `new Date(localValue).toISOString()`; display by slicing the ISO back to local — store the ISO in draft, keep a local display string in component state), `durationMinutes` number input, a `recurringToggle` `Switch` revealing the series sub-form: `dayOfWeek` `Select` (1–7 → `day1..day7`), `startTime` `<input type="time">`, series `durationMinutes`, `inviteLeadDays` `Select` (3/5/7). Patch `draft.series` (or clear it when the toggle is off).

- [ ] **Step 2: Step8Preferences** — `Switch`es + inputs: `allowStandby` (+ `standbySpots` number when on), `isPrivate` (`Switch`; when `draft.groupId === null` render it checked + disabled), `entranceFee.enabled` (`Switch`) → when on, `amount` number + `method` `Select` (cash/at_club/mba → `fee*Label`) + `mbaNumber` `Input` shown when method==='mba'; `playersSubmitResults` `Switch`; `organizerRole` SelectableCards/`Select` (`role*Label`). Patch nested `entranceFee` immutably.

- [ ] **Step 3: Step9Details** — `name` `Input` (maxLength 80), `description` `Textarea` (maxLength 500), thumbnail `<input type=file accept="image/*">` with object-URL preview (revoke on change/unmount); store the `File` in the page-level state, NOT in `WizardDraft` (the draft has no thumbnail field — keep `const [thumbFile, setThumbFile]` in the page and pass a setter via a prop, OR lift the file to page state and have Step9 call an `onThumbnail(file)` prop). Add `onThumbnail?: (f: File | null) => void` to `StepProps` (optional) and a `thumbPreview` prop, set by the page.

- [ ] **Step 4: Step10Invite** — when `draft.groupId` is set and the group is public, show `autoInviteNote` (no picker). Otherwise: a `useGroupMembers(draft.groupId ?? '')` selectable list (toggle into `draft.invitees` as `{ invitee_id }`) + a manual add form (`name`/`email`/`phone` → push `{ name, email, phone }`), with a list of added invitees (removable). For standalone (no group), manual-only. (Determining "public group" requires the group's privacy; if not readily available, always show the picker — the RPC still auto-invites for public groups. Keep it simple: always show the member picker + manual add when there's a group; manual-only when standalone.)

- [ ] **Step 5: submit handler in the create page** — on the last step's Create button:
```tsx
import { useCreateEvent, useCanCreateEvent, createEventSchema } from '@padel/api';
import { draftToCreateInput } from '@padel/utils';
import { uploadCommunityImage } from '@/lib/upload';
import { useSession } from '@padel/auth';
// ...
const uid = useSession().session?.user.id;
const create = useCreateEvent();
const canCreate = useCanCreateEvent(draft.groupId ?? '');
const [thumbFile, setThumbFile] = useState<File | null>(null);
const [submitErr, setSubmitErr] = useState<string | null>(null);
const [submitting, setSubmitting] = useState(false);

const onSubmit = async () => {
  setSubmitting(true);
  setSubmitErr(null);
  try {
    let thumbnailPath: string | undefined;
    if (thumbFile && uid) {
      try { thumbnailPath = await uploadCommunityImage(thumbFile, uid, 'event-thumbnails'); } catch { /* non-fatal */ }
    }
    const parsed = createEventSchema.safeParse(draftToCreateInput(draft, thumbnailPath));
    if (!parsed.success) {
      setSubmitErr(t(parsed.error.issues[0]?.message ?? 'unknown_error'));
      setSubmitting(false);
      return;
    }
    const newId = (await create.mutateAsync(parsed.data)) as string;
    router.replace(`/app/event/${newId}`);
  } catch (e) {
    setSubmitErr(t(e instanceof Error ? e.message : 'unknown_error'));
    setSubmitting(false);
  }
};
```
Disable the Create button when `draft.groupId && canCreate.data === false` (show a limit notice) or `submitting`. Show `submitErr` inline. Render steps 7–10 in the switch (Step9 gets `onThumbnail={setThumbFile}` + a preview; pass `thumbFile`).

- [ ] **Step 6:** `pnpm --filter web typecheck && pnpm --filter web build` → PASS. Commit:
```bash
git add apps/web/src/components/event/wizard "apps/web/src/app/(app)/app/community/[id]/event-create/page.tsx"
git commit -m "feat(web): event wizard steps 7-10 + create submit (W4c)"
```

---

## Task 6: Edit page `/app/event/[id]/edit`

**Files:** Create `apps/web/src/app/(app)/app/event/[id]/edit/page.tsx`.

- [ ] **Step 1:** Organizer-gated form seeded from `useEvent(id)` covering the `updateEventSchema` subset (name, description, thumbnail, startsAt, durationMinutes, scoringMode+value, allowStandby+standbySpots, isPrivate, entranceFee, playersSubmitResults, organizerRole, manualLocation*/venueId/hasLocation, numCourts). Reuse the Step8Preferences / Step5Location / Step9Details field groups where practical, or inline the fields. Seed once via a `useRef` guard (mirror the W3b settings page). Build the camelCase `UpdateEventInput`, `updateEventSchema.safeParse`, then `useUpdateEvent(id).mutate({ values, groupId: event.group_id })`; on success `router.push('/app/event/'+id)`. Thumbnail re-upload via `uploadCommunityImage(file, uid, 'event-thumbnails')` (non-fatal). Redirect non-organizers (`event.organizer_id !== uid`). Map zod/RPC error keys to i18n inline.
```tsx
// Skeleton of the gate + seed + submit (fields per updateEventSchema):
'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import { useEvent, useUpdateEvent, updateEventSchema } from '@padel/api';
import { uploadCommunityImage } from '@/lib/upload';
// ...ui imports
export default function EventEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useT('event');
  const uid = useSession().session?.user.id;
  const event = useEvent(id);
  const update = useUpdateEvent(id);
  // local state for every editable field + seed-once useRef from event.data (snake->camel)
  // redirect when event loaded and event.data.organizer_id !== uid
  // onSubmit: build values, updateEventSchema.safeParse, update.mutate({ values, groupId: event.data.group_id })
  // ...
}
```
Provide the full field set in the implementation (the implementer should mirror the create steps' inputs for the subset; this is the one task where the implementer writes the full form from the field list — give it the exact `updateEventSchema` field list above).

- [ ] **Step 2:** `pnpm --filter web typecheck && pnpm --filter web build` → PASS. Commit:
```bash
git add "apps/web/src/app/(app)/app/event/[id]/edit/page.tsx"
git commit -m "feat(web): event edit form (W4c)"
```

---

## Task 7: entry points (New event + Edit link)

**Files:** Modify `apps/web/src/app/(app)/app/community/[id]/page.tsx`, `apps/web/src/app/(app)/app/group/[id]/page.tsx`, `apps/web/src/app/(app)/app/event/[id]/page.tsx`.

- [ ] **Step 1: community Events tab New-event button** — in the community page, add a **New event** `Button`/`Link` to `/app/community/[id]/event-create` above the Events list (it's reasonable to show it to community owner/admins — reuse the `canCreateGroup`-style gate already present, or show unconditionally and let the wizard/RPC gate). Use the `event` namespace via a `const { t: te } = useT('event')` (or reuse existing `tg` pattern) for `te('createEventCta')` → actually use a dedicated label `te('title')`-adjacent `newEventCta:'New event'` (add this key in Task 2 if missing).
- [ ] **Step 2: group detail New-event button** — in the group page, add a **New event** `Button` → `/app/community/${group.community_id}/event-create?groupId=${id}`, gated by `useCanCreateEvent(id)` (`data === true`). Add `useCanCreateEvent` to the `@padel/api` import + the hook before early returns.
- [ ] **Step 3: event detail Edit link** — in the event detail page, when `uid === event.organizer_id`, render an **Edit** `Button`/`Link` → `/app/event/[id]/edit` near the header (the page already computes `isOrganizer` via `participationState` from W4b — reuse it).
- [ ] **Step 4:** add `newEventCta:'New event'` (+ pt) to the `event` bundle if not added in Task 2. `pnpm --filter web typecheck && pnpm --filter web build` → PASS. Commit:
```bash
git add "apps/web/src/app/(app)/app/community/[id]/page.tsx" "apps/web/src/app/(app)/app/group/[id]/page.tsx" "apps/web/src/app/(app)/app/event/[id]/page.tsx" apps/web/src/lib/i18n-web.ts
git commit -m "feat(web): New-event entries + event Edit link (W4c)"
```

---

## Task 8: Verification

- [ ] **Step 1:** `pnpm --filter @padel/utils test` (wizard logic) + `pnpm --filter web typecheck && pnpm --filter web build` → all PASS.
- [ ] **Step 2 (browser, local Supabase, as a community owner/admin):** community Events tab → **New event** → step through all 10 → each Next gates on validity → **Create event** → lands on `/app/event/[newId]` with the right name/type/scoring/location/schedule.
- [ ] **Step 3:** Create a **standalone** (No group) event → private is forced; lands correctly.
- [ ] **Step 4:** Create a **recurring** event (toggle weekly) → succeeds. Create a **fee** event (amount+method) → fee shows on detail.
- [ ] **Step 5:** On a private group event, add member invitees + a manual email → invitees created.
- [ ] **Step 6:** Event detail (as organizer) → **Edit** → change schedule/fee/details → Save → reflected on the detail. A non-organizer visiting `/edit` is redirected. An over-limit group disables Create.

---

## Verification (summary)
vitest for the wizard logic; per-task typecheck; build after Tasks 3–7; browser smoke (Task 8). Finish via superpowers:finishing-a-development-branch.

## Out of scope
Manage hub (W4d); live match (W4e); client-side geocoding; duplicate-event (W4d); editing group/type/specification post-creation.
