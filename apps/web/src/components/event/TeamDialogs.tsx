'use client';
/**
 * The dialogs of the web team-event flow (UX-JEVT-09, 10, 13) — web's twin of mobile's
 * `components/event/TeamSheets.tsx`, as Radix dialogs (UX-GLOB-02 on web).
 *
 *   TeamEventDialog     "Team Event" — how do you want to set your team? I have / I need a partner.
 *   EditResponseDialog  an interested player's "Edit response": found / need a partner, Leave event.
 *   GuestPartnerDialog  "+ Add manually": a partner with no access to the app, for this event only.
 */
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type TeamChoice = 'have' | 'need';
export type EditChoice = TeamChoice | 'leave';

type Row<K extends string> = { key: K; label: string; destructive?: boolean; testId: string };

function ChoiceDialog<K extends string>({
  open,
  onClose,
  onChoose,
  title,
  body,
  rows,
  testId,
}: {
  open: boolean;
  onClose: () => void;
  onChoose: (key: K) => void;
  title: string;
  body?: string;
  rows: Row<K>[];
  testId: string;
}) {
  const { t } = useT('event');
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent data-testid={testId}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {body ? <DialogDescription>{body}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
        </DialogHeader>
        <div className="flex flex-col divide-y rounded-xl border">
          {rows.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => {
                onClose();
                onChoose(r.key);
              }}
              className={cn(
                'flex w-full items-center gap-3 px-4 py-3 text-left font-medium transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-accent/50',
                r.destructive && 'text-destructive',
              )}
              data-testid={r.testId}
            >
              <span className="flex-1">{r.label}</span>
              {r.destructive ? null : <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" className="w-full" onClick={onClose} data-testid={`${testId}-cancel`}>
            {t('cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** UX-JEVT-09: behind a team event's "Join", an invitee's "Accept" and the organizer's "Join as a player". */
export function TeamEventDialog(props: { open: boolean; onClose: () => void; onChoose: (c: TeamChoice) => void }) {
  const { t } = useT('event');
  return (
    <ChoiceDialog<TeamChoice>
      {...props}
      title={t('teamSheetTitle')}
      body={t('teamSheetBody')}
      rows={[
        { key: 'have', label: t('havePartnerTitle'), testId: 'team-sheet-have' },
        { key: 'need', label: t('needPartnerTitle'), testId: 'team-sheet-need' },
      ]}
      testId="team-sheet"
    />
  );
}

/**
 * UX-JEVT-13: "Edit response" for a player marked interested. `canLeave` is false for an organizer
 * past the leave deadline — they remove themselves from Manage, as in the ⋯ menu.
 */
export function EditResponseDialog({
  canLeave = true,
  ...props
}: {
  open: boolean;
  onClose: () => void;
  onChoose: (c: EditChoice) => void;
  canLeave?: boolean;
}) {
  const { t } = useT('event');
  const rows: Row<EditChoice>[] = [
    { key: 'have', label: t('foundPartnerRow'), testId: 'edit-response-have' },
    { key: 'need', label: t('needPartnerTitle'), testId: 'edit-response-need' },
  ];
  if (canLeave) rows.push({ key: 'leave', label: t('leaveCta'), destructive: true, testId: 'edit-response-leave' });
  return <ChoiceDialog<EditChoice> {...props} title={t('editResponseCta')} rows={rows} testId="edit-response-sheet" />;
}

/**
 * UX-JEVT-10 "Add manually": a guest partner (decision 7) — a name, confirmed for this event only,
 * no history, no ranking, not reusable. Saving confirms the pair like picking a player does.
 */
export function GuestPartnerDialog({
  open,
  onClose,
  onSave,
  saving,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  saving: boolean;
  error: string | null;
}) {
  const { t } = useT('event');
  const [name, setName] = useState('');
  const trimmed = name.trim();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) return;
        setName('');
        onClose();
      }}
    >
      <DialogContent data-testid="guest-partner-sheet">
        <DialogHeader>
          <DialogTitle>{t('guestPartnerTitle')}</DialogTitle>
          <DialogDescription>{t('guestPartnerNote')}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (trimmed.length > 0 && !saving) onSave(trimmed);
          }}
        >
          <Label htmlFor="guest-partner-name">{t('guestPartnerNameLabel')}</Label>
          <Input
            id="guest-partner-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoComplete="off"
            autoFocus
            aria-invalid={error != null}
            aria-describedby={error ? 'guest-partner-error' : undefined}
            data-testid="guest-partner-name"
          />
          {error ? (
            <p id="guest-partner-error" className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter className="mt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={trimmed.length === 0 || saving} data-testid="guest-partner-save">
              {t('guestPartnerSave')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
