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
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { passwordValid } from '@/lib/passwordRules';
import { supabase } from '@/lib/supabase';
import { useFieldErrors } from '@/lib/useFieldErrors';
import { Button, Loading, PasswordField, Text, TopBar, useBanner } from '../../components/ui';
import { colors, space } from '../../theme';

type FieldKey = 'current' | 'password' | 'confirm';

export default function ChangePasswordScreen() {
  const { t } = useT('profile');
  const { t: tc } = useT('common');
  const router = useRouter();
  const banner = useBanner();
  const qc = useQueryClient();
  const session = useSession().session;
  const email = session?.user.email;
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
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
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
        <Button fullWidth label={title} onPress={onSave} loading={busy} testID="change-password-submit" />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: 16, gap: 8 },
  help: { marginBottom: space[2] },
});
