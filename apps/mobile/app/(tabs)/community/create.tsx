import {
  COMMUNITY_TYPES,
  PRIVACY,
  createCommunitySchema,
  useCreateCommunity,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ImagePickerRow } from '@/components/community/ImagePickerRow';
import { PrivacyCards } from '@/components/community/PrivacyCards';
import { RulesToggle } from '@/components/community/RulesToggle';
import { SegmentedType } from '@/components/community/SegmentedType';
import { LocationSheet } from '@/components/profile/LocationSheet';
import { setPendingCommunityImages } from '@/lib/community-image-handoff';
import { pickAndValidateImage, type PickedImage } from '@/lib/storage';
import { validateCommunityForm, type CommunityFormFieldKey } from '@/lib/communityFormValidate';
import { useDirty } from '@/lib/useDirty';
import { useFieldErrors } from '@/lib/useFieldErrors';
import type { ResolvedPlace } from '@/lib/useGeocodeSearch';
import { colors, space } from '../../../theme';
import { Button, Field, ListRow, Text, TopBar, useBanner } from '../../../components/ui';

type CommunityType = (typeof COMMUNITY_TYPES)[number];
type Privacy = (typeof PRIVACY)[number];

export default function CreateCommunityScreen() {
  const { t } = useT('community');
  const { t: tc } = useT('common');
  const banner = useBanner();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const createCommunity = useCreateCommunity();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // D2: a picked place — its label is the community's `location`, its point ranks Explore by
  // distance. The lookup can hand back a label with null coordinates; that saves as text only.
  const [place, setPlace] = useState<ResolvedPlace | null>(null);
  const location = place?.label ?? '';
  const [type, setType] = useState<CommunityType>('club');
  const [privacy, setPrivacy] = useState<Privacy>('public');
  const [thumbnail, setThumbnail] = useState<PickedImage | null>(null);
  const [cover, setCover] = useState<PickedImage | null>(null);
  const [rulesEnabled, setRulesEnabled] = useState(false);
  const [rulesText, setRulesText] = useState('');
  const [pickingLocation, setPickingLocation] = useState(false);

  const { errors: fieldErrors, setErrors: setFieldErrors, clear: clearFieldError } = useFieldErrors<CommunityFormFieldKey>();

  const pending = createCommunity.isPending;

  /**
   * UX-COMM-01's footer is "disabled until every required field is filled", so
   * validity is computed on every render rather than only on submit. Same
   * function the submit path uses, so the button and the error state can never
   * disagree about what "required" means.
   */
  const isValid = Object.keys(validateCommunityForm({ name, rulesEnabled, rulesText })).length === 0;

  const initial = useMemo(() => ({ name: '', description: '', location: '', rules: '' }), []);
  const dirty = useDirty({ name, description, location, rules: rulesText }, initial);

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
      locationPoint: place?.lat != null && place.lng != null ? { lat: place.lat, lng: place.lng } : undefined,
      type,
      privacy,
      rules: { enabled: rulesEnabled, text: rulesText.trim() || undefined },
    });

    if (!parsed.success) {
      banner.show(tc('missingInformation'));
      return;
    }

    try {
      const id = await createCommunity.mutateAsync({ ...parsed.data, country: 'PT' });
      // Images upload after the community exists (creator = owner/admin).
      setPendingCommunityImages({ thumbnail, cover });
      router.replace({ pathname: '/(tabs)/community/created', params: { id: id as string } });
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      banner.show(t(code, { defaultValue: t('unknown_error') }));
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
        contentContainerStyle={[styles.inner, styles.innerPad]}
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

        {/* A picker, not free text (UX-COMM-01, D2). Rendered as a Field-shaped
            row so it reads as part of the same form; the sheet owns the search. */}
        <Text variant="label" tone="muted" style={styles.label}>{t('locationLabel')}</Text>
        <ListRow
          title={location || t('locationPlaceholder')}
          variant="plain"
          onPress={() => setPickingLocation(true)}
          disabled={pending}
          style={styles.field}
          testID="create-location"
        />

        <Text variant="label" tone="muted" style={styles.label}>{t('typeLabel')}</Text>
        <SegmentedType value={type} onChange={setType} disabled={pending} />

        <ImagePickerRow
          label={t('thumbnailLabel')}
          variant="square"
          uri={thumbnail?.uri ?? null}
          onPress={() => pick(setThumbnail)}
          onRemove={() => setThumbnail(null)}
          disabled={pending}
        />
        <ImagePickerRow
          label={t('coverLabel')}
          variant="cover"
          uri={cover?.uri ?? null}
          onPress={() => pick(setCover)}
          onRemove={() => setCover(null)}
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

      </ScrollView>
      {/* Pinned, and disabled until the form is answerable — the audit's footer.
          Inside the KeyboardAvoidingView: a pinned action the keyboard covers is
          worse than one you have to scroll to. */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + space[2] }]}>
        <Button
          label={t('create')}
          size="lg"
          fullWidth
          loading={pending}
          disabled={!isValid}
          onPress={submit}
          testID="create-submit"
        />
      </View>
      </KeyboardAvoidingView>

      <LocationSheet visible={pickingLocation} onClose={() => setPickingLocation(false)} onPick={setPlace} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  flex: { flex: 1 },
  inner: { paddingHorizontal: space[6] },
  innerPad: { paddingTop: space[5], paddingBottom: space[5] },
  footer: {
    paddingHorizontal: space[6],
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  label: { marginBottom: space[2] },
  field: { marginBottom: space[4] },
});
