import { createGroupSchema, updateGroupSchema } from '@padel/api';
import { useT } from '@padel/i18n';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { ImagePickerRow } from '@/components/community/ImagePickerRow';
import { pickAndValidateImage, type PickedImage } from '@/lib/storage';
import { isDirty } from '@/lib/useDirty';
import { useFieldErrors } from '@/lib/useFieldErrors';
import { colors } from '../../theme';
import { Field, useBanner } from '../ui';
import { validateGroupComposer, type GroupComposerFieldKey } from './groupComposerValidate';

export type GroupComposerValues = {
  name: string;
  description: string | undefined;
  isPrivate: boolean;
  /** Newly picked image to upload, or null when unchanged / unset. */
  thumbnail: PickedImage | null;
};

export type GroupComposerInitial = {
  name?: string;
  description?: string | null;
  isPrivate?: boolean;
  /** Existing stored thumbnail path, used only to render the current preview. */
  thumbnailPath?: string | null;
  /** Resolved public URL for the existing thumbnail, if any. */
  thumbnailUrl?: string | null;
};

/**
 * Create/edit form body for a group, shared by the create modal and the settings
 * screen. Manages name / description / privacy / thumbnail locally and validates
 * with the relevant @padel/api schema before calling `onSubmit`. The actual
 * thumbnail upload + RPC are left to the caller: `onSubmit` receives the picked
 * image so the screen can upload it (groups reuse the community-thumbnails bucket)
 * and then call the create/update mutation.
 */
export function GroupComposer({
  mode,
  initial,
  submitting,
  onSubmit,
  onDirtyChange,
}: {
  mode: 'create' | 'edit';
  initial?: GroupComposerInitial;
  submitting: boolean;
  onSubmit: (values: GroupComposerValues) => void;
  /** Reports whether the form differs from `initial`, so the caller's TopBar can confirm before closing. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { t } = useT('group');
  const { t: tc } = useT('common');
  const banner = useBanner();

  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [isPrivate, setIsPrivate] = useState(initial?.isPrivate ?? false);
  const [thumbnail, setThumbnail] = useState<PickedImage | null>(null);
  const { errors: fieldErrors, setErrors: setFieldErrors, clear: clearFieldError } = useFieldErrors<GroupComposerFieldKey>();

  const previewUri = thumbnail?.uri ?? initial?.thumbnailUrl ?? null;

  useEffect(() => {
    const dirty =
      thumbnail != null ||
      isDirty(
        { name, description, isPrivate },
        { name: initial?.name ?? '', description: initial?.description ?? '', isPrivate: initial?.isPrivate ?? false },
      );
    onDirtyChange?.(dirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, description, isPrivate, thumbnail]);

  const pickThumbnail = async () => {
    try {
      const picked = await pickAndValidateImage();
      if (picked) setThumbnail(picked);
    } catch (e) {
      banner.show(t(e instanceof Error ? e.message : 'unknown_error'));
    }
  };

  const submit = () => {
    if (submitting) return;

    const trimmedName = name.trim();
    const trimmedDescription = description.trim() || undefined;

    const errors = validateGroupComposer({ name: trimmedName });
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      banner.show(tc('missingInformation'));
      return;
    }

    const schema =
      mode === 'create'
        ? createGroupSchema.pick({ name: true, description: true, isPrivate: true })
        : updateGroupSchema;
    const parsed = schema.safeParse({
      name: trimmedName,
      description: trimmedDescription,
      isPrivate,
    });

    if (!parsed.success) {
      banner.show(tc('missingInformation'));
      return;
    }
    setFieldErrors({});

    onSubmit({
      name: trimmedName,
      description: trimmedDescription,
      isPrivate,
      thumbnail,
    });
  };

  return (
    <View style={styles.container}>
      <Field
        label={t('nameLabel')}
        value={name}
        onChangeText={(v) => { setName(v); clearFieldError('name'); }}
        placeholder={t('namePlaceholder')}
        editable={!submitting}
        error={fieldErrors.name ? t(fieldErrors.name) : undefined}
        containerStyle={styles.field}
      />

      <Field
        label={t('descriptionLabel')}
        value={description}
        onChangeText={setDescription}
        placeholder={t('descriptionPlaceholder')}
        multiline
        editable={!submitting}
        containerStyle={styles.field}
      />

      <ImagePickerRow
        label={t('thumbnailLabel')}
        variant="square"
        uri={previewUri}
        onPress={pickThumbnail}
        disabled={submitting}
      />

      <Text style={styles.label}>{t('privacyLabel')}</Text>
      <View style={styles.privacyRow}>
        <View style={styles.privacyText}>
          <Text style={styles.privacyTitle}>
            {isPrivate ? t('privatePrivateLabel') : t('privatePublicLabel')}
          </Text>
          <Text style={styles.privacyHelp}>{t('privateHelp')}</Text>
        </View>
        <Switch value={isPrivate} onValueChange={setIsPrivate} disabled={submitting} />
      </View>

      <Pressable
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={submit}
        disabled={submitting}
        accessibilityRole="button"
      >
        {submitting ? (
          <ActivityIndicator color={colors.card} />
        ) : (
          <Text style={styles.buttonText}>{mode === 'create' ? t('createCta') : t('saveCta')}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 0 },
  label: { fontSize: 14, color: colors.mutedForeground, marginBottom: 8 },
  field: { marginBottom: 16 },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  privacyText: { flex: 1, paddingRight: 12 },
  privacyTitle: { fontSize: 15, fontWeight: '600', color: colors.foreground },
  privacyHelp: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.card, fontSize: 16, fontWeight: '600' },
});
