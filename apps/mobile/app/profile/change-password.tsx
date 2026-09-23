/**
 * Change your password — or SET one, for an account that has never had one.
 *
 * The second half is new, and it closes a loop that had no other exit.
 * `setPassword` is reachable from exactly one place, `(auth)/new-password`, which
 * is reached from `recovery` <- `password` <- the "Try another way" sheet, and the
 * sheet only offers the password row when `has_password` is already true. So the
 * one mechanism that could give a passwordless account a password was gated
 * behind already having one. That matters most for the people most likely to be
 * passwordless: a Google or Apple sign-up has no phone on file, and for Google
 * the email IS the account that was lost, so there is no independent channel to
 * recover through either.
 *
 * `auth_providers.has_password` (migration 0003, made readable by 0097) decides
 * which screen this is, and it is read HERE and not passed in as a route param:
 * expo-router restores this route after a process restart with whatever params
 * it had, and a stale `hasPassword=true` would put the current-password field
 * back in front of someone who cannot fill it — the exact dead end being fixed.
 *
 *   has_password true  -> unchanged: current password, verified by re-auth
 *                         (packages/auth changePassword), then the new one.
 *   has_password false -> new password + confirm, no current, `setPassword` on
 *                         the LIVE session. No sign-out afterwards: unlike
 *                         recovery, this session was not minted by a recovery
 *                         code — the user is properly signed in and staying on
 *                         this screen's back stack.
 */
import { qk, useAuthProviders } from '@padel/api';
import { changePassword, setPassword, useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { passwordValid } from '@padel/utils';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { setAuthTarget, type IdentifierKind } from '@/lib/auth-flow';
import { supabase } from '@/lib/supabase';
import { useFieldErrors } from '@/lib/useFieldErrors';
import { Button, Loading, PasswordField, Screen, Text, TopBar, useBanner, useConfirm } from '../../components/ui';
import { colors, space } from '../../theme';

type FieldKey = 'current' | 'password' | 'confirm';

export default function ChangePasswordScreen() {
  const { t } = useT('profile');
  const { t: tc } = useT('common');
  const router = useRouter();
  const banner = useBanner();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const session = useSession().session;
  const email = session?.user.email;
  const phone = session?.user.phone;
  const uid = session?.user.id;
  const authProviders = useAuthProviders();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const { errors, setErrors, clear } = useFieldErrors<FieldKey>();

  // `?? true` is the FAILED-QUERY fallback only — `isLoading` is handled below, so this is
  // reached with data or with an error. Falling back to the change flow keeps the pre-existing
  // behaviour rather than offering to "create" a password over one that already exists.
  const hasPassword = authProviders.data?.has_password ?? true;
  const dirty = current.length > 0 || next.length > 0 || repeat.length > 0;
  const title = hasPassword ? t('changePassword') : t('createPassword');

  /**
   * Where the recovery code would be sent. `auth_providers` answers whether the account HAS an
   * email or a phone, not what they are, so the values come from the session — which is the same
   * pair GoTrue would accept an OTP on. Email first when both exist, matching the rest of the app.
   *
   * `null` hides the link entirely. An account with neither channel cannot be sent a code, and a
   * link that opens a flow with nothing to send to is the dead end this whole screen exists to
   * close.
   */
  const recoveryTarget: { identifier: string; kind: IdentifierKind } | null = email
    ? { identifier: email, kind: 'email' }
    : phone
      ? { identifier: phone, kind: 'phone' }
      : null;

  /**
   * "Forgot password?" is the real recovery flow, not a shortcut around the current-password
   * check — skipping that check for a signed-in user would let anyone holding an unlocked phone
   * change the password without knowing the old one, which is the only thing the check is for.
   *
   * Two things have to happen before navigating. `recovery.tsx` sends the code to
   * `getAuthTarget()`, a module singleton only the sign-in flow populates; arriving from here
   * without seeding it means an empty identifier, and its own guard replaces the screen with
   * sign-in — the link looks right and silently drops you at the login page. And the flow ENDS at
   * `new-password.tsx`, which signs the session out on purpose, so the user is told they will have
   * to sign in again BEFORE the code is sent rather than discovering it three screens later.
   */
  const onForgot = async () => {
    if (!recoveryTarget) return;
    const ok = await confirm({
      title: t('forgotPassword'),
      body: t('forgotPasswordBody', { identifier: recoveryTarget.identifier }),
      confirmLabel: tc('confirm'),
    });
    if (!ok) return;
    setAuthTarget(recoveryTarget.identifier, recoveryTarget.kind);
    router.push('/(auth)/recovery');
  };

  const onSave = async () => {
    if (busy) return;
    setErrors({});

    // The current-password field exists only in the change case, so it is only required there.
    if (!next || !repeat || (hasPassword && (!email || !current))) {
      banner.show(tc('missingInformation'));
      return;
    }
    // UX-GLOB-06: redden the field AND banner it, in the identical words. The checklist under
    // the input stays visible while the border is red — it is what says how to fix it.
    if (!passwordValid(next)) {
      setErrors({ password: t('password_weak') });
      banner.show(t('password_weak'));
      return;
    }
    if (next !== repeat) {
      setErrors({ confirm: t('passwordsDontMatch') });
      banner.show(t('passwordsDontMatch'));
      return;
    }

    setBusy(true);
    try {
      if (!hasPassword) {
        // No current password to verify against — there is none. updateUser on the live session
        // is the whole operation (GoTrue's secure_password_change is off, so no nonce).
        const { error } = await setPassword(supabase, next);
        if (error) {
          banner.show(t('updateFailed'));
          return;
        }
      } else {
        const r = await changePassword(supabase, email!, current, next);
        if (!r.ok) {
          const message = r.reason === 'current_password_wrong' ? t('currentPasswordWrong') : t('updateFailed');
          if (r.reason === 'current_password_wrong') setErrors({ current: message });
          banner.show(message);
          return;
        }
      }
      // The settings row is labelled off this query and it is NOT remounted by router.back()
      // (expo-router keeps the screen behind this one alive), so without this the account that
      // just gained a password still offers "Create password" until something else refetches.
      if (uid) await qc.invalidateQueries({ queryKey: qk.authProviders(uid) });
      banner.show(hasPassword ? t('passwordChanged') : t('passwordCreated'), 'success');
      router.back();
    } finally {
      setBusy(false);
    }
  };

  /**
   * Which fields this screen shows is derived from the query, so rendering before it resolves
   * would put up a current-password box and take it away again a moment later — carrying
   * whatever was typed into it nowhere.
   */
  if (authProviders.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TopBar variant="edit" title={title} onClose={() => router.back()} />
        <Loading testID="change-password-loading" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="edit" title={title} onClose={() => router.back()} dirty={dirty} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Screen scroll padded={false} style={styles.content}>
          {/* No testID on the help paragraph: a plain RN Text surfaces as a StaticText with no
              AXUniqueId, so an id here would be unreachable from the accessibility tree. The E2E
              matches its copy instead. */}
          {!hasPassword && (
            <Text variant="body" tone="muted" style={styles.help}>
              {t('createPasswordHelp')}
            </Text>
          )}

          {hasPassword && (
            <PasswordField
              label={t('currentPassword')}
              value={current}
              onChangeText={(v) => { setCurrent(v); clear('current'); }}
              error={errors.current ?? null}
              editable={!busy}
              testID="current-password-input"
            />
          )}

          {/* UX-SET-07: directly below the current-password field, aligned right. It is only
              meaningful for an account that HAS a password — there is nothing to recover otherwise,
              and the recovery flow itself is gated on the same flag. */}
          {hasPassword && recoveryTarget && (
            <Pressable
              style={styles.forgot}
              onPress={onForgot}
              accessibilityRole="button"
              testID="forgot-password"
            >
              <Text variant="label" tone="primary">
                {t('forgotPassword')}
              </Text>
            </Pressable>
          )}

          <PasswordField
            label={t('newPassword')}
            value={next}
            onChangeText={(v) => { setNext(v); clear('password'); clear('confirm'); }}
            error={errors.password ?? null}
            showRules
            editable={!busy}
            testID="new-password-input"
          />
          <PasswordField
            label={t('repeatPassword')}
            value={repeat}
            onChangeText={(v) => { setRepeat(v); clear('confirm'); }}
            error={errors.confirm ?? null}
            editable={!busy}
            testID="repeat-password-input"
          />
        </Screen>

        {/*
          Fixed at the bottom, per UX-SET-07 — it used to sit at the end of the scroll content and
          scrolled away with the form. Pinned OUTSIDE the scroller and INSIDE the
          KeyboardAvoidingView: this screen is three password fields, so the keyboard is up whenever
          there is anything to submit, and a pinned action the keyboard covers is worse than one
          that scrolls — it cannot be reached at all.
        */}
        <View style={styles.footer}>
          <Button fullWidth label={title} onPress={onSave} loading={busy} testID="change-password-submit" />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  forgot: { alignSelf: 'flex-end', paddingVertical: space[1] },
  footer: { padding: space[4], borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 8 },
  help: { marginBottom: space[2] },
});
