import { useT } from '@padel/i18n';
import { formatDisplayName } from '@padel/utils';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { detectKind, getAuthTarget } from '@/lib/auth-flow';
import { SUPABASE_URL, supabase } from '@/lib/supabase';

export default function CreateAccountScreen() {
  const { t } = useT('auth');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { kind } = getAuthTarget();

  // The primary identifier is already verified; ask for the missing one.
  const secondaryKind = kind === 'phone' ? 'email' : 'phone';

  const [fullName, setFullName] = useState('');
  const [secondary, setSecondary] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    const name = fullName.trim();
    const secondaryValue = secondary.trim();
    if (!name || !secondaryValue || !password) return;

    setBusy(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError('no-session');
        return;
      }

      const secKind = detectKind(secondaryValue);
      const secondaryBody =
        secKind === 'phone' ? { phone: secondaryValue } : { email: secondaryValue };

      // The Edge Function attaches the secondary identifier + password AND creates the profiles row
      // server-side from the identifiers it persists on auth.users — the client never writes its own
      // identity into the globally-readable profiles table.
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/complete-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ ...secondaryBody, password, full_name: formatDisplayName(name) }),
      });

      if (!resp.ok) {
        setError(`complete-account-failed:${resp.status}`);
        return;
      }

      router.replace('/(onboarding)/location');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.inner,
          { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{t('createAccountTitle')}</Text>

        <Text style={styles.label}>{t('fullNameLabel')}</Text>
        <TextInput
          style={styles.input}
          value={fullName}
          onChangeText={setFullName}
          placeholder={t('fullNamePlaceholder')}
          autoCapitalize="words"
          editable={!busy}
        />

        <Text style={styles.label}>
          {secondaryKind === 'phone' ? t('secondaryPhoneLabel') : t('secondaryEmailLabel')}
        </Text>
        <TextInput
          style={styles.input}
          value={secondary}
          onChangeText={setSecondary}
          placeholder={
            secondaryKind === 'phone'
              ? t('secondaryPhonePlaceholder')
              : t('secondaryEmailPlaceholder')
          }
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={secondaryKind === 'phone' ? 'phone-pad' : 'email-address'}
          inputMode={secondaryKind === 'phone' ? 'tel' : 'email'}
          editable={!busy}
        />

        <Text style={styles.label}>{t('passwordLabel')}</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          editable={!busy}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.button, busy && styles.buttonDisabled]}
          onPress={submit}
          disabled={busy}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>{t('createAccount')}</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  inner: { paddingHorizontal: 24 },
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
  button: { backgroundColor: '#0B1F3A', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
