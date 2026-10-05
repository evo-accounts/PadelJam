import { useT } from '@padel/i18n';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomSheet, Button, Field, ListRow, Text } from '../ui';

/**
 * The five values the `reports.reason` CHECK constraint accepts (migration 0055). The strings sent
 * to the database are these literals and must stay exactly as they are; only the LABELS are copy.
 *
 * That separation is the fix for UX-PROF-04. This file used to render `<Chip label={r} />` straight
 * off this array, so every locale showed "harassment", "inappropriate", "spam", "fake", "other" —
 * raw database enum values, in English, on a screen that is otherwise translated. It is also why
 * the audit said the report flow "is not in the same language as the rest of the app".
 */
const REASONS = ['harassment', 'inappropriate', 'spam', 'fake', 'other'] as const;
type Reason = (typeof REASONS)[number];

const REASON_KEYS: Record<Reason, string> = {
  harassment: 'reasonHarassment',
  inappropriate: 'reasonInappropriate',
  spam: 'reasonSpam',
  fake: 'reasonFake',
  other: 'reasonOther',
};

// The block confirmation is not a component here: blocking is one item in ProfileView's ••• sheet
// and opens its own BottomSheet there, so the consequence copy UX-PROF-03 asks for sits next to
// the action rather than in a second file.

export function ReportSheet({
  visible,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (reason: string, description: string) => void;
}) {
  const { t } = useT('profile');
  const [reason, setReason] = useState<Reason>(REASONS[0]);
  const [description, setDescription] = useState('');
  const [picking, setPicking] = useState(false);

  const close = () => {
    setPicking(false);
    onCancel();
  };

  /**
   * UX-PROF-04 wants the reason selector to open "as its own bottom sheet". It does — as the SAME
   * sheet, re-presented with the picker's title and rows, then swapped back.
   *
   * Two stacked sheets was the obvious reading and does not work: a `BottomSheet` is a React Native
   * `Modal`, a second Modal rendered beside a presented one simply never appears, and `SheetQueue`
   * is explicitly one-request-at-a-time ("opening a new request while one is open dismisses the old
   * one"). Swapping content is the pattern the codebase already uses for the destructive-row ->
   * confirm hand-off, and it is documented as such on `SheetPresence.waitClosed`.
   *
   * The form's state lives in this component and the sheet only toggles `visible`, so the typed
   * description survives the round trip.
   */
  return (
    <BottomSheet
      visible={visible}
      onClose={picking ? () => setPicking(false) : close}
      title={picking ? t('reportReasonPick') : t('reportTitle')}
      testID={picking ? 'report-reason-sheet' : 'report-sheet'}
    >
      {picking ? (
        REASONS.map((r) => (
          <ListRow
            key={r}
            variant="card"
            title={t(REASON_KEYS[r])}
            selected={r === reason}
            onPress={() => {
              setReason(r);
              setPicking(false);
            }}
            testID={`report-reason-${r}`}
          />
        ))
      ) : (
        <>
          <Text variant="label">{t('reportReason')}</Text>
          <ListRow
            variant="card"
            title={t(REASON_KEYS[reason])}
            onPress={() => setPicking(true)}
            testID="report-reason-row"
          />
          <Field
            value={description}
            onChangeText={setDescription}
            placeholder={t('reportDescription')}
            multiline
          />
          <View style={styles.actions}>
            <Button
              variant="destructive"
              fullWidth
              label={t('reportSubmit')}
              onPress={() => onSubmit(reason, description)}
              testID="report-submit"
            />
            <Button variant="tertiary" fullWidth label={t('cancel')} onPress={close} />
          </View>
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 8, marginTop: 8 },
});
