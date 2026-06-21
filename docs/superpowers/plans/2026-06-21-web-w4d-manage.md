# Web W4d — Event manage hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The organizer manage area on web — roster + payments + add-manual + CSV + blast + activity + cancel + duplicate — at `/app/event/[id]/manage/**`, plus wiring the W4b "Manage" CTA.

**Architecture:** A roster hub page + a blast page + an activity page (all organizer-gated, client components), with roster/blast/activity sub-components under `apps/web/src/components/event/manage/`. All data/mutations via existing `@padel/api` hooks; CSV built client-side via `@padel/utils`.

**Tech Stack:** Next.js 16 App Router (client), React 19, `@padel/api`, `@padel/utils`, shadcn/ui, react-i18next.

**Verified facts (from source):**
- Hook constructors take `(eventId)`: `useMarkConfirmed`, `useMarkPaid`, `useMarkAllPaid`, `useRemoveParticipant`, `useAddManualParticipant`, `useCancelEvent`, `useSendRosterCsvEmail`, `useSendBlast`, `useRetryBlast`, `useEventActivity`, `useEventBlasts`, `useCanCustomizeBlast`, `useEventBlastDeliveries`. `useBlastTemplates()` and `useDuplicateEvent()` take none.
- Mutation args: `useMarkConfirmed.mutate({ participantId, targetName? })`; `useMarkPaid.mutate({ participantId, paid, targetName? })`; `useMarkAllPaid.mutate()`; `useRemoveParticipant.mutate({ participantId, mode: 'to_invited'|'from_event', targetName? })`; `useAddManualParticipant.mutate({ name, gender? })`; `useCancelEvent.mutate({ scope: 'only_this'|'this_and_upcoming' })`; `useDuplicateEvent.mutate({ eventId, groupId, overrides })` → new id; `useSendRosterCsvEmail.mutate()`; `useSendBlast.mutate({ sourceTemplateId?, title, description, imagePath?, channels: ('email'|'whatsapp')[] })`; `useRetryBlast.mutate(blastId)`. All throw `Error(mappedKey)`.
- `useEventParticipants(id)` rows: `{ id, user_id, status, is_standby, has_paid, confirmed_at, paid_at, joined_at, guest_name, waiting_list_position, profiles:{id,full_name,avatar_url} }`. **`participantId` is the participant row's `id`.**
- `useEventInvitations(id)` rows: `{ id, invitee_id, invited_by, status, invitee:{full_name,avatar_url} }`.
- `useEventBlasts(id)` → `{ id, title, description, channels, sent_to_count, sent_at, source_template_id, image_path }[]`. `useEventBlastDeliveries(id)` → `{ blast_id, status, attempt, sent_count, failed_count, error }[]`. `useBlastTemplates()` → `{ id, title, description, image_path, category, is_default }[]`. `useCanCustomizeBlast(id)` → boolean. `useEventActivity(id)` → `{ id, action, detail, created_at, profiles:{full_name, avatar_url} }[]`.
- `buildRosterCsv(participants: CsvParticipant[], event: CsvEvent): string` + `rosterCsvFilename(eventName, isoDate): string` from `@padel/utils`. `CsvParticipant = { user_id, guest_name, status, is_standby, joined_at, confirmed_at, has_paid, paid_at, profiles:{full_name} }`; `CsvEvent = { entrance_fee_enabled, entrance_fee_amount }`.
- shadcn present: `dropdown-menu, alert-dialog, badge, avatar, card, button, input, select, textarea, skeleton`. `avatarUrl` from `@/lib/upload`. `useSession` from `@padel/auth`.
- Mobile reference: `apps/mobile/app/event/[id]/{manage,blast,activity}.tsx` + `apps/mobile/lib/i18n-mobile.ts` (event bundle, 3 locales).

---

## Task 1: `event` i18n — manage/blast/activity keys

**Files:** Modify `apps/web/src/lib/i18n-web.ts` (the `webEvent` bundle, all three locales).

- [ ] **Step 1:** For each of `en`/`pt-PT`/`pt-BR`, add the keys below that are NOT already present (W4a/b/c added many — do not duplicate; typecheck catches dupes). Lift each locale's value from the mobile `event` bundle (`apps/mobile/lib/i18n-mobile.ts`) where the key exists; for web-only keys use the English fallback shown + natural pt translations.

Keys: `manageTitle, rosterConfirmedSection, rosterWaitingSection, rosterStandbySection, rosterInvitedSection, noRoster, markConfirmedCta, markAllPaidCta, paidBadge, unpaidBadge, removeCta, removeToInvitedCta, removeFromEventCta, removeConfirmTitle, removeConfirmBody, addManualCta, manualNameLabel, manualGenderLabel, duplicateCta, editEventCta, sendBlastCta, activityLogCta, exportCsvCta, emailCsvCta, csvEmailed, cancelEventCta, cancelStandardTitle, cancelStandardBody, cancelRecurringTitle, cancelOnlyThisCta, cancelThisAndUpcomingCta, blastTitle, blastTitleLabel, blastDescLabel, blastSendCta, blastSendToAll, blastSentTitle, blastYourEmpty, blastCustomizeTitle, retryBlastCta, deliveryDelivered, deliveryPending, deliveryFailed`.
Web-only fallbacks (en; translate pt): `activityTitle:'Activity', manageActionsTitle:'Manage', blastTemplateLabel:'Template', blastNoTemplate:'No template', genderMale:'Male', genderFemale:'Female', genderOther:'Other', confirm:'Confirm', cancel:'Cancel'` (only add ones missing — `cancel`/`confirm` may exist from W4b/earlier; skip if present).
Error keys already present from W4b (`forbidden`, `not_participant`, `event_closed`, `recurring_events`, `unknown_error`) — reuse; add `not_editable` if missing.

- [ ] **Step 2:** `pnpm --filter web typecheck` → PASS. Commit:
```bash
git add apps/web/src/lib/i18n-web.ts
git commit -m "feat(web): event manage/blast/activity i18n (W4d)"
```

---

## Task 2: roster hub — sections, rows, add-manual

**Files:**
- Create: `apps/web/src/components/event/manage/RosterRow.tsx`, `AddManualForm.tsx`
- Create: `apps/web/src/app/(app)/app/event/[id]/manage/page.tsx` (roster portion; management-actions card added in Task 3)

(No separate `RosterSection` component — the hub page inlines a small `section(title, rows)` render helper.)

- [ ] **Step 1: `RosterRow.tsx`** — a roster line with a `DropdownMenu` of actions. Props:
```tsx
'use client';
import { useT } from '@padel/i18n';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useState } from 'react';
import { avatarUrl } from '@/lib/upload';

export interface RosterParticipant {
  id: string;
  user_id: string | null;
  status: string;
  is_standby: boolean;
  has_paid: boolean;
  joined_at: string;
  confirmed_at: string | null;
  paid_at: string | null;
  guest_name: string | null;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
}

export function RosterRow({
  p,
  feeEnabled,
  onConfirm,
  onTogglePaid,
  onRemove,
}: {
  p: RosterParticipant;
  feeEnabled: boolean;
  onConfirm: (name: string) => void;
  onTogglePaid: (paid: boolean, name: string) => void;
  onRemove: (mode: 'to_invited' | 'from_event', name: string) => void;
}) {
  const { t } = useT('event');
  const name = p.profiles?.full_name ?? p.guest_name ?? '—';
  const [confirmRemove, setConfirmRemove] = useState<null | 'to_invited' | 'from_event'>(null);
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="size-9">
          <AvatarImage src={avatarUrl(p.profiles?.avatar_url) ?? undefined} />
          <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="truncate text-sm font-medium">{name}</span>
        {feeEnabled ? (
          <Badge variant={p.has_paid ? 'secondary' : 'outline'}>
            {p.has_paid ? t('paidBadge') : t('unpaidBadge')}
          </Badge>
        ) : null}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">⋯</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {p.status !== 'confirmed' ? (
            <DropdownMenuItem onClick={() => onConfirm(name)}>{t('markConfirmedCta')}</DropdownMenuItem>
          ) : null}
          {feeEnabled ? (
            <DropdownMenuItem onClick={() => onTogglePaid(!p.has_paid, name)}>
              {p.has_paid ? t('unpaidBadge') : t('paidBadge')}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onClick={() => setConfirmRemove('to_invited')}>{t('removeToInvitedCta')}</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onClick={() => setConfirmRemove('from_event')}>
            {t('removeFromEventCta')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmRemove != null} onOpenChange={(o) => !o && setConfirmRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('removeConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('removeConfirmBody', { name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmRemove) onRemove(confirmRemove, name);
                setConfirmRemove(null);
              }}
            >
              {t('removeCta')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```
(`removeConfirmBody` may not take `{name}` in the mobile copy — if its string has no `{{name}}`, the interpolation is simply ignored; fine.)

- [ ] **Step 2: `AddManualForm.tsx`** — name `Input` (required) + gender `Select` (`genderMale/Female/Other` → `'male'|'female'|'other'`, optional) + **Add** `Button` (disabled until name non-empty). Calls an `onAdd(name, gender?)` prop, clears on success.

- [ ] **Step 3: roster hub page** `apps/web/src/app/(app)/app/event/[id]/manage/page.tsx` — organizer-gated; renders the four sections + Mark-all-paid + AddManualForm. (Management-actions card is added in Task 3 — leave a placeholder or omit for now.)
```tsx
'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import {
  useEvent, useEventParticipants, useEventInvitations, useEventRealtime,
  useMarkConfirmed, useMarkPaid, useMarkAllPaid, useRemoveParticipant, useAddManualParticipant,
} from '@padel/api';
import { RosterRow, type RosterParticipant } from '@/components/event/manage/RosterRow';
import { AddManualForm } from '@/components/event/manage/AddManualForm';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function EventManagePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useT('event');
  const uid = useSession().session?.user.id;
  useEventRealtime(id);
  const event = useEvent(id);
  const participants = useEventParticipants(id);
  const invitations = useEventInvitations(id);
  const markConfirmed = useMarkConfirmed(id);
  const markPaid = useMarkPaid(id);
  const markAllPaid = useMarkAllPaid(id);
  const removeParticipant = useRemoveParticipant(id);
  const addManual = useAddManualParticipant(id);
  const [err, setErr] = useState<string | null>(null);

  const isOrganizer = event.data != null && event.data.organizer_id === uid;
  useEffect(() => {
    if (!event.isLoading && event.data && !isOrganizer) router.replace(`/app/event/${id}`);
  }, [event.isLoading, event.data, isOrganizer, id, router]);

  if (event.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!event.data || !isOrganizer) return null;

  const e = event.data;
  const rows = (participants.data ?? []) as unknown as RosterParticipant[];
  const confirmed = rows.filter((p) => p.status === 'confirmed' && !p.is_standby);
  const waiting = rows.filter((p) => p.status === 'waiting_list');
  const standby = rows.filter((p) => p.is_standby);
  const invited = invitations.data ?? [];
  const feeEnabled = !!e.entrance_fee_enabled;

  const run = (fn: () => Promise<unknown>) => {
    setErr(null);
    fn().catch((x) => setErr(t(x instanceof Error ? x.message : 'unknown_error')));
  };

  const section = (title: string, list: RosterParticipant[]) =>
    list.length > 0 ? (
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <Card className="divide-y p-0">
          {list.map((p) => (
            <RosterRow
              key={p.id}
              p={p}
              feeEnabled={feeEnabled}
              onConfirm={(name) => run(() => markConfirmed.mutateAsync({ participantId: p.id, targetName: name }))}
              onTogglePaid={(paid, name) => run(() => markPaid.mutateAsync({ participantId: p.id, paid, targetName: name }))}
              onRemove={(mode, name) => run(() => removeParticipant.mutateAsync({ participantId: p.id, mode, targetName: name }))}
            />
          ))}
        </Card>
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">{t('manageTitle')}</h1>
      {err ? <p className="text-sm text-destructive">{err}</p> : null}

      {feeEnabled ? (
        <Button variant="outline" className="self-start" onClick={() => run(() => markAllPaid.mutateAsync())}>
          {t('markAllPaidCta')}
        </Button>
      ) : null}

      {section(t('rosterConfirmedSection'), confirmed)}
      {section(t('rosterWaitingSection'), waiting)}
      {section(t('rosterStandbySection'), standby)}

      {invited.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-muted-foreground">{t('rosterInvitedSection')}</p>
          <Card className="divide-y p-0">
            {invited.map((inv) => {
              const n = inv.invitee?.full_name ?? '—';
              return (
                <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar className="size-9">
                    <AvatarImage src={avatarUrl(inv.invitee?.avatar_url) ?? undefined} />
                    <AvatarFallback>{n.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm">{n}</span>
                </div>
              );
            })}
          </Card>
        </div>
      ) : null}

      {confirmed.length + waiting.length + standby.length + invited.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noRoster')}</p>
      ) : null}

      <AddManualForm onAdd={(name, gender) => run(() => addManual.mutateAsync({ name, gender }))} />
      {/* Task 3 inserts the management-actions Card here */}
    </div>
  );
}
```
(Add `import { avatarUrl } from '@/lib/upload';` for the invited rows. The `as unknown as RosterParticipant[]` cast bridges the hook row type to the component subset — drop it if directly assignable.)

- [ ] **Step 5:** `pnpm --filter web typecheck && pnpm --filter web build` → PASS. Commit:
```bash
git add apps/web/src/components/event/manage "apps/web/src/app/(app)/app/event/[id]/manage/page.tsx"
git commit -m "feat(web): event manage roster + payments + add-manual (W4d)"
```

---

## Task 3: management actions (CSV / duplicate / cancel / links)

**Files:** Modify `apps/web/src/app/(app)/app/event/[id]/manage/page.tsx` (add the actions Card).

- [ ] **Step 1:** Add hooks: `const dup = useDuplicateEvent(); const cancelEvent = useCancelEvent(id); const emailCsv = useSendRosterCsvEmail(id);` (imports from `@padel/api`), `import { buildRosterCsv, rosterCsvFilename } from '@padel/utils';`, `import Link from 'next/link';`.
- [ ] **Step 2:** A CSV download handler (client Blob):
```tsx
const onExportCsv = () => {
  const csv = buildRosterCsv(
    rows.map((p) => ({
      user_id: p.user_id,
      guest_name: p.guest_name,
      status: p.status,
      is_standby: p.is_standby,
      joined_at: p.joined_at,
      confirmed_at: p.confirmed_at,
      has_paid: p.has_paid,
      paid_at: p.paid_at,
      profiles: { full_name: p.profiles?.full_name ?? null },
    })),
    { entrance_fee_enabled: !!e.entrance_fee_enabled, entrance_fee_amount: e.entrance_fee_amount ?? null },
  );
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = rosterCsvFilename(e.name, e.starts_at ?? new Date().toISOString());
  a.click();
  URL.revokeObjectURL(url);
};
```
(`RosterParticipant` already includes `user_id/joined_at/confirmed_at/paid_at` from Task 2, so no casts are needed. The participants query exposes them per its `.returns<>()`.)
- [ ] **Step 3:** A cancel `AlertDialog` with recurring branch: if `e.series_id` → two actions (`only_this`, `this_and_upcoming`) with `cancelRecurringTitle`; else a single `only_this` confirm with `cancelStandardTitle`/`cancelStandardBody`. On confirm `run(() => cancelEvent.mutateAsync({ scope }).then(() => router.push('/app/event/'+id)))`.
- [ ] **Step 4:** The actions `Card` (insert at the `{/* Task 3 */}` marker):
```tsx
<Card className="flex flex-col gap-2 p-4">
  <Button asChild variant="outline"><Link href={`/app/event/${id}/edit`}>{t('editEventCta')}</Link></Button>
  <Button asChild variant="outline"><Link href={`/app/event/${id}/manage/blast`}>{t('sendBlastCta')}</Link></Button>
  <Button asChild variant="outline"><Link href={`/app/event/${id}/manage/activity`}>{t('activityLogCta')}</Link></Button>
  <Button variant="outline" onClick={onExportCsv}>{t('exportCsvCta')}</Button>
  <Button variant="outline" onClick={() => run(() => emailCsv.mutateAsync())}>{t('emailCsvCta')}</Button>
  <Button variant="outline" onClick={() => run(() => dup.mutateAsync({ eventId: id, groupId: e.group_id, overrides: {} }).then((newId) => router.push(`/app/event/${newId as string}`)))}>
    {t('duplicateCta')}
  </Button>
  {/* Cancel button opens the AlertDialog from Step 3 */}
  <Button variant="destructive" onClick={() => setCancelOpen(true)}>{t('cancelEventCta')}</Button>
</Card>
```
Add `const [cancelOpen, setCancelOpen] = useState(false);` + the dialog markup.
- [ ] **Step 5:** `pnpm --filter web typecheck && pnpm --filter web build` → PASS. Commit:
```bash
git add "apps/web/src/app/(app)/app/event/[id]/manage/page.tsx" apps/web/src/components/event/manage
git commit -m "feat(web): event manage actions — CSV/duplicate/cancel/links (W4d)"
```

---

## Task 4: blast page

**Files:** Create `apps/web/src/components/event/manage/{BlastComposer,BlastHistory}.tsx`; create `apps/web/src/app/(app)/app/event/[id]/manage/blast/page.tsx`.

- [ ] **Step 1: blast page** (organizer-gated, same gate pattern as the hub). Composer: optional template `Select` (`useBlastTemplates()`); when `useCanCustomizeBlast(id).data === true`, title `Input` + description `Textarea` are editable (prefilled from a chosen template); else require a template selection and use its title/description. **Send** `Button` → `useSendBlast(id).mutate({ sourceTemplateId, title, description, imagePath: undefined, channels: ['email'] })`; on success clear/refresh. Errors mapped inline.
- [ ] **Step 2: `BlastHistory`** — `useEventBlasts(id)` list; for each blast, look up its delivery rows from `useEventBlastDeliveries(id)` (filter by `blast_id`), show the latest `status` mapped to `deliveryDelivered/Pending/Failed` (+ `sent_count`/`failed_count`); a **Retry** `Button` (`useRetryBlast(id).mutate(blast.id)`) when a delivery `status` is failed. Empty → `blastYourEmpty`.
- [ ] **Step 3:** Compose the page from the composer + history. `pnpm --filter web typecheck && pnpm --filter web build` → PASS. Commit:
```bash
git add apps/web/src/components/event/manage "apps/web/src/app/(app)/app/event/[id]/manage/blast/page.tsx"
git commit -m "feat(web): event blast composer + history + retry (W4d)"
```

---

## Task 5: activity page

**Files:** Create `apps/web/src/components/event/manage/ActivityFeed.tsx`; create `apps/web/src/app/(app)/app/event/[id]/manage/activity/page.tsx`.

- [ ] **Step 1: `ActivityFeed`** — props `{ rows }`. Each: avatar (`avatarUrl(profiles?.avatar_url)`) + actor `profiles?.full_name ?? '—'` + a localized action label `t('activity_' + action, { defaultValue: action })` + `new Date(created_at).toLocaleString(i18n.language)`. Empty → a friendly note.
- [ ] **Step 2: activity page** (organizer-gated) — `useEventActivity(id)` → `<ActivityFeed rows={...} />`, title `activityTitle`, loading `Skeleton`.
- [ ] **Step 3:** `pnpm --filter web typecheck && pnpm --filter web build` → PASS. Commit:
```bash
git add apps/web/src/components/event/manage "apps/web/src/app/(app)/app/event/[id]/manage/activity/page.tsx"
git commit -m "feat(web): event activity log (W4d)"
```

---

## Task 6: wire the Manage entry in EventCTA

**Files:** Modify `apps/web/src/components/event/EventCTA.tsx`.

- [ ] **Step 1:** In the organizer branch, replace the disabled **Manage** `Button` + "coming soon" note with a `Link` button → `/app/event/${event.id}/manage`:
```tsx
<Button asChild className="w-full sm:w-auto">
  <Link href={`/app/event/${event.id}/manage`}>{t('manageCta')}</Link>
</Button>
```
Add `import Link from 'next/link';` if not present. Remove the now-unused `comingSoon` note in that branch only (keep it for the in_progress/completed branch). `t('manageCta')` exists (W4b).
- [ ] **Step 2:** `pnpm --filter web typecheck && pnpm --filter web build` → PASS. Commit:
```bash
git add apps/web/src/components/event/EventCTA.tsx
git commit -m "feat(web): wire organizer Manage CTA to manage hub (W4d)"
```

---

## Task 7: Verification

- [ ] **Step 1:** `pnpm --filter web typecheck && pnpm --filter web build` → PASS.
- [ ] **Step 2 (browser, as organizer):** event → **Manage** → roster sections render; mark a player confirmed; toggle paid; **Mark all paid**; **Add manual participant**; remove a player (to invited / from event, with confirm).
- [ ] **Step 3:** **Export CSV** downloads a file; **Email CSV** succeeds; **Duplicate** → lands on a new event; **Cancel** (recurring → only-this vs this-and-upcoming; standalone → single confirm).
- [ ] **Step 4:** **Send blast** (template or custom) → appears in history with a delivery status; retry a failed one. **Activity log** lists actions.
- [ ] **Step 5:** A non-organizer visiting `/manage`, `/manage/blast`, `/manage/activity` is redirected.

---

## Verification (summary)
Per-task typecheck; build after Tasks 2–6; browser smoke (Task 7). Finish via superpowers:finishing-a-development-branch.

## Out of scope
Live match / team assignment / scoring / start / finish (W4e); blast image upload + WhatsApp; co-organizer management.
