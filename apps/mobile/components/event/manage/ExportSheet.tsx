/**
 * Export attendance & revenue data (UX-MEVT-19): Download CSV (the device's share sheet) or Send
 * CSV to my email (`send-roster-csv`). Available on every status, completed included (decision 16).
 */
import { useSendRosterCsvEmail, useEventParticipants, type EventDetail } from '@padel/api';
import { useT } from '@padel/i18n';
import { buildRosterCsv, rosterCsvFilename } from '@padel/utils';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';

import { RadioCardGroup } from '../../ui';
import { ManageSheet } from './ManageSheet';

type Via = 'download' | 'email';

export function ExportSheet({
  event,
  onClose,
  onDone,
}: {
  event: EventDetail;
  onClose: () => void;
  /** Closes the sheet and reports the outcome as a banner message. */
  onDone: (message: string, tone: 'success' | 'error') => void;
}) {
  const { t } = useT('event');
  const { t: tc } = useT('common');
  const { data: participants } = useEventParticipants(event.id);
  const sendEmail = useSendRosterCsvEmail(event.id);
  const [via, setVia] = useState<Via>('download');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    const csv = buildRosterCsv(participants ?? [], {
      entrance_fee_enabled: event.entrance_fee_enabled,
      entrance_fee_amount: event.entrance_fee_amount,
    });
    const filename = rosterCsvFilename(event.name, new Date().toISOString().slice(0, 10));
    const uri = FileSystem.documentDirectory + filename;
    await FileSystem.writeAsStringAsync(uri, csv);
    // The share sheet is a native modal of its own: close this one first, and let it finish
    // dismissing, so iOS never refuses to present one over the other.
    onClose();
    await new Promise((resolve) => setTimeout(resolve, 450));
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: filename });
    } else {
      await Clipboard.setStringAsync(csv);
      onDone(t('exportUnavailable'), 'error');
    }
  };

  const onConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      if (via === 'download') {
        await download();
      } else {
        await sendEmail.mutateAsync();
        onDone(t('csvEmailed'), 'success');
      }
    } catch (e) {
      setError(t(e instanceof Error ? e.message : 'unknown_error'));
      setBusy(false);
    }
  };

  return (
    <ManageSheet
      title={t('exportTitle')}
      onClose={onClose}
      primaryLabel={tc('confirm')}
      onPrimary={() => void onConfirm()}
      busy={busy}
      error={error}
      testID="sheet-export"
    >
      <RadioCardGroup<Via>
        options={[
          { value: 'download', title: t('exportDownloadOption') },
          { value: 'email', title: t('exportEmailOption') },
        ]}
        value={via}
        onChange={setVia}
        testID="export-via"
      />
    </ManageSheet>
  );
}
