import { changePassword, useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { supabase } from '@/lib/supabase';
import { colors } from '../../theme';

export default function ChangePasswordScreen() {
  const { t } = useT('profile');
  const router = useRouter();
  const email = useSession().session?.user.email;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = async () => {
    if (busy || !email) return;
    if (next.length < 8) {
      setError(t('passwordTooShort'));
      return;
    }
    if (next !== repeat) {
      setError(t('passwordsDontMatch'));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const r = await changePassword(supabase, email, current, next);
      if (r.ok) {
        Alert.alert(t('passwordChanged'), undefined, [{ text: 'OK', onPress: () => router.back() }]);
        return;
      }
      setError(r.reason === 'current_password_wrong' ? t('currentPasswordWrong') : t('updateFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('changePassword') }} />
      <Text style={styles.label}>{t('currentPassword')}</Text>
      <TextInput style={styles.input} value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" />
      <Text style={styles.label}>{t('newPassword')}</Text>
      <TextInput style={styles.input} value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" />
      <Text style={styles.label}>{t('repeatPassword')}</Text>
      <TextInput style={styles.input} value={repeat} onChangeText={setRepeat} secureTextEntry autoCapitalize="none" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={[styles.save, busy && styles.saveDisabled]} onPress={onSave} disabled={busy} accessibilityRole="button">
        <Text style={styles.saveText}>{t('changePassword')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 8 },
  label: { fontSize: 13, fontWeight: '600', color: colors.foreground, marginTop: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: colors.card },
  error: { color: colors.destructive, fontSize: 13 },
  save: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  saveDisabled: { opacity: 0.6 },
  saveText: { color: colors.card, fontWeight: '700', fontSize: 16 },
});
