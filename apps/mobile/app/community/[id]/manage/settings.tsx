import {
  COMMUNITY_TYPES,
  PRIVACY,
  createCommunitySchema,
  useCommunity,
  useUpdateCommunity,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ImagePickerRow } from '@/components/community/ImagePickerRow';
import { PrivacyCards } from '@/components/community/PrivacyCards';
import { RulesToggle } from '@/components/community/RulesToggle';
import { SegmentedType } from '@/components/community/SegmentedType';
import { coverUrl, thumbnailUrl } from '@/lib/community-images';
import { supabase } from '@/lib/supabase';
import { pickAndValidateImage, uploadCommunityImage, type PickedImage } from '@/lib/storage';
import { validateCommunityForm, type CommunityFormFieldKey } from '@/lib/communityFormValidate';
import { useDirty } from '@/lib/useDirty';
import { useFieldErrors } from '@/lib/useFieldErrors';
import { colors, space } from '../../../../theme';
import { Button, Field, Text, TopBar, useBanner } from '../../../../components/ui';

type CommunityType = (typeof COMMUNITY_TYPES)[number];
type Privacy = (typeof PRIVACY)[number];

export default function ManageSettingsScreen() {
  const { t } = useT('community');
  const { t: tc } = useT('common');
  const banner = useBanner();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: community } = useCommunity(id);
  const updateCommunity = useUpdateCommunity(id);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState<CommunityType>('club');
  const [privacy, setPrivacy] = useState<Privacy>('public');
  // Newly-picked local images (uploaded on save). Null = keep existing path.
  const [thumbnail, setThumbnail] = useState<PickedImage | null>(null);
  const [cover, setCover] = useState<PickedImage | null>(null);
  const [rulesEnabled, setRulesEnabled] = useState(false);
  const [rulesText, setRulesText] = useState('');

  const { errors: fieldErrors, setErrors: setFieldErrors, clear: clearFieldError } = useFieldErrors<CommunityFormFieldKey>();
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    if (community && !prefilled) {
      setName(community.name ?? '');
      setDescription(community.description ?? '');
      setLocation(community.location ?? '');
      setType((community.type as CommunityType) ?? 'club');
      setPrivacy((community.privacy as Privacy) ?? 'public');
      setRulesEnabled(community.cancellation_rules_enabled ?? false);
      setRulesText(community.cancellation_rules_text ?? '');
      setPrefilled(true);
    }
  }, [community, prefilled]);

  const pending = updateCommunity.isPending;

  const initial = useMemo(
    () => ({
      name: community?.name ?? '',
      description: community?.description ?? '',
      location: community?.location ?? '',
      type: (community?.type as CommunityType) ?? 'club',
      privacy: (community?.privacy as Privacy) ?? 'public',
      rulesEnabled: community?.cancellation_rules_enabled ?? false,
      rulesText: community?.cancellation_rules_text ?? '',
    }),
    [community],
  );
  const dirty = useDirty({ name, description, location, type, privacy, rulesEnabled, rulesText }, initial);

  const existingThumb = thumbnailUrl(community?.thumbnail_path);
  const existingCover = coverUrl(community?.cover_image_path);

  const pick = async (setter: (img: PickedImage) => void) => {
    try {
      const picked = await pickAndValidateImage();
      if (picked) setter(picked);
    } catch (e) {
      banner.show(t(e instanceof Error ? e.message : 'unknown_error'));
    }
  };

  const submit = async () => {
    if (pending) return;

    const errors = validateCommunityForm({ name, rulesEnabled, rulesText });
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      banner.show(tc('missingInformation'));
      return;
    }
    setFieldErrors({});

    const parsed = createCommunitySchema.safeParse({
      name: name.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      type,
      privacy,
      rules: { enabled: rulesEnabled, text: rulesText.trim() || undefined },
    });

    if (!parsed.success) {
      banner.show(tc('missingInformation'));
      return;
    }

    try {
      let thumbnailPath = community?.thumbnail_path ?? null;
      let coverPath = community?.cover_image_path ?? null;

      if (thumbnail) {
        thumbnailPath = await uploadCommunityImage(
          supabase,
          'community-thumbnails',
          id,
          thumbnail.uri,
          thumbnail.mimeType,
        );
      }
      if (cover) {
        coverPath = await uploadCommunityImage(
          supabase,
          'community-covers',
          id,
          cover.uri,
          cover.mimeType,
        );
      }

      await updateCommunity.mutateAsync({
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        location: parsed.data.location ?? null,
        type: parsed.data.type,
        privacy: parsed.data.privacy,
        thumbnail_path: thumbnailPath,
        cover_image_path: coverPath,
        cancellation_rules_enabled: rulesEnabled,
        // When rules are disabled, force the text to null; otherwise persist the entered text.
        cancellation_rules_text: rulesEnabled ? rulesText.trim() : null,
      });
      router.back();
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      banner.show(t(code, { defaultValue: t('unknown_error') }));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Gate on `prefilled`: `initial` tracks the query result but the form fields are seeded a render later, so `dirty` is briefly true after load. */}
      <TopBar variant="edit" title={t('manageSettings')} onClose={() => router.back()} dirty={prefilled && dirty} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <ScrollView
        contentContainerStyle={[styles.inner, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Field
          label={t('nameLabel')}
          value={name}
          onChangeText={(v) => { setName(v); clearFieldError('name'); }}
          placeholder={t('namePlaceholder')}
          editable={!pending}
          error={fieldErrors.name ? tc('required') : undefined}
          containerStyle={styles.field}
        />

        <Field
          label={t('descriptionLabel')}
          value={description}
          onChangeText={setDescription}
          placeholder={t('descriptionPlaceholder')}
          multiline
          editable={!pending}
          containerStyle={styles.field}
        />

        <Field
          label={t('locationLabel')}
          value={location}
          onChangeText={setLocation}
          placeholder={t('locationPlaceholder')}
          editable={!pending}
          containerStyle={styles.field}
        />

        <Text variant="label" tone="muted" style={styles.label}>{t('typeLabel')}</Text>
        <SegmentedType value={type} onChange={setType} disabled={pending} />

        <ImagePickerRow
          label={t('thumbnailLabel')}
          variant="square"
          uri={thumbnail?.uri ?? existingThumb}
          onPress={() => pick(setThumbnail)}
          disabled={pending}
        />
        <ImagePickerRow
          label={t('coverLabel')}
          variant="cover"
          uri={cover?.uri ?? existingCover}
          onPress={() => pick(setCover)}
          disabled={pending}
        />

        <Text variant="label" tone="muted" style={styles.label}>{t('privacyLabel')}</Text>
        <PrivacyCards value={privacy} onChange={setPrivacy} disabled={pending} />

        <RulesToggle
          enabled={rulesEnabled}
          text={rulesText}
          onToggle={setRulesEnabled}
          onChangeText={(v) => { setRulesText(v); clearFieldError('rules'); }}
          error={fieldErrors.rules ? t('rules_text_required') : null}
          disabled={pending}
        />

        <Button label={t('save')} size="lg" fullWidth loading={pending} onPress={submit} />
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  flex: { flex: 1 },
  inner: { paddingHorizontal: space[6], paddingTop: space[4] },
  label: { marginBottom: space[2] },
  field: { marginBottom: space[4] },
});
