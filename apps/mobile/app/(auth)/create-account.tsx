import {
  initialOtpState,
  otpReducer,
  primaryCredential,
  signInWithPassword,
  startEmailChange,
  startPhoneChange,
  useSession,
  verifyEmailChange,
  verifyPhoneChange,
} from '@padel/auth';
import { useT } from '@padel/i18n';
import { formatDisplayName, isE164 } from '@padel/utils';
import { useRouter } from 'expo-router';
import { useEffect, useReducer, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { detectKind, getAuthTarget } from '@/lib/auth-flow';
import { SUPABASE_URL, supabase } from '@/lib/supabase';
import { colors } from '../../theme';
import { Button } from '../../components/ui';

const TERMS_URL = 'https://padeljam.app/terms';
const PRIVACY_URL = 'https://padeljam.app/privacy';

const ONBOARDING_ROUTE = '/(onboarding)/location';

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

  const [phase, setPhase] = useState<'form' | 'verify'>('form');
  const [fullName, setFullName] = useState(socialName);
  const [secondary, setSecondary] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  // Resend cooldown / attempt lockout for the secondary-identifier OTP (verify phase).
  const [otpState, dispatch] = useReducer(otpReducer, undefined, initialOtpState);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (otpState.cooldownUntil <= now) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [otpState.cooldownUntil, now]);
  const cooldownRemaining = Math.max(0, Math.ceil((otpState.cooldownUntil - now) / 1000));

  const secondaryValue = secondary.trim();
  const secKind = detectKind(secondaryValue);

  // GoTrue rejects a change to an identifier already registered on auth.users (the profiles
  // pre-check in complete-account can't see auth-only users) — reuse the "taken" copy for those.
  const startChangeErrorKey = (err: { code?: string } | null): string => {
    if (err?.code === 'email_exists') return 'email_taken';
    if (err?.code === 'phone_exists') return 'phone_taken';
    return 'sendCodeFailed';
  };

  const startSecondaryChange = async (): Promise<'sent' | 'applied' | 'failed'> => {
    const { data, error: changeErr } =
      secKind === 'phone'
        ? await startPhoneChange(supabase, secondaryValue)
        : await startEmailChange(supabase, secondaryValue);
    if (changeErr) {
      setError(t(startChangeErrorKey(changeErr)));
      return 'failed';
    }
    // If the server has confirmations disabled, GoTrue applies the change immediately (the
    // returned user already carries the new identifier — phone in GoTrue format, no '+').
    // There is no code in flight, so showing the verify step would dead-end.
    const applied =
      secKind === 'phone'
        ? data.user?.phone === secondaryValue.replace(/^\+/, '')
        : data.user?.email?.toLowerCase() === secondaryValue.toLowerCase();
    if (applied) return 'applied';
    dispatch({ type: 'sent', at: Date.now() });
    setNow(Date.now());
    return 'sent';
  };

  const submit = async () => {
    if (busy) return;
    const name = fullName.trim();
    if (!name || !secondaryValue || !password) return;
    if (!agreed) return;
    // The phone must be E164 (+countrycode…). Without this guard a local-format number
    // fails isE164 in detectKind, gets sent as an EMAIL, and surfaces as an opaque 400.
    if (secondaryKind === 'phone' && !isE164(secondaryValue)) {
      setError(t('invalid_phone'));
      return;
    }

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

      const secondaryBody =
        secKind === 'phone' ? { phone: secondaryValue } : { email: secondaryValue };

      // The Edge Function sets the password AND creates the profiles row server-side from the
      // identifiers persisted on auth.users — the client never writes its own identity into the
      // globally-readable profiles table. The secondary identifier goes along only for the fast
      // already-taken pre-check; it is attached below via the VERIFIED change flow, never here.
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/complete-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ ...secondaryBody, password, full_name: formatDisplayName(name) }),
      });

      if (!resp.ok) {
        let code: string | undefined;
        try {
          const body = (await resp.json()) as { error?: string };
          code = body.error;
        } catch {
          // Non-JSON error body — fall through to the generic failure code below.
        }
        // Dev console gets the full detail; the UI copy may collapse it.
        console.warn('[complete-account] failed:', resp.status, code ?? '(no error code in body)');
        if (code === 'email_taken' || code === 'phone_taken' || code === 'invalid_phone') {
          setError(t(code));
        } else {
          // Include the server's error code so real causes (e.g. an identifier already
          // registered at the auth level) are visible instead of a bare status.
          setError(`complete-account-failed:${resp.status}${code ? `:${code}` : ''}`);
        }
        return;
      }

      // complete-account sets a password via the admin API, which rotates the OTP-issued refresh
      // token — the current session would be signed out at the next refresh, mid-onboarding. Mint a
      // fresh, durable session with the password we just set, using the primary verified identifier.
      const cred = primaryCredential({
        primaryKind: isSocial ? 'email' : kind,
        email: session.user.email,
        phone: session.user.phone,
      });
      if (cred) {
        const { error: signInErr } = await signInWithPassword(supabase, cred.identifier, cred.kind, password);
        if (signInErr) {
          setError('session-refresh-failed');
          router.replace('/(auth)/sign-in');
          return;
        }
      }

      // Verify the secondary identifier as the signed-in user: updateUser sends the OTP, the
      // verify phase collects it. Enter the phase even when the send fails — the account already
      // exists, so the user retries (resend) or skips from there instead of resubmitting the form.
      if ((await startSecondaryChange()) === 'applied') {
        router.replace(ONBOARDING_ROUTE);
        return;
      }
      setPhase('verify');
    } finally {
      setBusy(false);
    }
  };

  const verifySecondary = async () => {
    if (busy || otpState.locked || code.length < 6) return;
    setBusy(true);
    setError(null);
    try {
      const { error: verifyError } =
        secKind === 'phone'
          ? await verifyPhoneChange(supabase, secondaryValue, code)
          : await verifyEmailChange(supabase, secondaryValue, code);
      if (verifyError) {
        dispatch({ type: 'fail' });
        setError(verifyError.message);
        return;
      }
      router.replace(ONBOARDING_ROUTE);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy || cooldownRemaining > 0) return;
    setBusy(true);
    setError(null);
    try {
      if ((await startSecondaryChange()) === 'applied') router.replace(ONBOARDING_ROUTE);
    } finally {
      setBusy(false);
    }
  };

  // The secondary is optional (profiles.email/phone are nullable): skipping leaves the profile
  // with just the verified primary; the user can add the other identifier later in settings.
  const skip = () => {
    if (busy) return;
    router.replace(ONBOARDING_ROUTE);
  };

  if (phase === 'verify') {
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
          <Text style={styles.title}>
            {secKind === 'phone' ? t('verifyPhoneTitle') : t('verifyEmailTitle')}
          </Text>
          <Text style={styles.help}>{t('otpHelp', { identifier: secondaryValue })}</Text>

          <Text style={styles.label}>{t('otpLabel')}</Text>
          <TextInput
            style={styles.codeInput}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            placeholder={t('otpPlaceholder')}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={6}
            editable={!busy && !otpState.locked}
            autoFocus
          />

          {otpState.locked ? <Text style={styles.error}>{t('locked')}</Text> : null}
          {error && !otpState.locked ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.button, (busy || otpState.locked || code.length < 6) && styles.buttonDisabled]}
            onPress={verifySecondary}
            disabled={busy || otpState.locked || code.length < 6}
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator color={colors.card} /> : <Text style={styles.buttonText}>{t('verify')}</Text>}
          </Pressable>

          <Pressable
            style={styles.linkButton}
            onPress={resend}
            disabled={busy || cooldownRemaining > 0}
            accessibilityRole="button"
          >
            <Text style={[styles.link, cooldownRemaining > 0 && styles.linkMuted]}>
              {cooldownRemaining > 0 ? t('cooldown', { seconds: cooldownRemaining }) : t('resend')}
            </Text>
          </Pressable>

          <Button
            label={t('skipForNow')}
            variant="ghost"
            disabled={busy}
            onPress={skip}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

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

        <Button
          label={t('createAccount')}
          fullWidth
          loading={busy}
          disabled={!agreed}
          onPress={submit}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  inner: { paddingHorizontal: 24 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 32 },
  help: { fontSize: 14, color: colors.mutedForeground, marginBottom: 32, marginTop: -20 },
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
  codeInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
    marginBottom: 16,
  },
  inputDisabled: { backgroundColor: colors.muted, color: colors.mutedForeground },
  error: { color: colors.destructive, marginBottom: 16 },
  button: { backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.card, fontSize: 16, fontWeight: '600' },
  linkButton: { paddingVertical: 14, alignItems: 'center' },
  link: { color: colors.foreground, fontSize: 15, fontWeight: '600' },
  linkMuted: { color: colors.mutedForeground },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 16, marginBottom: 4 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.ring, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkboxMark: { color: colors.card, fontSize: 14, fontWeight: '800' },
  termsText: { flex: 1, fontSize: 13, color: colors.mutedForeground, lineHeight: 18 },
  termsLink: { color: colors.primary, fontWeight: '700' },
});
