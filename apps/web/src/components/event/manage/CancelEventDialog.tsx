'use client';
/**
 * Cancel (UX-MEVT-21): always a confirmation. A recurring event asks what to cancel — only this
 * event, or this and upcoming ones (`cancel_event` scopes). When anyone has already paid, the
 * dialog says refunds are settled between the organizer and the players: the platform processes
 * none, it only makes the organizer aware before confirming.
 */
import { useState } from 'react';
import { useT } from '@padel/i18n';
import { useCancelEvent, type EventDetail } from '@padel/api';
import { InfoNote } from '../wizard/InfoNote';
import { ManageDialog } from './ManageDialog';
import { RadioCards } from './RadioCards';

type Scope = 'only_this' | 'this_and_upcoming';

export function CancelEventDialog({
  event,
  recurring,
  anyonePaid,
  onClose,
  onCancelled,
}: {
  event: EventDetail;
  recurring: boolean;
  anyonePaid: boolean;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const { t } = useT('event');
  const cancel = useCancelEvent(event.id);
  const [scope, setScope] = useState<Scope>('only_this');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await cancel.mutateAsync({ scope: recurring ? scope : 'only_this' });
      onCancelled();
    } catch (e) {
      setError(t(e instanceof Error ? e.message : 'unknown_error', { defaultValue: t('unknown_error') }));
      setBusy(false);
    }
  };

  return (
    <ManageDialog
      title={t(recurring ? 'cancelRecurringSheetTitle' : 'cancelSheetTitle')}
      onClose={onClose}
      primaryLabel={t('cancelConfirmCta')}
      destructive
      onPrimary={() => void onConfirm()}
      busy={busy}
      error={error}
      testId="sheet-cancel"
    >
      <p className="text-sm text-muted-foreground">{t(recurring ? 'cancelRecurringSheetBody' : 'cancelSheetBody')}</p>
      {recurring ? (
        <RadioCards<Scope>
          label={t('cancelRecurringSheetTitle')}
          options={[
            { value: 'only_this', title: t('cancelOnlyThisCta') },
            { value: 'this_and_upcoming', title: t('cancelThisAndUpcomingCta') },
          ]}
          value={scope}
          onChange={setScope}
          testId="cancel-scope"
        />
      ) : null}
      {anyonePaid ? <InfoNote tone="warning" text={t('cancelRefundNote')} testId="cancel-refund-note" /> : null}
    </ManageDialog>
  );
}
