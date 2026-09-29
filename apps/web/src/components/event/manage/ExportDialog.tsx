'use client';
/**
 * Export attendance & revenue data (UX-MEVT-19): Download CSV (a file the browser saves) or Send CSV
 * to my email (`send-roster-csv`). Available on every status, completed included (decision 16).
 */
import { useState } from 'react';
import { useT } from '@padel/i18n';
import { useEventParticipants, useSendRosterCsvEmail, type EventDetail } from '@padel/api';
import { buildRosterCsv, rosterCsvFilename } from '@padel/utils';
import { ManageDialog } from './ManageDialog';
import { RadioCards } from './RadioCards';

type Via = 'download' | 'email';

export function ExportDialog({
  event,
  onClose,
  onDone,
}: {
  event: EventDetail;
  onClose: () => void;
  /** Closes the dialog and reports the outcome as a toast. */
  onDone: (message: string) => void;
}) {
  const { t } = useT('event');
  const { t: tc } = useT('common');
  const participants = useEventParticipants(event.id);
  const sendEmail = useSendRosterCsvEmail(event.id);
  const [via, setVia] = useState<Via>('download');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = () => {
    const csv = buildRosterCsv(participants.data ?? [], {
      entrance_fee_enabled: event.entrance_fee_enabled,
      entrance_fee_amount: event.entrance_fee_amount,
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = rosterCsvFilename(event.name, new Date().toISOString().slice(0, 10));
    a.click();
    URL.revokeObjectURL(url);
  };

  const onConfirm = async () => {
    setError(null);
    if (via === 'download') {
      download();
      onClose();
      return;
    }
    setBusy(true);
    try {
      await sendEmail.mutateAsync();
      onDone(t('csvEmailed'));
    } catch (e) {
      setError(t(e instanceof Error ? e.message : 'unknown_error', { defaultValue: t('unknown_error') }));
      setBusy(false);
    }
  };

  return (
    <ManageDialog
      title={t('exportTitle')}
      onClose={onClose}
      primaryLabel={tc('confirm')}
      onPrimary={() => void onConfirm()}
      busy={busy}
      error={error}
      testId="sheet-export"
    >
      <RadioCards<Via>
        label={t('exportTitle')}
        options={[
          { value: 'download', title: t('exportDownloadOption') },
          { value: 'email', title: t('exportEmailOption') },
        ]}
        value={via}
        onChange={setVia}
        testId="export-via"
      />
    </ManageDialog>
  );
}
