import { startEmailChange, verifyEmailChange } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { Button, TopBar } from '../../components/ui';
import { colors } from '../../theme';

export default function ChangeEmailScreen() {
  const { t } = useT('profile');
  const router = useRouter();
  const [phase, setPhase] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = email.trim().length > 0 || code.trim().length > 0;

  const onSend = async () => {
    if (busy || !email.trim()) return;
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError(t('emailInvalid'));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { error: e } = await startEmailChange(supabase, email.trim());
      if (e) {
        setError(t('changeEmailFailed'));
        return;
      }
      setPhase('code');
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async () => {
    if (busy || !code.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const { error: e } = await verifyEmailChange(supabase, email.trim(), code.trim());
      if (e) {
        setError(t('invalidCode'));
        return;
      }
      Alert.alert(t('emailChanged'), undefined, [{ text: 'OK', onPress: () => router.back() }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="edit" title={t('changeEmail')} onClose={() => router.back()} dirty={dirty} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      {phase === 'email' ? (
        <>
          <Text style={styles.label}>{t('newEmailLabel')}</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button fullWidth label={t('sendCode')} onPress={onSend} loading={busy} />
        </>
      ) : (
        <>
          <Text style={styles.hint}>{t('codeSentTo')}</Text>
          <Text style={styles.label}>{t('codeLabel')}</Text>
          <TextInput style={styles.input} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button fullWidth label={t('verify')} onPress={onVerify} loading={busy} />
        </>
      )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: 16, gap: 8 },
  hint: { color: colors.mutedForeground, fontSize: 14 },
  label: { fontSize: 13, fontWeight: '600', color: colors.foreground, marginTop: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: colors.card },
  error: { color: colors.destructive, fontSize: 13 },
});
