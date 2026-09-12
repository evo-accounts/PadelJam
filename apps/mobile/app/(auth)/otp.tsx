import {
  initialOtpState,
  otpReducer,
  startEmailOtp,
  startPhoneOtp,
  verifyEmailOtp,
  verifyPhoneOtp,
} from '@padel/auth';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useEffect, useReducer, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { runAppleSignIn } from '@/lib/appleSignIn';
import { safeAuthMessage } from '@/lib/authErrors';
import { getAuthTarget } from '@/lib/auth-flow';
import { runGoogleSignIn } from '@/lib/googleSignIn';
import { resolvePostAuthRoute } from '@/lib/postAuthRoute';
import { decidePostVerifyRoute } from '@/lib/postVerifyRoute';
import { supabase } from '@/lib/supabase';
import { colors } from '../../theme';
import { BottomSheet, Button, SheetRow, useBanner } from '../../components/ui';

export default function OtpScreen() {
  const { t } = useT('auth');
  const { t: tc } = useT('common');
  const banner = useBanner();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { identifier, kind } = getAuthTarget();

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [otpState, dispatch] = useReducer(otpReducer, undefined, initialOtpState);
  const [now, setNow] = useState(() => Date.now());
  const [sheetOpen, setSheetOpen] = useState(false);

  // Mark the initial send (sign-in already triggered the first OTP) so the
  // resend cooldown starts ticking on mount.
  useEffect(() => {
    dispatch({ type: 'sent', at: Date.now() });
  }, []);

  // Tick once a second while a cooldown is active, to refresh the countdown.
  useEffect(() => {
    if (otpState.cooldownUntil <= now) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [otpState.cooldownUntil, now]);

  const cooldownRemaining = Math.max(0, Math.ceil((otpState.cooldownUntil - now) / 1000));

  const verify = async () => {
    if (busy) return;
    if (otpState.locked) { banner.show(t('locked')); return; }
    if (code.length < 6) { banner.show(tc('missingInformation')); return; }
    setBusy(true);
    try {
      const { data, error: verifyError } =
        kind === 'phone'
          ? await verifyPhoneOtp(supabase, identifier, code)
          : await verifyEmailOtp(supabase, identifier, code);

      if (verifyError || !data.user) {
        dispatch({ type: 'fail' });
        if (verifyError) {
          const { ns, key } = safeAuthMessage(verifyError);
          banner.show(t(key, { ns }));
        } else {
          banner.show(t('locked'));
        }
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('onboarded_at, location_text, dominant_hand, court_side, notifications_prompted_at')
        .eq('id', data.user.id)
        .maybeSingle();

      const decision = decidePostVerifyRoute(profile, profileError);
      if (decision.kind === 'error') {
        const { ns, key } = safeAuthMessage(decision.message);
        banner.show(t(key, { ns }));
        return;
      }
      router.replace(decision.target);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy || cooldownRemaining > 0) return;
    setBusy(true);
    try {
      const { error: otpError } =
        kind === 'phone'
          ? await startPhoneOtp(supabase, identifier)
          : await startEmailOtp(supabase, identifier);
      if (otpError) {
        const { ns, key } = safeAuthMessage(otpError);
        banner.show(t(key, { ns }));
        return;
      }
      dispatch({ type: 'sent', at: Date.now() });
      setNow(Date.now());
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    if (busy) return;
    setSheetOpen(false);
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
    setSheetOpen(false);
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
    <View style={[styles.container, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.title}>{t('otpTitle')}</Text>
      <Text style={styles.help}>{t('otpHelp', { identifier })}</Text>

      <Text style={styles.label}>{t('otpLabel')}</Text>
      <TextInput
        style={styles.input}
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
        placeholder={t('otpPlaceholder')}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={6}
        editable={!busy && !otpState.locked}
        autoFocus
      />

      <Pressable
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={verify}
        disabled={busy}
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

      <Button label={t('tryAnotherWay')} variant="ghost" onPress={() => setSheetOpen(true)} />

      <BottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title={t('tryAnotherWay')} testID="otp-other-ways-sheet">
        <SheetRow
          label={t('usePassword')}
          onPress={() => { setSheetOpen(false); router.push('/(auth)/password' as never); }}
        />
        <SheetRow
          label={t('useDifferentId')}
          onPress={() => { setSheetOpen(false); dispatch({ type: 'reset' }); router.replace('/(auth)/sign-in'); }}
        />
        <SheetRow label={t('continueWithGoogle')} onPress={onGoogle} />
        <SheetRow label={t('continueWithApple')} onPress={onApple} />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card, paddingHorizontal: 24 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 12 },
  help: { fontSize: 14, color: colors.mutedForeground, marginBottom: 32 },
  label: { fontSize: 14, color: colors.mutedForeground, marginBottom: 8 },
  input: {
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
  button: { backgroundColor: colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.card, fontSize: 16, fontWeight: '600' },
  linkButton: { paddingVertical: 14, alignItems: 'center' },
  link: { color: colors.foreground, fontSize: 15, fontWeight: '600' },
  linkMuted: { color: colors.mutedForeground },
});
