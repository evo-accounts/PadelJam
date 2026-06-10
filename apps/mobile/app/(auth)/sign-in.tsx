import { startEmailOtp, startPhoneOtp } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { detectKind, setAuthTarget } from '@/lib/auth-flow';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  const { t } = useT('auth');
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onContinue = async () => {
    const value = identifier.trim();
    if (!value || busy) return;
    const kind = detectKind(value);
    setBusy(true);
    setError(null);
    try {
      const { error: otpError } =
        kind === 'phone'
          ? await startPhoneOtp(supabase, value)
          : await startEmailOtp(supabase, value);
      if (otpError) {
        setError(otpError.message);
        return;
      }
      setAuthTarget(value, kind);
      router.push('/(auth)/otp');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.inner, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.title}>{t('title')}</Text>
        <Text style={styles.label}>{t('identifierLabel')}</Text>
        <TextInput
          style={styles.input}
          value={identifier}
          onChangeText={setIdentifier}
          placeholder={t('identifierPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          inputMode="email"
          autoComplete="email"
          editable={!busy}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={onContinue}
          disabled={busy}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{t('continue')}</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { flex: 1, paddingHorizontal: 24, justifyContent: 'flex-start' },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 32 },
  label: { fontSize: 14, color: '#444', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  error: { color: '#c0392b', marginBottom: 16 },
  button: {
    backgroundColor: '#0B1F3A',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
