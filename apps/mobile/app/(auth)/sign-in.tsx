/**
 * Login or Sign Up (UX-AUTH-02).
 *
 * PHONE IS THE DEFAULT, AND THE MODE DECIDES THE CHANNEL. The screen used to
 * show one box and guess: `detectKind` called anything that failed `isE164` an
 * email, so a number typed the way people actually type one — `912345678`, no
 * '+' — was sent to the EMAIL OTP endpoint and came back as an opaque failure.
 * That is the audit's "the phone flow does not work end to end". There is no
 * guessing left here: `mode` is what the user is looking at, and it is what is
 * passed to `startPhoneOtp` / `startEmailOtp` and stored on the auth flow.
 *
 * The third outline button is a MODE TOGGLE, not a sign-in method. It sits with
 * Google and Apple because that is where someone looks for "some other way in",
 * but all it does is swap the input.
 *
 * The Apple button stays the NATIVE `AppleAuthenticationButton` with
 * `buttonType: CONTINUE` — it renders "Continue with Apple" itself. A custom
 * pressable with our own label would match the other buttons and be an App
 * Store rejection (Human Interface Guidelines, Sign in with Apple).
 */
import { safeAuthMessage, startEmailOtp, startPhoneOtp } from '@padel/auth';
import { isEmailShape } from '@padel/utils';
import { useT } from '@padel/i18n';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TermsLine } from '@/components/auth/TermsLine';
import { runAppleSignIn } from '@/lib/appleSignIn';
import { setAuthMethods, setAuthTarget, type IdentifierKind } from '@/lib/auth-flow';
import { lookupAuthMethods } from '@/lib/authMethodsLookup';
import { runGoogleSignIn } from '@/lib/googleSignIn';
import { resolvePostAuthRoute } from '@/lib/postAuthRoute';
import { supabase } from '@/lib/supabase';
import { useFieldErrors } from '@/lib/useFieldErrors';
import { colors, radius, space } from '../../theme';
import { Button, Field, PhoneField, Screen, Text, TopBar, useBanner } from '../../components/ui';


export default function SignInScreen() {
  const { t } = useT('auth');
  const { t: tc } = useT('common');
  const banner = useBanner();
  const router = useRouter();

  /**
   * Phone by default (UX-AUTH-02). The param is how the OTP screen's "Try
   * another way" hands the user over when they pick the account's OTHER
   * channel: the lookup only ever reports that channel MASKED, so the code
   * cannot be sent from there — this screen has to be the one that collects it,
   * already switched to the right input. Anything other than 'email' falls back
   * to phone rather than throwing on a hand-typed deep link.
   */
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<IdentifierKind>(modeParam === 'email' ? 'email' : 'phone');
  const [email, setEmail] = useState('');
  /** E.164, or '' while the number is incomplete — `PhoneField`'s contract. */
  const [phone, setPhone] = useState('');
  const [phoneValid, setPhoneValid] = useState(false);
  const [busy, setBusy] = useState(false);
  const { errors: fieldErrors, setErrors: setFieldErrors, clear: clearFieldError } =
    useFieldErrors<'identifier'>();

  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'ios') AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

  /**
   * Swap the input. Clearing the value is the point: a phone number left in
   * state while the email box is showing is a number the user can no longer see
   * or correct, and Continue would send a code to it.
   */
  const toggleMode = () => {
    setMode((m) => (m === 'phone' ? 'email' : 'phone'));
    setEmail('');
    setPhone('');
    setPhoneValid(false);
    clearFieldError('identifier');
  };

  const onContinue = async () => {
    if (busy) return;
    const value = mode === 'phone' ? phone : email.trim();
    const invalid = mode === 'phone' ? !phoneValid || !value : !isEmailShape(value);
    if (invalid) {
      // UX-GLOB-06: redden the field AND banner it. The field says which input
      // is wrong; the banner says it out loud, including to a screen reader.
      const message = mode === 'phone' ? t('invalid_phone') : tc('missingInformation');
      setFieldErrors({ identifier: message });
      banner.show(message);
      return;
    }
    setFieldErrors({});

    setBusy(true);
    try {
      /**
       * AWAITED, and before the send, because the send CREATES the account:
       * `signInWithOtp` signs up unknown identifiers by default. Run the two
       * together and a brand-new user races into existence mid-lookup, and the
       * "Try another way" sheet describes the account the send just made rather
       * than the one the user came with — offering, among other things, a
       * password they have never set (see `has_password`). One extra round trip
       * buys an answer that is about the user, not about our own side effect.
       *
       * `.catch` here, not `try`: a lookup that fails must never fail a sign-in
       * — it becomes `null`, which is the same thing an unknown identifier
       * produces, so the sheet renders its only-way-in state either way.
       */
      const methods = await lookupAuthMethods(value).catch(() => null);

      const { error: otpError } =
        mode === 'phone'
          ? await startPhoneOtp(supabase, value)
          : await startEmailOtp(supabase, value);
      if (otpError) {
        const { ns, key } = safeAuthMessage(otpError);
        banner.show(t(key, { ns }));
        return;
      }

      setAuthTarget(value, mode, mode);
      setAuthMethods(value, methods);
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
      if (e instanceof Error && e.message === 'oauth_cancelled') { setBusy(false); return; }
      const { ns, key } = safeAuthMessage(e);
      banner.show(t(key, { ns }));
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
      const { ns, key } = safeAuthMessage(e);
      banner.show(t(key, { ns }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Back only when there IS a back: reached from welcome there is nothing
          behind this screen, and useGoBack() is not an option in (auth) —
          its '/' fallback drops a signed-out user on the splash. */}
      <TopBar variant="nav" onBack={router.canGoBack() ? () => router.back() : undefined} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Screen scroll style={styles.body}>
          {/* The title stays in the BODY, not in the TopBar: it is the screen's
              heading, and the audit asks for it at this size. */}
          <Text variant="title" style={styles.title}>
            {t('title')}
          </Text>

          {mode === 'phone' ? (
            <PhoneField
              label={t('phoneLabel')}
              value={phone}
              onChangeValue={(e164, meta) => {
                setPhone(e164);
                setPhoneValid(meta.valid);
                clearFieldError('identifier');
              }}
              error={fieldErrors.identifier}
              editable={!busy}
              testID="sign-in-phone"
            />
          ) : (
            <Field
              label={t('emailLabel')}
              value={email}
              onChangeText={(v) => { setEmail(v); clearFieldError('identifier'); }}
              error={fieldErrors.identifier}
              placeholder={t('emailPlaceholder')}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              inputMode="email"
              autoComplete="email"
              editable={!busy}
              testID="sign-in-email"
            />
          )}

          <Button
            label={t('continue')}
            fullWidth
            loading={busy}
            onPress={onContinue}
            style={styles.cta}
            testID="sign-in-continue"
          />

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text variant="caption" tone="muted">{t('orDivider')}</Text>
            <View style={styles.divider} />
          </View>

          <Button
            label={t('continueWithGoogle')}
            variant="outline"
            fullWidth
            loading={busy}
            onPress={onGoogle}
            testID="sign-in-google"
          />

          {Platform.OS === 'ios' && appleAvailable ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={radius.md}
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
              style={styles.method}
            />
          )}

          <Button
            label={mode === 'phone' ? t('continueWithEmail') : t('continueWithPhone')}
            variant="outline"
            fullWidth
            disabled={busy}
            onPress={toggleMode}
            style={styles.method}
            testID="sign-in-toggle-mode"
          />

          <TermsLine style={styles.terms} />
        </Screen>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  body: { paddingTop: space[6], paddingBottom: space[6] },
  title: { marginBottom: space[6] },
  cta: { marginTop: space[5] },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], marginVertical: space[5] },
  divider: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  method: { marginTop: space[3] },
  // Matched to `Button`'s md size so the native button lines up with ours.
  appleButton: { height: 44, marginTop: space[3] },
  terms: { marginTop: space[6] },
});
