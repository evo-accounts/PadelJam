import {
  COMMUNITY_TYPES,
  PRIVACY,
  createCommunitySchema,
  useCreateCommunity,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ImagePickerRow } from '@/components/community/ImagePickerRow';
import { PrivacyCards } from '@/components/community/PrivacyCards';
import { RulesToggle } from '@/components/community/RulesToggle';
import { SegmentedType } from '@/components/community/SegmentedType';
import { setPendingCommunityImages } from '@/lib/community-image-handoff';
import { pickAndValidateImage, type PickedImage } from '@/lib/storage';
import { useDirty } from '@/lib/useDirty';
import { colors } from '../../../theme';
import { TopBar } from '../../../components/ui';

type CommunityType = (typeof COMMUNITY_TYPES)[number];
type Privacy = (typeof PRIVACY)[number];

export default function CreateCommunityScreen() {
  const { t } = useT('community');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const createCommunity = useCreateCommunity();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState<CommunityType>('club');
  const [privacy, setPrivacy] = useState<Privacy>('public');
  const [thumbnail, setThumbnail] = useState<PickedImage | null>(null);
  const [cover, setCover] = useState<PickedImage | null>(null);
  const [rulesEnabled, setRulesEnabled] = useState(false);
  const [rulesText, setRulesText] = useState('');

  const [rulesError, setRulesError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = createCommunity.isPending;

  const initial = useMemo(() => ({ name: '', description: '', location: '', rules: '' }), []);
  const dirty = useDirty({ name, description, location, rules: rulesText }, initial);

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
      const id = await createCommunity.mutateAsync({ ...parsed.data, country: 'PT' });
      // Images upload after the community exists (creator = owner/admin).
      setPendingCommunityImages({ thumbnail, cover });
      router.replace({ pathname: '/(tabs)/community/created', params: { id: id as string } });
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      setError(t(code, { defaultValue: t('unknown_error') }));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="edit" title={t('createTitle')} onClose={() => router.back()} dirty={dirty} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <ScrollView
        contentContainerStyle={[
          styles.inner,
          { paddingTop: 24, paddingBottom: insets.bottom + 24 },
        ]}
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
        <SegmentedType value={type} onChange={setType} disabled={pending} />

        <ImagePickerRow
          label={t('thumbnailLabel')}
          variant="square"
          uri={thumbnail?.uri ?? null}
          onPress={() => pick(setThumbnail)}
          disabled={pending}
        />
        <ImagePickerRow
          label={t('coverLabel')}
          variant="cover"
          uri={cover?.uri ?? null}
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
            <ActivityIndicator color={colors.card} />
          ) : (
            <Text style={styles.buttonText}>{t('create')}</Text>
          )}
        </Pressable>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  flex: { flex: 1 },
  inner: { paddingHorizontal: 24 },
  label: { fontSize: 14, color: colors.mutedForeground, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  error: { color: colors.destructive, marginBottom: 16 },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.card, fontSize: 16, fontWeight: '600' },
});
