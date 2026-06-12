import { useT } from '@padel/i18n';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { WizardStepProps } from '../draft';

export function Step5Location({ draft, patch }: WizardStepProps) {
  const { t } = useT('event');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('step5Title')}</Text>

      <View style={styles.field}>
        <Text style={styles.label}>{t('locationNameLabel')}</Text>
        <TextInput
          style={styles.input}
          value={draft.manualLocationName ?? ''}
          onChangeText={(text) =>
            patch({ manualLocationName: text, hasLocation: text.trim().length > 0 })
          }
          placeholder={t('locationNamePlaceholder')}
          placeholderTextColor="#9AA4B2"
          accessibilityLabel={t('locationNameLabel')}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t('locationAddressLabel')}</Text>
        <TextInput
          style={styles.input}
          value={draft.manualLocationAddress ?? ''}
          onChangeText={(text) => patch({ manualLocationAddress: text })}
          placeholder={t('locationAddressPlaceholder')}
          placeholderTextColor="#9AA4B2"
          accessibilityLabel={t('locationAddressLabel')}
        />
      </View>

      <Pressable
        onPress={() =>
          patch({
            manualLocationName: undefined,
            manualLocationAddress: undefined,
            hasLocation: false,
          })
        }
        accessibilityRole="button"
        hitSlop={8}
      >
        <Text style={styles.skip}>{t('skipLocation')}</Text>
      </Pressable>
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
  skip: { fontSize: 15, fontWeight: '600', color: '#0B7BFF' },
});
