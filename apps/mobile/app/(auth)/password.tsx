import { initialOtpState, otpReducer, signInWithPassword } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useReducer, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getAuthTarget } from '@/lib/auth-flow';
import { decidePostVerifyRoute } from '@/lib/postVerifyRoute';
import { supabase } from '@/lib/supabase';

export default function PasswordScreen() {
  const { t } = useT('auth');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { identifier, kind } = getAuthTarget();

  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, dispatch] = useReducer(otpReducer, undefined, initialOtpState);

  const submit = async () => {
    if (busy || state.locked || !password) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: signInError } = await signInWithPassword(supabase, identifier, kind, password);
      if (signInError || !data.user) {
        dispatch({ type: 'fail' });
        setError(t('passwordWrong'));
        return;
      }
      const { data: profile, error: profileError } = await supabase.from('profiles').select('id').eq('id', data.user.id).maybeSingle();
      const decision = decidePostVerifyRoute(profile, profileError);
      if (decision.kind === 'error') {
        setError(decision.message);
        return;
      }
      router.replace(decision.target);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.title}>{t('passwordTitle')}</Text>
      <Text style={styles.help}>{t('otpHelp', { identifier })}</Text>
      <Text style={styles.label}>{t('passwordLabel')}</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder={t('passwordPlaceholder')}
        secureTextEntry
        autoCapitalize="none"
        editable={!busy && !state.locked}
        autoFocus
      />
      {state.locked ? (
        <Text style={styles.error}>{t('passwordRateLimited')}</Text>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : null}
      <Pressable
        style={[styles.button, (busy || state.locked || !password) && styles.buttonDisabled]}
        onPress={submit}
        disabled={busy || state.locked || !password}
        accessibilityRole="button"
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('continue')}</Text>}
      </Pressable>
      <Pressable style={styles.linkButton} onPress={() => router.push('/(auth)/recovery' as never)} accessibilityRole="button">
        <Text style={styles.link}>{t('forgotPassword')}</Text>
      </Pressable>
      <Pressable style={styles.linkButton} onPress={() => router.back()} accessibilityRole="button">
        <Text style={styles.link}>{t('tryAnotherWay')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC', paddingHorizontal: 24 },
  title: { fontSize: 24, fontWeight: '800', color: '#0B1F3A', marginBottom: 8 },
  help: { fontSize: 14, color: '#6B7685', marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', color: '#0B1F3A', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: '#fff' },
  error: { color: '#D7263D', fontSize: 13, marginTop: 8 },
  button: { backgroundColor: '#0B7BFF', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  linkButton: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  link: { color: '#0B7BFF', fontWeight: '600', fontSize: 14 },
});
