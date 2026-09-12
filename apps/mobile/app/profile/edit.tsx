import { useMyProfile, useUpdateProfile } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChoiceRow } from '@/components/OnboardingStep';
import { avatarUrl } from '@/lib/community-images';
import { supabase } from '@/lib/supabase';
import { pickAndValidateImage, uploadCommunityImage, type PickedImage } from '@/lib/storage';
import { useDirty } from '@/lib/useDirty';
import { colors, palette } from '../../theme';
import { Button, TopBar } from '../../components/ui';

const DOB_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function EditProfileScreen() {
  const { t } = useT('profile');
  const router = useRouter();
  const uid = useSession().session?.user.id;
  const my = useMyProfile();
  const update = useUpdateProfile();

  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [hand, setHand] = useState<string | null>(null);
  const [side, setSide] = useState<string | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [dob, setDob] = useState('');
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickedImage | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = my.data;
    if (!p) return;
    setFullName(p.full_name ?? '');
    setBio(p.description ?? '');
    setHand(p.dominant_hand ?? null);
    setSide(p.court_side ?? null);
    setGender(p.gender ?? null);
    setTime(p.preferred_time ?? null);
    setDob(p.date_of_birth ?? '');
    setAvatarPath(p.avatar_url ?? null);
  }, [my.data]);

  const initial = useMemo(
    () => ({
      fullName: my.data?.full_name ?? '',
      bio: my.data?.description ?? '',
      hand: my.data?.dominant_hand ?? null,
      side: my.data?.court_side ?? null,
      gender: my.data?.gender ?? null,
      time: my.data?.preferred_time ?? null,
      dob: my.data?.date_of_birth ?? '',
    }),
    [my.data],
  );
  const dirty = useDirty({ fullName, bio, hand, side, gender, time, dob }, initial) || picked != null;

  const onPickAvatar = async () => {
    setError(null);
    try {
      const img = await pickAndValidateImage();
      if (img) setPicked(img);
    } catch (e) {
      setError(t(e instanceof Error ? e.message : 'unknown_error'));
    }
  };

  const onSave = async () => {
    if (saving || !uid) return;
    if (dob.trim() && !DOB_RE.test(dob.trim())) {
      setError(t('dobInvalid'));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      let nextAvatar = avatarPath;
      if (picked) {
        nextAvatar = await uploadCommunityImage(supabase, 'avatars', uid, picked.uri, picked.mimeType);
      }
      await update.mutateAsync({
        full_name: fullName.trim() || undefined,
        description: bio.trim() || null,
        dominant_hand: hand,
        court_side: side,
        gender,
        preferred_time: time,
        date_of_birth: dob.trim() || null,
        avatar_url: nextAvatar,
      });
      router.back();
    } catch (e) {
      setError(t(e instanceof Error ? e.message : 'unknown_error'));
    } finally {
      setSaving(false);
    }
  };

  if (my.isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }

  const shownAvatar = picked ? picked.uri : avatarUrl(avatarPath);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="edit" title={t('editTitle')} onClose={() => router.back()} dirty={dirty} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <Pressable style={styles.avatarWrap} onPress={onPickAvatar} accessibilityRole="button">
        <View style={styles.avatar}>
          {shownAvatar ? <Image source={{ uri: shownAvatar }} style={styles.avatarImg} /> : null}
        </View>
        <Text style={styles.avatarHint}>{t('avatarHint')}</Text>
      </Pressable>

      <Text style={styles.label}>{t('name')}</Text>
      <TextInput style={styles.input} value={fullName} onChangeText={setFullName} autoCapitalize="words" />

      <Text style={styles.label}>{t('bio')}</Text>
      <TextInput style={[styles.input, styles.multiline]} value={bio} onChangeText={setBio} multiline />

      <Text style={styles.label}>{t('handLabel')}</Text>
      <ChoiceRow value={hand} onChange={setHand} options={[{ key: 'left', label: t('handLeft') }, { key: 'right', label: t('handRight') }]} />

      <Text style={styles.label}>{t('sideLabel')}</Text>
      <ChoiceRow value={side} onChange={setSide} options={[{ key: 'left', label: t('sideLeft') }, { key: 'right', label: t('sideRight') }]} />

      <Text style={styles.label}>{t('genderLabel')}</Text>
      <ChoiceRow value={gender} onChange={setGender} options={[{ key: 'male', label: t('genderMale') }, { key: 'female', label: t('genderFemale') }]} />

      <Text style={styles.label}>{t('timeLabel')}</Text>
      <ChoiceRow
        value={time}
        onChange={setTime}
        options={[
          { key: 'any', label: t('timeAny') },
          { key: 'morning', label: t('timeMorning') },
          { key: 'afternoon', label: t('timeAfternoon') },
          { key: 'night', label: t('timeNight') },
        ]}
      />

      <Text style={styles.label}>{t('dobLabel')}</Text>
      <TextInput style={styles.input} value={dob} onChangeText={setDob} placeholder="YYYY-MM-DD" autoCapitalize="none" />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button label={t('save')} fullWidth loading={saving} onPress={onSave} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  content: { padding: 16, gap: 8, paddingBottom: 48 },
  avatarWrap: { alignItems: 'center', gap: 6, marginBottom: 8 },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: palette.purple[100], overflow: 'hidden' },
  avatarImg: { width: 96, height: 96 },
  avatarHint: { color: colors.primary, fontSize: 13, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '600', color: colors.foreground, marginTop: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: colors.card },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  error: { color: colors.destructive, fontSize: 13 },
});
