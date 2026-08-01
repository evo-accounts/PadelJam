import { useT } from '@padel/i18n';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { ImagePickerRow } from '@/components/community/ImagePickerRow';
import { pickAndValidateImage } from '@/lib/storage';

import type { WizardStepProps } from '../draft';
import { colors, palette } from '../../../../theme';

export function Step9Details({ draft, patch }: WizardStepProps) {
  const { t } = useT('event');

  const onPickThumbnail = () => {
    void (async () => {
      const result = await pickAndValidateImage().catch(() => null);
      if (result) patch({ thumbnail: result });
    })();
  };

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
          placeholderTextColor={palette.slate[400]}
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
          placeholderTextColor={palette.slate[400]}
          maxLength={500}
          multiline
          textAlignVertical="top"
          accessibilityLabel={t('descriptionLabel')}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t('editThumbnailLabel')}</Text>
        <ImagePickerRow
          label={t('editThumbnailLabel')}
          variant="cover"
          uri={draft.thumbnail?.uri ?? null}
          onPress={onPickThumbnail}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  title: { fontSize: 22, fontWeight: '700', color: colors.foreground },
  field: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: colors.foreground },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  multiline: { minHeight: 120 },
});
