import { useMyProfile, useUpdateProfile } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ChoiceRow } from '@/components/OnboardingStep';
import { avatarUrl } from '@/lib/community-images';
import { supabase } from '@/lib/supabase';
import { pickAndValidateImage, uploadCommunityImage } from '@/lib/storage';

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
  const [picked, setPicked] = useState<{ uri: string; mimeType: string } | null>(null);
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

  const onPickAvatar = async () => {
    const img = await pickAndValidateImage();
    if (img) setPicked({ uri: img.uri, mimeType: img.mimeType });
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
    } finally {
      setSaving(false);
    }
  };

  if (my.isLoading) return <ActivityIndicator color="#0B1F3A" style={{ marginTop: 48 }} />;

  const shownAvatar = picked ? picked.uri : avatarUrl(avatarPath);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('editTitle') }} />
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

      <Pressable style={[styles.save, saving && styles.saveDisabled]} onPress={onSave} disabled={saving} accessibilityRole="button">
        <Text style={styles.saveText}>{t('save')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  content: { padding: 16, gap: 8, paddingBottom: 48 },
  avatarWrap: { alignItems: 'center', gap: 6, marginBottom: 8 },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#E6F0FF', overflow: 'hidden' },
  avatarImg: { width: 96, height: 96 },
  avatarHint: { color: '#0B7BFF', fontSize: 13, fontWeight: '600' },
  label: { fontSize: 13, fontWeight: '600', color: '#0B1F3A', marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: '#fff' },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  error: { color: '#D7263D', fontSize: 13 },
  save: { backgroundColor: '#0B7BFF', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  saveDisabled: { opacity: 0.6 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
