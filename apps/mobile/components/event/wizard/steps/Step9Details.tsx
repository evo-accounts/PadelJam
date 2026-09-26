import { useT } from '@padel/i18n';
import { StyleSheet, View } from 'react-native';

import { ImagePickerRow } from '@/components/community/ImagePickerRow';
import { pickAndValidateImage } from '@/lib/storage';

import type { WizardStepProps } from '../draft';
import { space } from '../../../../theme';
import { Field } from '../../../ui';

/**
 * Details (UX-CEVT-10): name, description and the thumbnail — the same `ImagePickerRow` as Create
 * Group and Create Community, with change and remove on the image once one is set. Presets are
 * blocked on artwork (decision 15), so the row is upload only, as it is in the other two flows.
 */
export function Step9Details({ draft, patch, errors, clearError }: WizardStepProps) {
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
      <Field
        label={t('nameLabel')}
        value={draft.name}
        onChangeText={(name) => {
          patch({ name });
          clearError?.('name');
        }}
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

      <ImagePickerRow
        label={t('thumbnailLabel')}
        variant="cover"
        uri={draft.thumbnail?.uri ?? null}
        onPress={onPickThumbnail}
        onRemove={() => patch({ thumbnail: null, thumbnailPath: undefined })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space[4] },
});
