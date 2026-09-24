/**
 * Password recovery, step 1 of 3: the code (UX-AUTH-07).
 *
 * This screen used to be all three steps in one file, switching on a local
 * `Step` union, and its last step signed the user IN. The flow is now three
 * routes — recovery -> new-password -> password-changed — each reached with
 * `replace`, so the stack never holds a previous step and a back swipe cannot
 * reopen a code screen whose code has already been spent.
 *
 * The code entry itself is `CodeField`, which is what the OTP and
 * create-account screens use: the audit's two complaints here — a bare,
 * unlabelled 16pt input styled unlike the OTP screen's, and a differently
 * styled resend link — stop being possible once the primitive owns both.
 */
import { safeAuthMessage, startEmailOtp, startPhoneOtp, verifyEmailOtp, verifyPhoneOtp } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAuthTarget } from '@/lib/auth-flow';
import { supabase } from '@/lib/supabase';
import { useOtpCountdown } from '@/lib/useOtpCountdown';
import { colors, space } from '../../theme';
import { Button, CodeField, Screen, Text, TopBar, useBanner } from '../../components/ui';

const CODE_LENGTH = 6;

export default function RecoveryCodeScreen() {
  const { t } = useT('auth');
  const { t: tc } = useT('common');
  const banner = useBanner();
  const router = useRouter();
  const { identifier, kind } = getAuthTarget();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /**
   * Bumped on every rejected code. It is the `CodeField`'s `key`, so a failure
   * remounts the field: the boxes come back empty and `autoFocus` runs again.
   * `CodeField` exposes no imperative handle, and the audit asks for exactly
   * this — the user must not have to backspace six digits by hand before
   * retyping. The remount is cheap and the keyboard stays up.
   */
  const [attempt, setAttempt] = useState(0);
  const { state: otp, dispatch, remaining } = useOtpCountdown();

  /**
   * The auth-flow singleton is module state: it does not survive a process
   * restart, and expo-router will happily restore this route after one. Landing
   * here with no identifier means sending a code to the empty string and
   * verifying it forever — a silent dead end. Bounce to sign-in instead.
   */
  useEffect(() => {
    if (!identifier) router.replace('/(auth)/sign-in');
  }, [identifier, router]);

  /**
   * Send the recovery code on arrival, exactly once per mount. The OTP helpers
   * resolve with `{ error }` rather than throwing on a Supabase-level failure,
   * so the result has to be inspected. The ref guard matters: without it a new
   * `t` identity (locale load) would re-run this and burn a rate-limit slot.
   */
  const sent = useRef(false);
  useEffect(() => {
    if (!identifier || sent.current) return;
    sent.current = true;
    (kind === 'phone' ? startPhoneOtp(supabase, identifier) : startEmailOtp(supabase, identifier))
      .then(({ error: sendError }) => {
        if (sendError) {
          const { ns, key } = safeAuthMessage(sendError);
          banner.show(t(key, { ns }));
          return;
        }
        dispatch({ type: 'sent', at: Date.now() });
      })
      .catch(() => banner.show(t('locked')));
  }, [identifier, kind, t, banner, dispatch]);

  /** Typing is the correction — clear the red state on the next keystroke (UX-GLOB-06). */
  const onChangeCode = (next: string) => {
    setCode(next);
    if (error) setError(null);
  };

  const verify = async () => {
    if (busy) return;
    if (otp.locked) { banner.show(t('locked')); return; }
    if (code.length < CODE_LENGTH) { banner.show(tc('missingInformation')); return; }
    setBusy(true);
    try {
      const { data, error: verifyError } =
        kind === 'phone'
          ? await verifyPhoneOtp(supabase, identifier, code)
          : await verifyEmailOtp(supabase, identifier, code);

      if (verifyError || !data.user) {
        dispatch({ type: 'fail' });
        // A verify that comes back without an error AND without a user is a bad
        // code by elimination — there is no other way to reach it.
        const { ns, key } = verifyError ? safeAuthMessage(verifyError) : { ns: 'auth' as const, key: 'invalidCode' };
        const message = t(key, { ns });
        // Both halves, deliberately (UX-GLOB-06): the boxes turn red AND the
        // banner shows. The same message in both, so the field never claims the
        // code was wrong when the real problem was the network.
        setError(message);
        banner.show(message);
        // Only wipe what the user typed when the CODE is what failed. A network
        // or rate-limit failure says nothing about the digits, and clearing
        // them there would make the user retype a code that was fine.
        if (key === 'invalidCode') {
          setCode('');
          setAttempt((n) => n + 1);
        }
        return;
      }

      // A verified recovery code IS a session — that is what authorises the
      // password update on the next screen. It is torn down there, the moment
      // the update lands; see new-password.tsx.
      router.replace('/(auth)/new-password');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy || remaining > 0) return;
    setBusy(true);
    try {
      const { error: otpError } =
        kind === 'phone' ? await startPhoneOtp(supabase, identifier) : await startEmailOtp(supabase, identifier);
      if (otpError) {
        const { ns, key } = safeAuthMessage(otpError);
        banner.show(t(key, { ns }));
        return;
      }
      dispatch({ type: 'sent', at: Date.now() });
      setError(null);
      setCode('');
      setAttempt((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Explicit target, not useGoBack(): its fallback is '/', which drops a
          signed-out user on the splash. Back from here is the password screen
          the "Forgot password?" link came from. */}
      <TopBar variant="nav" onBack={() => router.replace('/(auth)/password')} />
      <Screen style={styles.body}>
        <Text variant="title">{t('recoveryTitle')}</Text>
        <Text variant="body" tone="muted" style={styles.help}>
          {t('recoveryCodeSent', { identifier })}
        </Text>

        <CodeField
          key={attempt}
          label={t('otpLabel')}
          value={code}
          onChangeText={onChangeCode}
          error={error}
          // iOS reads an emailed code out of Mail too; Android's SMS retriever
          // must not be armed for a code that will never arrive as a message.
          autofill={kind === 'phone' ? 'sms' : 'email'}
          editable={!busy}
          autoFocus
          testID="recovery-code"
        />

        {/* UX-AUTH-07: the resend belongs DIRECTLY BELOW the input, before the
            primary action — it is what someone reaches for when the code never
            arrived, and burying it under the CTA is what the audit flagged. */}
        <Button
          label={remaining > 0 ? t('cooldown', { seconds: remaining }) : t('resend')}
          variant="ghost"
          disabled={busy || remaining > 0}
          onPress={resend}
          fullWidth
          style={styles.resend}
          testID="recovery-resend"
        />

        <Button
          label={t('continue')}
          fullWidth
          loading={busy}
          onPress={verify}
          style={styles.cta}
          testID="recovery-continue"
        />
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: { paddingTop: space[6] },
  help: { marginTop: space[2], marginBottom: space[6] },
  resend: { marginTop: space[1] },
  cta: { marginTop: space[3] },
});
