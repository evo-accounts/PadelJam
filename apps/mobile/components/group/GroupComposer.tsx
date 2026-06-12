import { createGroupSchema, updateGroupSchema } from '@padel/api';
import { useT } from '@padel/i18n';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ImagePickerRow } from '@/components/community/ImagePickerRow';
import { pickAndValidateImage, type PickedImage } from '@/lib/storage';

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
  error,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  initial?: GroupComposerInitial;
  submitting: boolean;
  error?: string | null;
  onSubmit: (values: GroupComposerValues) => void;
}) {
  const { t } = useT('group');

  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [isPrivate, setIsPrivate] = useState(initial?.isPrivate ?? false);
  const [thumbnail, setThumbnail] = useState<PickedImage | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const previewUri = thumbnail?.uri ?? initial?.thumbnailUrl ?? null;

  const pickThumbnail = async () => {
    setPickError(null);
    try {
      const picked = await pickAndValidateImage();
      if (picked) setThumbnail(picked);
    } catch (e) {
      setPickError(t(e instanceof Error ? e.message : 'unknown_error'));
    }
  };

  const submit = () => {
    if (submitting) return;
    setValidationError(null);

    const trimmedName = name.trim();
    const trimmedDescription = description.trim() || undefined;

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
      const nameIssue = parsed.error.issues.find((i) => i.path.includes('name'));
      setValidationError(t(nameIssue ? 'name_required' : 'unknown_error'));
      return;
    }

    onSubmit({
      name: trimmedName,
      description: trimmedDescription,
      isPrivate,
      thumbnail,
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('nameLabel')}</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder={t('namePlaceholder')}
        editable={!submitting}
      />

      <Text style={styles.label}>{t('descriptionLabel')}</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder={t('descriptionPlaceholder')}
        multiline
        editable={!submitting}
      />

      <ImagePickerRow
        label={t('thumbnailLabel')}
        variant="square"
        uri={previewUri}
        onPress={pickThumbnail}
        disabled={submitting}
      />
      {pickError ? <Text style={styles.error}>{pickError}</Text> : null}

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

      {validationError ? <Text style={styles.error}>{validationError}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.button, submitting && styles.buttonDisabled]}
        onPress={submit}
        disabled={submitting}
        accessibilityRole="button"
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{mode === 'create' ? t('createCta') : t('saveCta')}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 0 },
  label: { fontSize: 14, color: '#444', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  privacyText: { flex: 1, paddingRight: 12 },
  privacyTitle: { fontSize: 15, fontWeight: '600', color: '#0B1F3A' },
  privacyHelp: { fontSize: 13, color: '#666', marginTop: 2 },
  error: { color: '#c0392b', marginBottom: 16 },
  button: {
    backgroundColor: '#0B1F3A',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
