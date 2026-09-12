import { useT } from '@padel/i18n';
import { StyleSheet, Text, View } from 'react-native';

import { ImagePickerRow } from '@/components/community/ImagePickerRow';
import { pickAndValidateImage } from '@/lib/storage';

import type { WizardStepProps } from '../draft';
import { colors } from '../../../../theme';
import { Field } from '../../../ui';

export function Step9Details({ draft, patch, errors }: WizardStepProps) {
  const { t } = useT('event');
  const { t: tc } = useT('common');

  const onPickThumbnail = () => {
    void (async () => {
      const result = await pickAndValidateImage().catch(() => null);
      if (result) patch({ thumbnail: result });
    })();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('step9Title')}</Text>

      <Field
        label={t('nameLabel')}
        value={draft.name}
        onChangeText={(name) => patch({ name })}
        placeholder={t('namePlaceholder')}
        maxLength={80}
        error={errors?.includes('name') ? tc('required') : undefined}
      />

      <Field
        label={t('descriptionLabel')}
        value={draft.description ?? ''}
        onChangeText={(text) => patch({ description: text || undefined })}
        placeholder={t('descriptionPlaceholder')}
        maxLength={500}
        multiline
      />

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
});
