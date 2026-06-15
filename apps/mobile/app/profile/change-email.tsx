import { startEmailChange, verifyEmailChange } from '@padel/auth';
import { useT } from '@padel/i18n';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { supabase } from '@/lib/supabase';

export default function ChangeEmailScreen() {
  const { t } = useT('profile');
  const router = useRouter();
  const [phase, setPhase] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSend = async () => {
    if (busy || !email.trim()) return;
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('changeEmail') }} />
      {phase === 'email' ? (
        <>
          <Text style={styles.label}>{t('newEmailLabel')}</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={[styles.btn, busy && styles.btnDisabled]} onPress={onSend} disabled={busy} accessibilityRole="button">
            <Text style={styles.btnText}>{t('sendCode')}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.hint}>{t('codeSentTo')}</Text>
          <Text style={styles.label}>{t('codeLabel')}</Text>
          <TextInput style={styles.input} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={[styles.btn, busy && styles.btnDisabled]} onPress={onVerify} disabled={busy} accessibilityRole="button">
            <Text style={styles.btnText}>{t('verify')}</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  content: { padding: 16, gap: 8 },
  hint: { color: '#6B7685', fontSize: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#0B1F3A', marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: '#fff' },
  error: { color: '#D7263D', fontSize: 13 },
  btn: { backgroundColor: '#0B7BFF', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
