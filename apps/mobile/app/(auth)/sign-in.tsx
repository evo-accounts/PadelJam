import { startEmailOtp, startPhoneOtp } from '@padel/auth';
import { useT } from '@padel/i18n';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { runAppleSignIn } from '@/lib/appleSignIn';
import { detectKind, setAuthTarget } from '@/lib/auth-flow';
import { runGoogleSignIn } from '@/lib/googleSignIn';
import { resolvePostAuthRoute } from '@/lib/postAuthRoute';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  const TERMS_URL = 'https://padeljam.app/terms';
  const PRIVACY_URL = 'https://padeljam.app/privacy';
  const { t } = useT('auth');
  const [disclosureBefore, disclosureRest] = t('socialTermsDisclosure').split('{{termsLink}}');
  const [disclosureMiddle, disclosureAfter] = (disclosureRest ?? '').split('{{privacyLink}}');
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

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

  const onGoogle = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await runGoogleSignIn();
      router.replace((await resolvePostAuthRoute()) as never);
    } catch (e) {
      setError(t(e instanceof Error ? e.message : 'oauth_failed'));
    } finally {
      setBusy(false);
    }
  };

  const onApple = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await runAppleSignIn();
      router.replace((await resolvePostAuthRoute()) as never);
    } catch (e) {
      if (e instanceof Error && e.message === 'oauth_cancelled') { setBusy(false); return; }
      setError(t(e instanceof Error ? e.message : 'oauth_failed'));
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
        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>{t('orDivider')}</Text>
          <View style={styles.divider} />
        </View>
        <Pressable
          style={[styles.googleButton, busy && styles.buttonDisabled]}
          onPress={onGoogle}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={styles.googleButtonText}>{t('continueWithGoogle')}</Text>
        </Pressable>
        {Platform.OS === 'ios' && appleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={12}
            style={styles.appleButton}
            onPress={onApple}
          />
        ) : (
          <Pressable
            style={[styles.googleButton, busy && styles.buttonDisabled]}
            onPress={onApple}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={styles.googleButtonText}>{t('continueWithApple')}</Text>
          </Pressable>
        )}
        <Text style={styles.disclosure}>
          {disclosureBefore}
          <Text style={styles.disclosureLink} onPress={() => void Linking.openURL(TERMS_URL)}>
            {t('termsLink')}
          </Text>
          {disclosureMiddle}
          <Text style={styles.disclosureLink} onPress={() => void Linking.openURL(PRIVACY_URL)}>
            {t('privacyLink')}
          </Text>
          {disclosureAfter}
        </Text>
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
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  divider: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#ccc' },
  dividerText: { fontSize: 13, color: '#888' },
  googleButton: { borderWidth: 1, borderColor: '#ccc', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  googleButtonText: { color: '#0B1F3A', fontSize: 16, fontWeight: '600' },
  appleButton: { height: 48, marginTop: 12 },
  disclosure: { fontSize: 11, color: '#9AA7B6', textAlign: 'center', marginTop: 16, lineHeight: 16 },
  disclosureLink: { color: '#0B7BFF', fontWeight: '600' },
});
