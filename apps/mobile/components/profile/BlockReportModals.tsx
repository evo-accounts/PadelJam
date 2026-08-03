import { useT } from '@padel/i18n';
import { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { Button, Chip, Field, Text } from '../ui';
import { colors } from '../../theme';

const REASONS = ['harassment', 'inappropriate', 'spam', 'fake', 'other'] as const;

export function BlockModal({ visible, onCancel, onConfirm }: { visible: boolean; onCancel: () => void; onConfirm: () => void }) {
  const { t } = useT('profile');
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text variant="heading">{t('blockConfirmTitle')}</Text>
          <Text variant="caption" tone="muted">{t('blockConfirmBody')}</Text>
          <Button variant="destructive" fullWidth label={t('blockConfirm')} onPress={onConfirm} />
          <Button variant="ghost" fullWidth label={t('cancel')} onPress={onCancel} />
        </View>
      </View>
    </Modal>
  );
}

export function ReportModal({
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
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text variant="heading">{t('reportTitle')}</Text>
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
          <Button variant="ghost" fullWidth label={t('cancel')} onPress={onCancel} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: colors.card, borderRadius: 16, padding: 20, gap: 10 },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
