/**
 * Cancel (UX-MEVT-21): always a confirmation sheet. A recurring event asks what to cancel — only
 * this event, or this and upcoming ones (`cancel_event` scopes). When anyone has already paid, the
 * sheet says refunds are settled between the organizer and the players: the platform processes
 * none, it only makes the organizer aware before confirming.
 */
import { useCancelEvent, type EventDetail } from '@padel/api';
import { useT } from '@padel/i18n';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { InfoNote } from '../wizard/InfoNote';
import { space } from '../../../theme';
import { RadioCardGroup, Text } from '../../ui';
import { ManageSheet } from './ManageSheet';

type Scope = 'only_this' | 'this_and_upcoming';

export function CancelEventSheet({
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
      setError(t(e instanceof Error ? e.message : 'unknown_error'));
      setBusy(false);
    }
  };

  return (
    <ManageSheet
      title={t(recurring ? 'cancelRecurringSheetTitle' : 'cancelSheetTitle')}
      onClose={onClose}
      primaryLabel={t('cancelConfirmCta')}
      destructive
      onPrimary={() => void onConfirm()}
      busy={busy}
      error={error}
      testID="sheet-cancel"
    >
      <View style={styles.stack}>
        <Text variant="body" tone="muted">
          {t(recurring ? 'cancelRecurringSheetBody' : 'cancelSheetBody')}
        </Text>
        {recurring ? (
          <RadioCardGroup<Scope>
            options={[
              { value: 'only_this', title: t('cancelOnlyThisCta') },
              { value: 'this_and_upcoming', title: t('cancelThisAndUpcomingCta') },
            ]}
            value={scope}
            onChange={setScope}
            testID="cancel-scope"
          />
        ) : null}
        {anyonePaid ? <InfoNote tone="warning" text={t('cancelRefundNote')} testID="cancel-refund-note" /> : null}
      </View>
    </ManageSheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space[4] },
});
