import {
  COMMUNITY_TYPES,
  PRIVACY,
  createCommunitySchema,
  useCommunity,
  useUpdateCommunity,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ImagePickerRow } from '@/components/community/ImagePickerRow';
import { PrivacyCards } from '@/components/community/PrivacyCards';
import { RulesToggle } from '@/components/community/RulesToggle';
import { SegmentedType } from '@/components/community/SegmentedType';
import { coverUrl, thumbnailUrl } from '@/lib/community-images';
import { supabase } from '@/lib/supabase';
import { pickAndValidateImage, uploadCommunityImage, type PickedImage } from '@/lib/storage';

type CommunityType = (typeof COMMUNITY_TYPES)[number];
type Privacy = (typeof PRIVACY)[number];

export default function ManageSettingsScreen() {
  const { t } = useT('community');
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

  const [rulesError, setRulesError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  const existingThumb = thumbnailUrl(community?.thumbnail_path);
  const existingCover = coverUrl(community?.cover_image_path);

  const pick = async (setter: (img: PickedImage) => void) => {
    setError(null);
    try {
      const picked = await pickAndValidateImage();
      if (picked) setter(picked);
    } catch (e) {
      setError(t(e instanceof Error ? e.message : 'unknown_error'));
    }
  };

  const submit = async () => {
    if (pending) return;
    setError(null);
    setRulesError(null);

    const parsed = createCommunitySchema.safeParse({
      name: name.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      type,
      privacy,
      rules: { enabled: rulesEnabled, text: rulesText.trim() || undefined },
    });

    if (!parsed.success) {
      const rulesIssue = parsed.error.issues.find((i) => i.path.includes('rules'));
      if (rulesIssue) setRulesError(t('rules_text_required'));
      setError(t('validation_error'));
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
        privacy: parsed.data.privacy,
        thumbnail_path: thumbnailPath,
        cover_image_path: coverPath,
        cancellation_rules_enabled: rulesEnabled,
        // Toggling rules OFF keeps the existing text rather than nulling it.
        cancellation_rules_text: rulesText.trim() || community?.cancellation_rules_text || null,
      });
      router.back();
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      setError(t(code, { defaultValue: t('unknown_error') }));
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.inner, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>{t('nameLabel')}</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={t('namePlaceholder')}
          editable={!pending}
        />

        <Text style={styles.label}>{t('descriptionLabel')}</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={description}
          onChangeText={setDescription}
          placeholder={t('descriptionPlaceholder')}
          multiline
          editable={!pending}
        />

        <Text style={styles.label}>{t('locationLabel')}</Text>
        <TextInput
          style={styles.input}
          value={location}
          onChangeText={setLocation}
          placeholder={t('locationPlaceholder')}
          editable={!pending}
        />

        <Text style={styles.label}>{t('typeLabel')}</Text>
        <SegmentedType value={type} onChange={setType} disabled />
        <Text style={styles.hint}>{t('typeLockedHint')}</Text>

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

        <Text style={styles.label}>{t('privacyLabel')}</Text>
        <PrivacyCards value={privacy} onChange={setPrivacy} disabled={pending} />

        <RulesToggle
          enabled={rulesEnabled}
          text={rulesText}
          onToggle={setRulesEnabled}
          onChangeText={setRulesText}
          error={rulesError}
          disabled={pending}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.button, pending && styles.buttonDisabled]}
          onPress={submit}
          disabled={pending}
          accessibilityRole="button"
        >
          {pending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{t('save')}</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { paddingHorizontal: 24, paddingTop: 16 },
  label: { fontSize: 14, color: '#444', marginBottom: 8 },
  hint: { fontSize: 12, color: '#8A95A5', marginTop: 4, marginBottom: 16 },
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
