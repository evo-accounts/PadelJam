import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { formatDisplayName } from '@padel/utils';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { detectKind, getAuthTarget } from '@/lib/auth-flow';
import { SUPABASE_URL, supabase } from '@/lib/supabase';

const TERMS_URL = 'https://padeljam.app/terms';
const PRIVACY_URL = 'https://padeljam.app/privacy';

export default function CreateAccountScreen() {
  const { t } = useT('auth');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { kind } = getAuthTarget();

  // Social sign-up (e.g. Google) arrives with a verified email; pre-fill from the session.
  const { session } = useSession();
  const provider = session?.user?.app_metadata?.provider;
  const isSocial = provider != null && provider !== 'email' && provider !== 'phone';
  const socialEmail = session?.user?.email ?? '';
  const socialName =
    (session?.user?.user_metadata?.full_name as string | undefined) ??
    (session?.user?.user_metadata?.name as string | undefined) ??
    '';

  // The primary identifier is already verified; ask for the missing one.
  // For social sign-up the verified identifier is the email, so collect the phone.
  const secondaryKind = isSocial ? 'phone' : kind === 'phone' ? 'email' : 'phone';

  const [fullName, setFullName] = useState(socialName);
  const [secondary, setSecondary] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  const submit = async () => {
    if (busy) return;
    const name = fullName.trim();
    const secondaryValue = secondary.trim();
    if (!name || !secondaryValue || !password) return;
    if (!agreed) return;

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

        {isSocial ? (
          <>
            <Text style={styles.label}>{t('secondaryEmailLabel')}</Text>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={socialEmail}
              editable={false}
            />
          </>
        ) : null}

        <Text style={styles.label}>{t('fullNameLabel')}</Text>
        <TextInput
          style={[styles.input, isSocial && styles.inputDisabled]}
          value={fullName}
          onChangeText={setFullName}
          placeholder={t('fullNamePlaceholder')}
          autoCapitalize="words"
          editable={!busy && !isSocial}
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

        <Pressable style={styles.termsRow} onPress={() => setAgreed((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: agreed }}>
          <View style={[styles.checkbox, agreed && styles.checkboxOn]}>
            {agreed ? <Text style={styles.checkboxMark}>✓</Text> : null}
          </View>
          <Text style={styles.termsText}>
            {t('termsAgreePrefix')}
            <Text style={styles.termsLink} onPress={() => void Linking.openURL(TERMS_URL)}>{t('termsLink')}</Text>
            {t('termsAnd')}
            <Text style={styles.termsLink} onPress={() => void Linking.openURL(PRIVACY_URL)}>{t('privacyLink')}</Text>
          </Text>
        </Pressable>

        <Pressable
          style={[styles.button, (busy || !agreed) && styles.buttonDisabled]}
          onPress={submit}
          disabled={busy || !agreed}
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
  inputDisabled: { backgroundColor: '#F0F3F8', color: '#6B7685' },
  error: { color: '#c0392b', marginBottom: 16 },
  button: { backgroundColor: '#0B1F3A', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 16, marginBottom: 4 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#9AA7B6', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxOn: { backgroundColor: '#0B7BFF', borderColor: '#0B7BFF' },
  checkboxMark: { color: '#fff', fontSize: 14, fontWeight: '800' },
  termsText: { flex: 1, fontSize: 13, color: '#3A4A5E', lineHeight: 18 },
  termsLink: { color: '#0B7BFF', fontWeight: '700' },
});
