import { createGroupSchema, updateGroupSchema } from '@padel/api';
import { useT } from '@padel/i18n';
import { useEffect, useState, type MutableRefObject } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { ImagePickerRow } from '@/components/community/ImagePickerRow';
import { pickAndValidateImage, type PickedImage } from '@/lib/storage';
import { isDirty } from '@/lib/useDirty';
import { useFieldErrors } from '@/lib/useFieldErrors';
import { colors, radius, space } from '../../theme';
import { Field, Text, useBanner } from '../ui';
import { validateGroupComposer, type GroupComposerFieldKey } from './groupComposerValidate';

export type GroupComposerValues = {
  name: string;
  description: string | undefined;
  isPrivate: boolean;
  /** Newly picked image to upload, or null when unchanged / unset. */
  thumbnail: PickedImage | null;
  /** The existing thumbnail was removed (edit mode): store none. */
  removeThumbnail: boolean;
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
 * Create/edit form body for a group, shared by Create Group and Group Settings (UX-GRP-01/11 — the
 * same form). The primary button is NOT here: both screens fix it to the bottom, outside the
 * scroll, and trigger `submitRef.current()`. It stays enabled and validates on tap, saying what is
 * missing (UX-GLOB-06; the product owner kept this over UX-GRP-01's "disabled until filled").
 *
 * Originally: create/edit form body for a group, shared by the create modal and the settings
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
  submitRef,
}: {
  mode: 'create' | 'edit';
  initial?: GroupComposerInitial;
  submitting: boolean;
  onSubmit: (values: GroupComposerValues) => void;
  /** Reports whether the form differs from `initial`, so the caller's TopBar can confirm before closing. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Filled with this form's submit, for the screen's fixed footer button to call. */
  submitRef: MutableRefObject<(() => void) | null>;
}) {
  const { t } = useT('group');
  const { t: tc } = useT('common');
  const banner = useBanner();

  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [isPrivate, setIsPrivate] = useState(initial?.isPrivate ?? false);
  const [thumbnail, setThumbnail] = useState<PickedImage | null>(null);
  const [removed, setRemoved] = useState(false);
  const { errors: fieldErrors, setErrors: setFieldErrors, clear: clearFieldError } = useFieldErrors<GroupComposerFieldKey>();

  const previewUri = thumbnail?.uri ?? (removed ? null : (initial?.thumbnailUrl ?? null));

  useEffect(() => {
    const dirty =
      thumbnail != null ||
      removed ||
      isDirty(
        { name, description, isPrivate },
        { name: initial?.name ?? '', description: initial?.description ?? '', isPrivate: initial?.isPrivate ?? false },
      );
    onDirtyChange?.(dirty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, description, isPrivate, thumbnail, removed]);

  const pickThumbnail = async () => {
    try {
      const picked = await pickAndValidateImage();
      if (picked) {
        setThumbnail(picked);
        setRemoved(false);
      }
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
      removeThumbnail: removed && thumbnail == null,
    });
  };
  // The fixed footer lives in the screen; it calls whatever submit this render produced.
  useEffect(() => {
    submitRef.current = submit;
  });

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
        onRemove={
          previewUri
            ? () => {
                setThumbnail(null);
                setRemoved(true);
              }
            : undefined
        }
        disabled={submitting}
      />

      {/* UX-GRP-01: the privacy toggle inside a card, its description saying what it means. */}
      <View style={styles.privacyCard}>
        <View style={styles.privacyText}>
          <Text variant="label">{t('privateToggleLabel')}</Text>
          <Text variant="caption" tone="muted">
            {t('privateHelp')}
          </Text>
        </View>
        <Switch
          value={isPrivate}
          onValueChange={setIsPrivate}
          disabled={submitting}
          accessibilityLabel={t('privateToggleLabel')}
          testID="group-private-toggle"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 0 },
  field: { marginBottom: space[4] },
  privacyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space[4],
    marginTop: space[4],
  },
  privacyText: { flex: 1, gap: space[1] },
});
