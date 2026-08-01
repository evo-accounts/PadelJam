import {
  initialOtpState,
  otpReducer,
  setPassword as setUserPassword,
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

import { getAuthTarget } from '@/lib/auth-flow';
import { supabase } from '@/lib/supabase';
import { colors, palette } from '../../theme';

type Step = 'code' | 'password' | 'done';

export default function RecoveryScreen() {
  const { t } = useT('auth');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { identifier, kind } = getAuthTarget();

  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otp, dispatch] = useReducer(otpReducer, undefined, initialOtpState);
  const [now, setNow] = useState(Date.now());

  // Auto-send the recovery code to the entered identifier on mount. The OTP helpers resolve with
  // { error } (they don't throw on a Supabase-level failure), so inspect it and surface a real error.
  useEffect(() => {
    (kind === 'phone' ? startPhoneOtp(supabase, identifier) : startEmailOtp(supabase, identifier))
      .then(({ error: sendErr }) => {
        if (sendErr) setError(sendErr.message);
        else dispatch({ type: 'sent', at: Date.now() });
      })
      .catch(() => setError(t('locked')));
  }, [identifier, kind, t]);

  useEffect(() => {
    if (otp.cooldownUntil <= now) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [otp.cooldownUntil, now]);
  const cooldown = Math.max(0, Math.ceil((otp.cooldownUntil - now) / 1000));

  const verifyCode = async () => {
    if (busy || code.length < 6) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: vErr } =
        kind === 'phone'
          ? await verifyPhoneOtp(supabase, identifier, code)
          : await verifyEmailOtp(supabase, identifier, code);
      if (vErr || !data.user) {
        setError(vErr?.message ?? t('passwordWrong'));
        return;
      }
      setStep('password');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy || cooldown > 0) return;
    setBusy(true);
    try {
      await (kind === 'phone' ? startPhoneOtp(supabase, identifier) : startEmailOtp(supabase, identifier));
      dispatch({ type: 'sent', at: Date.now() });
      setNow(Date.now());
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async () => {
    if (busy) return;
    if (pw.length < 8) { setError(t('passwordTooShort')); return; }
    if (pw !== pw2) { setError(t('passwordsDontMatch')); return; }
    setBusy(true);
    setError(null);
    try {
      const { error: sErr } = await setUserPassword(supabase, pw);
      if (sErr) { setError(t('passwordWrong')); return; }
      setStep('done');
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    const { data } = await supabase.auth.getUser();
    const { data: profile } = data.user
      ? await supabase.from('profiles').select('id').eq('id', data.user.id).maybeSingle()
      : { data: null };
    router.replace(profile ? '/(tabs)' : '/(auth)/create-account');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
      {step === 'code' ? (
        <>
          <Text style={styles.title}>{t('recoveryTitle')}</Text>
          <Text style={styles.help}>{t('recoveryCodeSent', { identifier })}</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={6}
            editable={!busy}
            autoFocus
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={[styles.button, (busy || code.length < 6) && styles.buttonDisabled]} onPress={verifyCode} disabled={busy || code.length < 6} accessibilityRole="button">
            {busy ? <ActivityIndicator color={colors.card} /> : <Text style={styles.buttonText}>{t('continue')}</Text>}
          </Pressable>
          <Pressable style={styles.linkButton} onPress={resend} disabled={busy || cooldown > 0} accessibilityRole="button">
            <Text style={[styles.link, cooldown > 0 && { color: palette.slate[400] }]}>{cooldown > 0 ? t('cooldown', { seconds: cooldown }) : t('resend')}</Text>
          </Pressable>
        </>
      ) : step === 'password' ? (
        <>
          <Text style={styles.title}>{t('newPasswordTitle')}</Text>
          <Text style={styles.label}>{t('newPasswordLabel')}</Text>
          <TextInput style={styles.input} value={pw} onChangeText={setPw} secureTextEntry autoCapitalize="none" editable={!busy} />
          <Text style={[styles.label, { marginTop: 12 }]}>{t('confirmPasswordLabel')}</Text>
          <TextInput style={styles.input} value={pw2} onChangeText={setPw2} secureTextEntry autoCapitalize="none" editable={!busy} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={[styles.button, busy && styles.buttonDisabled]} onPress={savePassword} disabled={busy} accessibilityRole="button">
            {busy ? <ActivityIndicator color={colors.card} /> : <Text style={styles.buttonText}>{t('continue')}</Text>}
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.title}>{t('recoveryDoneTitle')}</Text>
          <Pressable style={styles.button} onPress={finish} accessibilityRole="button">
            <Text style={styles.buttonText}>{t('recoveryDoneCta')}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 24 },
  title: { fontSize: 24, fontWeight: '800', color: colors.foreground, marginBottom: 8 },
  help: { fontSize: 14, color: colors.mutedForeground, marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', color: colors.foreground, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: colors.card },
  error: { color: colors.destructive, fontSize: 13, marginTop: 8 },
  button: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.card, fontWeight: '700', fontSize: 16 },
  linkButton: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  link: { color: colors.primary, fontWeight: '600', fontSize: 14 },
});
