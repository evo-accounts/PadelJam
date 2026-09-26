'use client';
import { useState } from 'react';
import { useT } from '@padel/i18n';
import { guestBlocker, type RosterRoom } from '@padel/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InfoNote } from './InfoNote';
import type { GuestInput } from './invite-logic';
import { SegmentedRadio } from './SegmentedRadio';

type Gender = 'male' | 'female';

/**
 * "+ Add manually" (UX-CEVT-11, decision 7) — web's twin of mobile's GuestSheet, as a Radix dialog
 * (UX-GLOB-02 on web). A guest is a name — and, on a mixed event, a gender — for someone with no
 * access to the app; saving adds them straight to the step's confirmed list. Validated on Save
 * (UX-GLOB-06), and refused here when they would not fit, so the organizer learns it now rather
 * than from `create_event`. The form is mounted fresh on each opening.
 */
export function GuestDialog({
  open,
  onClose,
  mixed,
  room,
  initial,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  mixed: boolean;
  /** The roster WITHOUT the guest being edited, so re-saving them is not refused as one too many. */
  room: RosterRoom;
  /** An existing guest being corrected — typically a missing gender after the event became mixed. */
  initial?: GuestInput;
  onSave: (guest: GuestInput) => void;
}) {
  const { t } = useT('event');
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="sm:max-w-md" data-testid="guest-dialog">
        {open ? <GuestForm mixed={mixed} room={room} initial={initial} onSave={onSave} title={initial ? t('guestSheetEditTitle') : t('guestSheetTitle')} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function GuestForm({
  title,
  mixed,
  room,
  initial,
  onSave,
}: {
  title: string;
  mixed: boolean;
  room: RosterRoom;
  initial?: GuestInput;
  onSave: (guest: GuestInput) => void;
}) {
  const { t } = useT('event');
  const [name, setName] = useState(initial?.name ?? '');
  const [gender, setGender] = useState<Gender | ''>(initial?.gender ?? '');
  const [errors, setErrors] = useState<string[]>([]);
  const blocker = guestBlocker(room, mixed ? gender || null : null);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const failing: string[] = [];
    if (!name.trim()) failing.push('name');
    if (mixed && !gender) failing.push('gender');
    if (blocker) failing.push('capacity');
    setErrors(failing);
    if (failing.length) return;
    onSave({ name, gender: mixed && gender ? gender : undefined });
  };

  const badName = errors.includes('name');
  const badGender = errors.includes('gender');
  return (
    <form onSubmit={save} className="flex flex-col gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="sr-only">{t('guestNote')}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor="guest-name">{t('guestNameLabel')}</Label>
        <Input
          id="guest-name"
          autoFocus
          autoCapitalize="words"
          autoComplete="off"
          maxLength={60}
          placeholder={t('guestNamePlaceholder')}
          value={name}
          aria-invalid={badName || undefined}
          aria-describedby={badName ? 'guest-name-error' : undefined}
          onChange={(e) => {
            setName(e.target.value);
            setErrors((x) => x.filter((k) => k !== 'name'));
          }}
          data-testid="guest-name"
        />
        {badName ? (
          <p id="guest-name-error" className="text-sm text-destructive">
            {t('guestNameRequired')}
          </p>
        ) : null}
      </div>
      {mixed ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('guestGenderLabel')}</span>
          <SegmentedRadio<Gender | ''>
            label={t('guestGenderLabel')}
            options={[
              { value: 'male', label: t('genderMale') },
              { value: 'female', label: t('genderFemale') },
            ]}
            value={gender}
            onChange={(g) => {
              setGender(g);
              setErrors((x) => x.filter((k) => k !== 'gender' && k !== 'capacity'));
            }}
            testId="guest-gender"
          />
          {badGender ? (
            <p role="alert" className="text-sm text-destructive">
              {t('guestGenderRequired')}
            </p>
          ) : null}
        </div>
      ) : null}
      {errors.includes('capacity') && blocker ? (
        <InfoNote
          tone="warning"
          text={blocker === 'gender_full' ? t('guestGenderFull') : t('guestEventFull')}
          testId="guest-capacity-warning"
        />
      ) : null}
      <InfoNote text={t('guestNote')} testId="guest-note" />
      <Button type="submit" className="w-full" data-testid="guest-save">
        {t('guestSave')}
      </Button>
    </form>
  );
}
