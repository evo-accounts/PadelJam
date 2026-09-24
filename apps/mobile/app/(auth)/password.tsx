/**
 * Sign in with a password (UX-AUTH-06).
 *
 * What the audit found, and what changed:
 *
 *   - NO WAY BACK. The screen had no TopBar at all, so the only exits were the
 *     two links at the bottom. It is `TopBar variant="nav"` now, with an
 *     explicit target — `useGoBack()` is not an option in (auth), its '/'
 *     fallback drops a signed-out user on the splash.
 *   - THE WRONG HELP LINE. It rendered `t('otpHelp')` — "We sent a code to …" —
 *     on a screen that sends no code and asks for a password. `passwordHelp`
 *     says what is actually happening, and a phone identifier is formatted for
 *     reading rather than printed as raw E.164.
 *   - "FORGOT PASSWORD?" STACKED FULL-WIDTH under the primary action, where it
 *     read as a second call to action of equal weight. It sits DIRECTLY BELOW
 *     THE INPUT and right-aligned now, which is where the eye lands when the
 *     password does not come to mind. (The E2E asserts both by comparing
 *     frames — it is cheap to lose in a refactor.)
 *   - A HAND-ROLLED `Pressable` for Continue, which surfaced to the
 *     accessibility tree as a GenericElement. A real `Button` now.
 *   - "TRY ANOTHER WAY" THAT WENT BACK. It called `router.back()`, which is
 *     "go back" — the user is returned to the code screen they deliberately
 *     left, and is offered nothing. It opens `TryAnotherWaySheet` now, with
 *     `inUse: 'password'`, so the rows are the methods THIS account actually
 *     has minus the one on screen.
 *
 * THE GUARD RUNS ON ARRIVAL, not reactively — the same call otp.tsx makes, and
 * for the same reason. `startOver` and the cross-channel picks below CLEAR the
 * auth target and then navigate somewhere specific; a guard watching
 * `identifier` would see the clear, re-run, and `replace` to a plain
 * '/(auth)/sign-in' over the top of the navigation just issued, losing the
 * `mode` param — i.e. the whole point of the pick.
 */
import { safeAuthMessage, signInWithPassword } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
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
import { useFieldErrors } from '@/lib/useFieldErrors';
import { useOtpCountdown } from '@/lib/useOtpCountdown';
import { colors, space } from '../../theme';
import { Button, PasswordField, Screen, Text, TopBar, useBanner } from '../../components/ui';

export default function PasswordScreen() {
  const { t } = useT('auth');
  const { t: tc } = useT('common');
  const banner = useBanner();
  const router = useRouter();
  const { identifier, kind } = getAuthTarget();

  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [methods, setMethods] = useState<AuthMethods | null>(null);
  const [methodsLoading, setMethodsLoading] = useState(false);
  const { errors, setErrors, clear } = useFieldErrors<'password'>();
  /**
   * `otpReducer` is reused here purely as a FAILED-ATTEMPT COUNTER — five wrong
   * passwords lock the screen, exactly as five wrong codes lock the OTP one.
   * The countdown half goes unused (nothing is ever sent from here), which is
   * why only `state` and `dispatch` are destructured.
   */
  const { state, dispatch } = useOtpCountdown();

  /** See the docblock: on arrival, never reactively. */
  const missingOnArrival = useRef(!identifier);
  useEffect(() => {
    if (missingOnArrival.current) router.replace('/(auth)/sign-in');
  }, [router]);

  const submit = async () => {
    if (busy) return;
    if (state.locked) {
      const message = t('passwordRateLimited');
      setErrors({ password: message });
      banner.show(message);
      return;
    }
    if (!password) {
      // UX-GLOB-06: redden the field AND banner it, in the identical words.
      setErrors({ password: tc('missingInformation') });
      banner.show(tc('missingInformation'));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const { data, error: signInError } = await signInWithPassword(supabase, identifier, kind, password);
      if (signInError || !data.user) {
        dispatch({ type: 'fail' });
        const message = t('passwordWrong');
        setErrors({ password: message });
        banner.show(message);
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

  /**
   * Open the sheet IMMEDIATELY, with whatever is known — the same contract
   * otp.tsx documents. sign-in fires the lookup alongside the OTP send, so the
   * answer is usually already on the auth-flow singleton by the time anyone
   * reaches this screen; it is read at TAP time rather than at mount because it
   * lands asynchronously and a mount-time snapshot would be `null` forever.
   * When it genuinely is not there the tap still opens the sheet and the sheet
   * shows its loading state. Blocking the tap on a network call is the one
   * thing this must not do.
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
   * Route a picked method. `password` can never arrive here — it is `inUse`,
   * and `availableMethods` removes it. The cross-channel rows do not send from
   * here and cannot: the other channel's identifier reaches this app MASKED and
   * nothing else (migration 0096 masks in SQL), so picking one switches sign-in
   * to that input, where the user types the value whose mask they were shown.
   */
  const onPick = (method: AuthMethod) => {
    setSheetOpen(false);
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
          signed-out user on the splash. Back from here is the code screen the
          "Try another way" sheet handed over from. */}
      <TopBar variant="nav" onBack={() => router.replace('/(auth)/otp')} />
      <Screen style={styles.body}>
        <Text variant="title">{t('passwordTitle')}</Text>
        <Text variant="body" tone="muted" style={styles.help}>
          {t('passwordHelp', {
            identifier: kind === 'phone' ? formatE164ForDisplay(identifier) : identifier,
          })}
        </Text>

        <PasswordField
          label={t('passwordLabel')}
          value={password}
          onChangeText={(v) => { setPassword(v); clear('password'); }}
          error={errors.password ?? null}
          placeholder={t('passwordPlaceholder')}
          editable={!busy && !state.locked}
          autoFocus
          testID="password-input"
        />

        {/* UX-AUTH-06: directly below the input and RIGHT-ALIGNED, not a
            full-width link stacked under the CTA. The row is what does the
            aligning — a `Button` that is not `fullWidth` sizes to its label. */}
        <View style={styles.forgotRow}>
          <Button
            label={t('forgotPassword')}
            variant="ghost"
            size="sm"
            disabled={busy}
            onPress={() => router.push('/(auth)/recovery' as never)}
            testID="password-forgot"
          />
        </View>

        <Button
          label={t('continue')}
          fullWidth
          loading={busy}
          onPress={submit}
          style={styles.cta}
          testID="password-continue"
        />

        <Button
          label={t('tryAnotherWay')}
          variant="secondary"
          fullWidth
          disabled={busy}
          onPress={openSheet}
          style={styles.another}
          testID="password-try-another-way"
        />
      </Screen>

      <TryAnotherWaySheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        methods={methods}
        loading={methodsLoading}
        inUse="password"
        onPick={onPick}
        onStartOver={startOver}
        testID="password-other-ways-sheet"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: { paddingTop: space[6] },
  help: { marginTop: space[2], marginBottom: space[6] },
  forgotRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: space[1] },
  cta: { marginTop: space[3] },
  another: { marginTop: space[3] },
});
