import { useT } from '@padel/i18n';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomSheet, Button, Chip, Field, Text } from '../ui';

const REASONS = ['harassment', 'inappropriate', 'spam', 'fake', 'other'] as const;

// The block confirmation is no longer a component here: blocking is one item
// in ProfileView's ••• action sheet, and a destructive action sheet row is
// confirmed automatically by useActionSheet (see sheetApi.ts) — a second,
// hand-rolled confirm modal would just be the same dialog rendered twice.

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
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [description, setDescription] = useState('');
  return (
    <BottomSheet visible={visible} onClose={onCancel} title={t('reportTitle')} testID="report-sheet">
      <Text variant="label">{t('reportReason')}</Text>
      <View style={styles.reasons}>
        {REASONS.map((r) => (
          // These were a single-select group whose selection was conveyed by
          // BACKGROUND COLOUR ALONE — no accessibilityState, so a screen
          // reader announced five identical buttons. `Chip` carries
          // `selected`, which is the fix; it is also the sixth time this
          // exact gap has turned up during the migration.
          <Chip key={r} label={r} selected={reason === r} onPress={() => setReason(r)} />
        ))}
      </View>
      <Field
        value={description}
        onChangeText={setDescription}
        placeholder={t('reportDescription')}
        multiline
      />
      <Button
        variant="destructive"
        fullWidth
        label={t('reportSubmit')}
        onPress={() => onSubmit(reason, description)}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
});
