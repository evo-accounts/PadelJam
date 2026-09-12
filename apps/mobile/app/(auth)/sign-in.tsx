import { startEmailOtp, startPhoneOtp } from '@padel/auth';
import { useT } from '@padel/i18n';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { runAppleSignIn } from '@/lib/appleSignIn';
import { safeAuthMessage } from '@/lib/authErrors';
import { detectKind, setAuthTarget } from '@/lib/auth-flow';
import { runGoogleSignIn } from '@/lib/googleSignIn';
import { resolvePostAuthRoute } from '@/lib/postAuthRoute';
import { supabase } from '@/lib/supabase';
import { colors, palette } from '../../theme';
import { Button, useBanner } from '../../components/ui';

export default function SignInScreen() {
  const TERMS_URL = 'https://padeljam.app/terms';
  const PRIVACY_URL = 'https://padeljam.app/privacy';
  const { t } = useT('auth');
  const { t: tc } = useT('common');
  const banner = useBanner();
  const [disclosureBefore, disclosureRest] = t('socialTermsDisclosure').split('{{termsLink}}');
  const [disclosureMiddle, disclosureAfter] = (disclosureRest ?? '').split('{{privacyLink}}');
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

  const onContinue = async () => {
    if (busy) return;
    const value = identifier.trim();
    if (!value) { banner.show(tc('missingInformation')); return; }
    const kind = detectKind(value);
    setBusy(true);
    try {
      const { error: otpError } =
        kind === 'phone'
          ? await startPhoneOtp(supabase, value)
          : await startEmailOtp(supabase, value);
      if (otpError) {
        const { ns, key } = safeAuthMessage(otpError);
        banner.show(t(key, { ns }));
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
    try {
      await runGoogleSignIn();
      router.replace((await resolvePostAuthRoute()) as never);
    } catch (e) {
      banner.show(t(e instanceof Error ? e.message : 'oauth_failed'));
    } finally {
      setBusy(false);
    }
  };

  const onApple = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await runAppleSignIn();
      router.replace((await resolvePostAuthRoute()) as never);
    } catch (e) {
      if (e instanceof Error && e.message === 'oauth_cancelled') { setBusy(false); return; }
      banner.show(t(e instanceof Error ? e.message : 'oauth_failed'));
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
        <Button
          label={t('continue')}
          fullWidth
          loading={busy}
          onPress={onContinue}
        />
        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>{t('orDivider')}</Text>
          <View style={styles.divider} />
        </View>
        <Button
          label={t('continueWithGoogle')}
          variant="outline"
          fullWidth
          loading={busy}
          onPress={onGoogle}
        />
        {Platform.OS === 'ios' && appleAvailable ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={12}
            style={styles.appleButton}
            onPress={onApple}
          />
        ) : (
          <Button
            label={t('continueWithApple')}
            variant="outline"
            fullWidth
            loading={busy}
            onPress={onApple}
          />
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
  container: { flex: 1, backgroundColor: colors.card },
  inner: { flex: 1, paddingHorizontal: 24, justifyContent: 'flex-start' },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 32 },
  label: { fontSize: 14, color: colors.mutedForeground, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  button: {
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.card, fontSize: 16, fontWeight: '600' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  divider: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.muted },
  dividerText: { fontSize: 13, color: palette.slate[400] },
  googleButton: { borderWidth: 1, borderColor: colors.border, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  googleButtonText: { color: colors.foreground, fontSize: 16, fontWeight: '600' },
  appleButton: { height: 48, marginTop: 12 },
  disclosure: { fontSize: 11, color: palette.slate[400], textAlign: 'center', marginTop: 16, lineHeight: 16 },
  disclosureLink: { color: colors.primary, fontWeight: '600' },
});
