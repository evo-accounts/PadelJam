import { changePassword, useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { Button, TopBar } from '../../components/ui';
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
  const dirty = current.length > 0 || next.length > 0 || repeat.length > 0;

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
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="edit" title={t('changePassword')} onClose={() => router.back()} dirty={dirty} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <Text style={styles.label}>{t('currentPassword')}</Text>
        <TextInput style={styles.input} value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" />
        <Text style={styles.label}>{t('newPassword')}</Text>
        <TextInput style={styles.input} value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" />
        <Text style={styles.label}>{t('repeatPassword')}</Text>
        <TextInput style={styles.input} value={repeat} onChangeText={setRepeat} secureTextEntry autoCapitalize="none" />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button fullWidth label={t('changePassword')} onPress={onSave} loading={busy} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: 16, gap: 8 },
  label: { fontSize: 13, fontWeight: '600', color: colors.foreground, marginTop: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: colors.card },
  error: { color: colors.destructive, fontSize: 13 },
});
