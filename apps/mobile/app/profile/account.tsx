/**
 * Account Settings (UX-SET-02) — every piece of personal data in one place.
 *
 * It replaces `profile/edit.tsx`, which is deleted in this change. That screen mixed personal data
 * with playing preferences and was reachable only from an "Editar" button on your own profile,
 * duplicating what belongs in Settings; the preferences move to Game preferences (UX-SET-03) and
 * the identity fields land here.
 *
 * Save commits name, description, avatar, date of birth and gender. Three things deliberately do
 * NOT ride on it:
 *
 *  - EMAIL and MOBILE are rows that open a two-phase OTP flow. The audit's "fixed Save" and its
 *    "changing the email triggers a verification code" cannot both be literal: a code sent to a new
 *    address has to be confirmed before the change is real, which is a round trip, not a field.
 *    Requirements PR-12 asks the same of the mobile number, and it matters more there — phone is a
 *    sign-in identifier, so an unverified change hands the account to a number nobody proved they
 *    hold.
 *  - LOCATION is its own write. `set_my_location(lat, lng, text)` is the only sanctioned writer of
 *    the geography column and sets the point and the label together, so it cannot ride in a
 *    `profiles` UPDATE. It fires only when the location actually changed.
 */
import { useMyProfile, useSetMyLocation, useUpdateProfile } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LocationSheet } from '@/components/profile/LocationSheet';
import { avatarUrl } from '@/lib/community-images';
import { supabase } from '@/lib/supabase';
import { pickAndValidateImage, uploadCommunityImage, type PickedImage } from '@/lib/storage';
import { useDirty } from '@/lib/useDirty';
import type { ResolvedPlace } from '@/lib/useGeocodeSearch';
import { colors, space } from '../../theme';
import {
  Avatar,
  Button,
  DateField,
  Field,
  ListRow,
  Loading,
  Screen,
  Segmented,
  Text,
  TopBar,
  useBanner,
} from '../../components/ui';

export default function AccountSettingsScreen() {
  const { t } = useT('profile');
  const router = useRouter();
  const banner = useBanner();
  const uid = useSession().session?.user.id;
  const my = useMyProfile();
  const update = useUpdateProfile();
  const setLocation = useSetMyLocation();

  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [gender, setGender] = useState<string | null>(null);
  const [dob, setDob] = useState<string | null>(null);
  const [place, setPlace] = useState<ResolvedPlace | null>(null);
  const [locationText, setLocationText] = useState('');
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [locationOpen, setLocationOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    const p = my.data;
    if (!p) return;
    setFullName(p.full_name ?? '');
    setBio(p.description ?? '');
    setGender(p.gender ?? null);
    setDob(p.date_of_birth ?? null);
    setLocationText(p.location_text ?? '');
    setAvatarPath(p.avatar_url ?? null);
    setPrefilled(true);
  }, [my.data]);

  const initial = useMemo(
    () => ({
      fullName: my.data?.full_name ?? '',
      bio: my.data?.description ?? '',
      gender: my.data?.gender ?? null,
      dob: my.data?.date_of_birth ?? null,
      locationText: my.data?.location_text ?? '',
    }),
    [my.data],
  );
  const dirty =
    useDirty({ fullName, bio, gender, dob, locationText }, initial) || picked != null;

  const onPickAvatar = async () => {
    try {
      const img = await pickAndValidateImage();
      if (img) setPicked(img);
    } catch (e) {
      banner.show(t(e instanceof Error ? e.message : 'unknown_error'));
    }
  };

  const onSave = async () => {
    if (saving || !uid) return;
    setSaving(true);
    try {
      let nextAvatar = avatarPath;
      if (picked) {
        nextAvatar = await uploadCommunityImage(supabase, 'avatars', uid, picked.uri, picked.mimeType);
      }
      await update.mutateAsync({
        full_name: fullName.trim() || undefined,
        description: bio.trim() || null,
        gender,
        date_of_birth: dob,
        avatar_url: nextAvatar,
      });
      // Only when a place was actually picked — `set_my_location` overwrites the point and the
      // label together, so calling it with an unchanged label would still rewrite the coordinates.
      if (place) {
        await setLocation.mutateAsync({ lat: place.lat, lng: place.lng, text: place.label || null });
      }
      router.back();
    } catch (e) {
      banner.show(t(e instanceof Error ? e.message : 'unknown_error'));
    } finally {
      setSaving(false);
    }
  };

  if (my.isLoading) return <Loading testID="account-loading" />;

  const shownAvatar = picked ? picked.uri : avatarUrl(avatarPath);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Gate on `prefilled`: the fields are seeded a render after the query resolves, so `dirty`
          is briefly true on load and would otherwise ask to discard changes nobody made. */}
      <TopBar
        variant="nav"
        title={t('accountTitle')}
        onBack={() => router.back()}
        dirty={prefilled && dirty}
      />
      <Screen scroll padded={false} style={styles.content}>
        <Pressable style={styles.avatarWrap} onPress={onPickAvatar} accessibilityRole="button" testID="account-avatar">
          <Avatar uri={shownAvatar} name={fullName || my.data?.full_name} colourKey={uid} size="xl" />
          <Text variant="label" tone="primary">
            {t('avatarHint')}
          </Text>
        </Pressable>

        <Field label={t('name')} value={fullName} onChangeText={setFullName} autoCapitalize="words" testID="account-name" />
        <Field label={t('bio')} value={bio} onChangeText={setBio} multiline testID="account-bio" />

        {/* Rows, not fields — each opens its own verification flow. */}
        <ListRow
          variant="card"
          title={t('changeEmail')}
          trailingLabel={my.data?.email ?? undefined}
          onPress={() => router.push('/profile/change-email')}
          testID="account-email-row"
        />
        <ListRow
          variant="card"
          title={t('changePhone')}
          trailingLabel={my.data?.phone ?? undefined}
          onPress={() => router.push('/profile/change-phone')}
          testID="account-phone-row"
        />

        <DateField
          label={t('dobLabel')}
          value={dob}
          onChange={setDob}
          placeholder={t('dobPlaceholder')}
          testID="account-dob"
        />

        <ListRow
          variant="card"
          title={t('locationLabel')}
          trailingLabel={place?.label || locationText || undefined}
          onPress={() => setLocationOpen(true)}
          testID="account-location-row"
        />

        <View style={styles.genderBlock}>
          <Text variant="label">{t('genderLabel')}</Text>
          <Segmented
            value={gender ?? ''}
            onChange={setGender}
            options={[
              { value: 'male', label: t('genderMale') },
              { value: 'female', label: t('genderFemale') },
            ]}
            testID="account-gender"
          />
        </View>

        {/* Last item of the form content, as UX-SET-02 specifies — the screen it opens is the one
            that explains what is lost, so this row is a door, not the decision. */}
        <ListRow
          variant="card"
          title={t('deleteAccount')}
          titleTone="destructive"
          onPress={() => router.push('/profile/delete-account')}
          testID="account-delete-row"
        />
      </Screen>

      <View style={styles.footer}>
        <Button label={t('save')} fullWidth loading={saving} onPress={onSave} testID="account-save" />
      </View>

      <LocationSheet
        visible={locationOpen}
        onClose={() => setLocationOpen(false)}
        onPick={(p) => {
          setPlace(p);
          setLocationText(p.label);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: space[4], gap: space[3], paddingBottom: space[8] },
  avatarWrap: { alignItems: 'center', gap: space[1], marginBottom: space[2] },
  genderBlock: { gap: space[1] },
  footer: { padding: space[4], borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
});
