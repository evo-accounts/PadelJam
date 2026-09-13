/**
 * Password recovery, step 2 of 3: the new password (UX-AUTH-08).
 *
 * `PasswordField` already renders the four-rule checklist below the input and
 * already puts a show/hide eye on every instance, so the audit's "display the
 * requirements" and "both inputs include a show/hide eye" come free with the
 * primitive. What this screen adds is the FAILED state: `error` reddens the
 * field while the checklist stays visible underneath it, because a checklist
 * that disappears at the moment it becomes relevant is worse than none.
 */
import { setPassword } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { clearAuthTarget, getAuthTarget } from '@/lib/auth-flow';
import { passwordValid } from '@/lib/passwordRules';
import { supabase } from '@/lib/supabase';
import { useFieldErrors } from '@/lib/useFieldErrors';
import { colors, space } from '../../theme';
import { Button, PasswordField, Screen, Text, TopBar, useBanner } from '../../components/ui';

type FieldKey = 'password' | 'confirm';

export default function NewPasswordScreen() {
  const { t } = useT('auth');
  const banner = useBanner();
  const router = useRouter();
  const { identifier } = getAuthTarget();

  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const { errors, setErrors, clear } = useFieldErrors<FieldKey>();

  /**
   * Same guard as the code step: the auth-flow singleton is module state and
   * does not survive a process restart. Without an identifier there is no
   * recovery in progress to finish, so start over rather than sit on a form
   * whose submit would update whoever happens to be signed in.
   */
  useEffect(() => {
    if (!identifier) router.replace('/(auth)/sign-in');
  }, [identifier, router]);

  const submit = async () => {
    if (busy) return;

    // UX-GLOB-06: redden the field AND show the banner. The field says which
    // input is wrong; the banner says it out loud, including to a screen reader.
    if (!passwordValid(pw)) {
      setErrors({ password: t('password_weak') });
      banner.show(t('password_weak'));
      return;
    }
    if (pw !== pw2) {
      setErrors({ confirm: t('passwordsDontMatch') });
      banner.show(t('passwordsDontMatch'));
      return;
    }
    setErrors({});

    setBusy(true);
    try {
      const { error } = await setPassword(supabase, pw);
      if (error) {
        banner.show(t('passwordWrong'));
        return;
      }

      /**
       * SIGN OUT HERE, NOT ON THE CONFIRMATION SCREEN'S BUTTON.
       *
       * Verifying a recovery code establishes a REAL session — that is the
       * whole reason the update above is allowed. The audit is explicit that
       * recovery must not continue into a signed-in session, and doing the
       * teardown on the confirmation screen's button would leave a window in
       * which it never happens: force-quit while "password changed" is on
       * screen and the next launch finds a live session, so Boot routes
       * straight to Home. That is precisely the forbidden outcome, and it is
       * reachable by doing nothing but closing the app.
       *
       * `scope: 'local'` on purpose: changing your own password should not
       * kick you off your other devices. A default (global) sign-out would.
       *
       * Please do not "simplify" this into the next screen.
       */
      await supabase.auth.signOut({ scope: 'local' });
      // The identifier only existed to carry the recovery across screens; the
      // confirmation reads nothing, and a stale one would leak into a later flow.
      clearAuthTarget();

      router.replace('/(auth)/password-changed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Explicit target rather than useGoBack(), whose '/' fallback strands a
          signed-out user on the splash. Back re-enters the code step. */}
      <TopBar variant="nav" onBack={() => router.replace('/(auth)/recovery')} />
      <Screen style={styles.body}>
        <Text variant="title" style={styles.title}>
          {t('newPasswordTitle')}
        </Text>

        <PasswordField
          label={t('newPasswordLabel')}
          value={pw}
          onChangeText={(v) => { setPw(v); clear('password'); }}
          showRules
          error={errors.password ?? null}
          editable={!busy}
          testID="new-password-input"
        />
        <PasswordField
          label={t('confirmPasswordLabel')}
          value={pw2}
          onChangeText={(v) => { setPw2(v); clear('confirm'); }}
          error={errors.confirm ?? null}
          editable={!busy}
          containerStyle={styles.confirm}
          testID="confirm-password-input"
        />

        <Button
          label={t('continue')}
          fullWidth
          loading={busy}
          onPress={submit}
          style={styles.cta}
          testID="new-password-continue"
        />
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: { paddingTop: space[6] },
  title: { marginBottom: space[6] },
  confirm: { marginTop: space[4] },
  cta: { marginTop: space[6] },
});
