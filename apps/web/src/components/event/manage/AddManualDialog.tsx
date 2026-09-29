'use client';
/**
 * Add manually (UX-MEVT-11): a guest — someone without the app — created and confirmed for this
 * event only. Web's twin of mobile's `AddManualSheet`, on the Manage dialog chrome. Reached from
 * the Manage players header on a public group event and from the Invite page.
 *
 * A single Name field; a mixed event also asks the gender — male / female only, since the rotation
 * pairs one of each (UX-MEVT-25) — and the guest counts towards that side. Other modalities never
 * ask (B15: the old form always showed a gender select, "Other" included).
 *
 * `add_manual_participant` (0121) refuses a full event, a full side, a missing gender on a mixed
 * event and a name over 60 characters; each refusal is shown in the dialog's footer. Success
 * closes the dialog and the caller raises the toast.
 */
import { useState } from 'react';
import { useT } from '@padel/i18n';
import { useAddManualParticipant } from '@padel/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ManageDialog } from './ManageDialog';
import { rosterErrorKey } from './manageRoster';

type Gender = 'female' | 'male';

export function AddManualDialog({
  eventId,
  mixed,
  onClose,
  onAdded,
}: {
  eventId: string;
  mixed: boolean;
  onClose: () => void;
  /** Called with the guest's name once they are on the roster. */
  onAdded: (name: string) => void;
}) {
  const { t } = useT('event');
  const add = useAddManualParticipant(eventId);
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setNameError(t('manualNameRequired'));
      return;
    }
    if (mixed && gender == null) {
      setError(t('mpGenderRequired'));
      return;
    }
    setError(null);
    setNameError(null);
    try {
      await add.mutateAsync({ name: trimmed, gender: mixed && gender ? gender : undefined });
      onAdded(trimmed);
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      setError(t(rosterErrorKey(code), { defaultValue: t('unknown_error') }));
    }
  };

  return (
    <ManageDialog
      title={t('addManuallyCta')}
      onClose={onClose}
      primaryLabel={t('sheetSave')}
      onPrimary={() => void save()}
      busy={add.isPending}
      error={error}
      testId="dialog-add-manual"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="add-manual-name">{t('mpManualNameLabel')}</Label>
        <Input
          id="add-manual-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
          }}
          maxLength={60}
          autoComplete="off"
          autoFocus
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? 'add-manual-name-error' : undefined}
          data-testid="add-manual-name"
        />
        {nameError ? (
          <p id="add-manual-name-error" className="text-sm text-destructive">
            {nameError}
          </p>
        ) : null}
      </div>
      {mixed ? (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">{t('manualGenderLabel')}</legend>
          <div className="grid grid-cols-2 gap-2" data-testid="add-manual-gender">
            {(['female', 'male'] as const).map((g) => (
              <label
                key={g}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
                  gender === g ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                )}
              >
                <input
                  type="radio"
                  name="add-manual-gender"
                  value={g}
                  checked={gender === g}
                  onChange={() => {
                    setGender(g);
                    setError(null);
                  }}
                  className="size-4 accent-primary"
                  data-testid={`add-manual-gender-${g}`}
                />
                {g === 'female' ? t('genderFemale') : t('genderMale')}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p>{t('mpManualNote')}</p>
        <p>{t('mpManualNoteNoApp')}</p>
      </div>
    </ManageDialog>
  );
}
