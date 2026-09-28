/**
 * The verification code screen (UX-AUTH-03).
 *
 * What the audit found, and what changed:
 *
 *   - a bare `TextInput` with `letterSpacing: 8` pretending to be a code field.
 *     It is `CodeField` now, the same one recovery and create-account use, so
 *     autofill, the six boxes and the error treatment are one implementation.
 *   - the resend BELOW the primary button. It is what someone reaches for when
 *     the code never arrived, so it now sits DIRECTLY UNDER THE INPUT, above
 *     Verify. (The E2E asserts that order by comparing frames — the point is
 *     cheap to get wrong in a refactor.)
 *   - a hand-rolled `Pressable` for Verify, which surfaced to the accessibility
 *     tree as a GenericElement. The E2E carried a documented workaround for it
 *     ("match by label only"); it is a real `Button` now and the suite matches
 *     `{ label: 'Verify', type: 'Button' }` again.
 *   - "Try another way" as a ghost link of the same weight as the resend, over
 *     a sheet of four hard-coded options. It is a SECONDARY button now, and the
 *     sheet is derived — see `TryAnotherWaySheet`.
 *   - a raw E.164 number in the help line. Formatted for reading now.
 *
 * `t('otpTitle')` resolves to "Confirm if it's you" from packages/i18n, NOT to
 * the string in i18n-mobile.ts: `registerMobileCopy` calls `addResourceBundle`
 * with `overwrite=false`, so the shared JSON wins for a key both catalogs
 * declare. Both are real copy, one of them is unreachable, and suite 01 asserts
 * the reachable one.
 *
 * NO AUTO-SUBMIT on `onComplete`. Six digits arriving by autofill would fire a
 * verify that races the user's own Verify tap — two verifies for one code, the
 * second of which fails against a code the first has already spent — and can
 * land on a screen that is already navigating away. `onComplete` drops the
 * keyboard and nothing else.
 */
import {
  startEmailOtp,
  startPhoneOtp,
  verifyEmailOtp,
  verifyPhoneOtp,
  safeAuthMessage,
} from '@padel/auth';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TryAnotherWaySheet } from '@/components/auth/TryAnotherWaySheet';
import { runAppleSignIn } from '@/lib/appleSignIn';
import { clearAuthTarget, getAuthTarget, setAuthMethods } from '@/lib/auth-flow';
import type { AuthMethod, AuthMethods } from '@/lib/authMethods';
import { lookupAuthMethods } from '@/lib/authMethodsLookup';
import { formatE164ForDisplay } from '@/lib/countries';
import { runGoogleSignIn } from '@/lib/googleSignIn';
import { resolvePostAuthRoute } from '@/lib/postAuthRoute';
import { decidePostVerifyRoute } from '@/lib/postVerifyRoute';
import { supabase } from '@/lib/supabase';
import { useOtpCountdown } from '@/lib/useOtpCountdown';
import { colors, space } from '../../theme';
import { Button, CodeField, Screen, Text, TopBar, useBanner } from '../../components/ui';

const CODE_LENGTH = 6;

export default function OtpScreen() {
  const { t } = useT('auth');
  const { t: tc } = useT('common');
  const banner = useBanner();
  const router = useRouter();
  const { identifier, kind } = getAuthTarget();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  /**
   * Bumped on every rejected code, and used as `CodeField`'s `key` so a failure
   * REMOUNTS the field: the boxes come back empty and `autoFocus` runs again.
   * `CodeField` exposes no imperative handle, and leaving six wrong digits in
   * place for the user to backspace is the hostile version of this screen.
   */
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [methods, setMethods] = useState<AuthMethods | null>(null);
  const [methodsLoading, setMethodsLoading] = useState(false);
  const { state: otp, dispatch, remaining } = useOtpCountdown();

  /** 'sms' or 'email' — the channel the code in flight went over. Never listed in the sheet. */
  const inUse: AuthMethod = kind === 'phone' ? 'sms' : 'email';

  /**
   * The auth-flow singleton is module state: it does not survive a process
   * restart, and expo-router will happily restore this route after one. Landing
   * here with no identifier means verifying codes against the empty string
   * forever — a silent dead end. Bounce to sign-in, as the other (auth) screens
   * now do.
   *
   * ON ARRIVAL, not reactively — the one place this differs from recovery.tsx,
   * and it has to. `startOver` and the cross-channel picks below CLEAR the
   * target and then navigate somewhere specific; a guard watching `identifier`
   * would see the clear, re-run, and `replace` to a plain '/(auth)/sign-in'
   * over the top of the navigation that had just been issued — losing the
   * `mode` param, i.e. the whole point of the pick. recovery.tsx never clears
   * its own target, so the reactive form is safe there.
   */
  const missingOnArrival = useRef(!identifier);
  useEffect(() => {
    if (missingOnArrival.current) router.replace('/(auth)/sign-in');
  }, [router]);

  /**
   * sign-in already sent the first code, so the cooldown has to start ticking
   * on arrival — otherwise the resend button offers itself immediately and the
   * tap is refused by the server instead of by the UI.
   */
  useEffect(() => {
    dispatch({ type: 'sent', at: Date.now() });
  }, [dispatch]);

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
        // Five failures and `otpReducer` locks the screen; that behaviour is
        // unchanged, it is just the CodeField that goes uneditable now.
        dispatch({ type: 'fail' });
        // A verify that comes back without an error AND without a user is a bad
        // code by elimination — there is no other way to reach it.
        const { ns, key } = verifyError ? safeAuthMessage(verifyError) : { ns: 'auth' as const, key: 'invalidCode' };
        const message = t(key, { ns });
        // Both halves (UX-GLOB-06): the boxes turn red AND the banner shows, in
        // the identical words, so the field never claims the code was wrong
        // when the real problem was the network.
        setError(message);
        banner.show(message);
        // Only wipe what the user typed when the CODE is what failed. A network
        // blip or a rate limit says nothing about the digits, and clearing them
        // there would make someone retype a code that was fine.
        if (key === 'invalidCode') {
          setCode('');
          setAttempt((n) => n + 1);
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
    if (busy || remaining > 0) return;
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
      setError(null);
      setCode('');
      setAttempt((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Open the sheet IMMEDIATELY, with whatever is known.
   *
   * sign-in resolves the lookup before it sends, so by the time anyone can
   * reach this button the answer is already on the auth-flow singleton — read
   * here rather than at mount, because the singleton is not reactive and a
   * mount-time snapshot would miss a later write. When it genuinely is not
   * there (a restored route, a lookup that failed), the tap still
   * opens the sheet and the sheet shows its loading state. Blocking the tap on
   * a network call is the one thing this must not do.
   */
  const openSheet = () => {
    const known = methods ?? getAuthTarget().methods;
    if (known) setMethods(known);
    setSheetOpen(true);
    if (known || methodsLoading || !identifier) return;
    setMethodsLoading(true);
    lookupAuthMethods(identifier)
      .catch(() => null)
      .then((m) => {
        // Write it back so a second tap does not spend another of the five
        // lookups this identifier is allowed per quarter hour (migration 0096).
        setAuthMethods(identifier, m);
        setMethods(m);
      })
      .finally(() => setMethodsLoading(false));
  };

  const startOver = () => {
    setSheetOpen(false);
    clearAuthTarget();
    router.replace('/(auth)/sign-in');
  };

  const onGoogle = async () => {
    if (busy) return;
    setSheetOpen(false);
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
    setSheetOpen(false);
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

  /**
   * Route a picked method.
   *
   * THE CROSS-CHANNEL ROWS DO NOT SEND FROM HERE, and cannot. `inUse` is always
   * the channel of the identifier we hold, and `availableMethods` removes it —
   * so an 'sms' row only ever appears on an EMAIL sign-in, and an 'email' row
   * only on a phone one. The other channel's identifier reaches this app MASKED
   * and nothing else ('+351•••••5678'), because migration 0096 masks in SQL
   * precisely so the raw value never leaves the database, and GoTrue has no
   * "send to this account's other channel" call. So picking one switches
   * sign-in to that input, where the user types the number or address whose
   * mask they were just shown. It is one screen instead of zero, and it is the
   * only version that actually delivers a code.
   */
  const onPick = (method: AuthMethod) => {
    setSheetOpen(false);
    if (method === 'password') { router.push('/(auth)/password' as never); return; }
    if (method === 'google') { void onGoogle(); return; }
    if (method === 'apple') { void onApple(); return; }
    clearAuthTarget();
    router.replace({
      pathname: '/(auth)/sign-in',
      params: { mode: method === 'sms' ? 'phone' : 'email' },
    } as never);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Explicit target, not useGoBack(): its fallback is '/', which drops a
          signed-out user on the splash. Back from here is always sign-in. */}
      <TopBar variant="nav" onBack={() => router.replace('/(auth)/sign-in')} />
      <Screen style={styles.body}>
        <Text variant="title">{t('otpTitle')}</Text>
        <Text variant="body" tone="muted" style={styles.help}>
          {t('otpHelp', { identifier: kind === 'phone' ? formatE164ForDisplay(identifier) : identifier })}
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
          onComplete={() => Keyboard.dismiss()}
          editable={!busy && !otp.locked}
          autoFocus
          testID="otp-code"
        />

        {/* Directly below the input, ABOVE the primary action — see the docblock. */}
        <Button
          label={remaining > 0 ? t('cooldown', { seconds: remaining }) : t('resend')}
          variant="tertiary"
          disabled={busy || remaining > 0}
          onPress={resend}
          fullWidth
          style={styles.resend}
          testID="otp-resend"
        />

        <Button
          label={t('verify')}
          fullWidth
          loading={busy}
          onPress={verify}
          style={styles.cta}
          testID="otp-verify"
        />

        <Button
          label={t('tryAnotherWay')}
          variant="secondary"
          fullWidth
          disabled={busy}
          onPress={openSheet}
          style={styles.another}
          testID="otp-try-another-way"
        />
      </Screen>

      <TryAnotherWaySheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        methods={methods}
        loading={methodsLoading}
        inUse={inUse}
        onPick={onPick}
        onStartOver={startOver}
        testID="otp-other-ways-sheet"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: { paddingTop: space[6] },
  help: { marginTop: space[2], marginBottom: space[6] },
  resend: { marginTop: space[1] },
  cta: { marginTop: space[3] },
  another: { marginTop: space[3] },
});
