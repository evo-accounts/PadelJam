import { useT } from '@padel/i18n';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { WizardStepProps } from '../draft';

export function Step9Details({ draft, patch }: WizardStepProps) {
  const { t } = useT('event');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('step9Title')}</Text>

      <View style={styles.field}>
        <Text style={styles.label}>{t('nameLabel')}</Text>
        <TextInput
          style={styles.input}
          value={draft.name}
          onChangeText={(name) => patch({ name })}
          placeholder={t('namePlaceholder')}
          placeholderTextColor="#9AA4B2"
          maxLength={80}
          accessibilityLabel={t('nameLabel')}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t('descriptionLabel')}</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={draft.description ?? ''}
          onChangeText={(text) => patch({ description: text || undefined })}
          placeholder={t('descriptionPlaceholder')}
          placeholderTextColor="#9AA4B2"
          maxLength={500}
          multiline
          textAlignVertical="top"
          accessibilityLabel={t('descriptionLabel')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#0B1F3A' },
  field: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: '#0B1F3A' },
  input: {
    borderWidth: 1,
    borderColor: '#E6EAF0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0B1F3A',
    backgroundColor: '#fff',
  },
  multiline: { minHeight: 120 },
});
