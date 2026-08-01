import { useT } from '@padel/i18n';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../../theme';

const REASONS = ['harassment', 'inappropriate', 'spam', 'fake', 'other'] as const;

export function BlockModal({ visible, onCancel, onConfirm }: { visible: boolean; onCancel: () => void; onConfirm: () => void }) {
  const { t } = useT('profile');
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t('blockConfirmTitle')}</Text>
          <Text style={styles.body}>{t('blockConfirmBody')}</Text>
          <Pressable style={styles.danger} onPress={onConfirm} accessibilityRole="button">
            <Text style={styles.dangerText}>{t('blockConfirm')}</Text>
          </Pressable>
          <Pressable style={styles.cancel} onPress={onCancel} accessibilityRole="button">
            <Text style={styles.cancelText}>{t('cancel')}</Text>
          </Pressable>
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
          <Text style={styles.title}>{t('reportTitle')}</Text>
          <Text style={styles.label}>{t('reportReason')}</Text>
          <View style={styles.reasons}>
            {REASONS.map((r) => (
              <Pressable key={r} onPress={() => setReason(r)} style={[styles.chip, reason === r && styles.chipActive]} accessibilityRole="button">
                <Text style={[styles.chipText, reason === r && styles.chipTextActive]}>{r}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder={t('reportDescription')} multiline />
          <Pressable style={styles.danger} onPress={() => onSubmit(reason, description)} accessibilityRole="button">
            <Text style={styles.dangerText}>{t('reportSubmit')}</Text>
          </Pressable>
          <Pressable style={styles.cancel} onPress={onCancel} accessibilityRole="button">
            <Text style={styles.cancelText}>{t('cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: colors.card, borderRadius: 16, padding: 20, gap: 10 },
  title: { fontSize: 18, fontWeight: '700', color: colors.foreground },
  body: { fontSize: 14, color: colors.mutedForeground },
  label: { fontSize: 13, fontWeight: '600', color: colors.foreground, marginTop: 4 },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.muted },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontSize: 13, color: colors.foreground },
  chipTextActive: { color: colors.card },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, minHeight: 64, textAlignVertical: 'top' },
  danger: { backgroundColor: colors.destructive, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  dangerText: { color: colors.card, fontWeight: '700' },
  cancel: { paddingVertical: 12, alignItems: 'center' },
  cancelText: { color: colors.mutedForeground, fontWeight: '600' },
});
