/**
 * Change the account's mobile number (UX-SET-02, Requirements PR-12).
 *
 * The audit mentions verification only for email, but the number matters more: `profiles.phone` is
 * unique and phone OTP is the main sign-in path, so an unverified change would hand the account to
 * a number nobody proved they hold. `startPhoneChange` / `verifyPhoneChange` have existed in
 * `packages/auth` since the email flow was written and were never called by anything.
 *
 * Same two-phase shape as `change-email.tsx`, with `PhoneField` doing the country selector and the
 * E.164 normalisation UX-SET-02 asks for — it already solves both for sign-up.
 */
import { useRefreshMyProfile } from '@padel/api';
import { startPhoneChange, verifyPhoneChange } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { Button, Field, PhoneField, Screen, Text, TopBar, useBanner } from '../../components/ui';
import { colors, space } from '../../theme';

export default function ChangePhoneScreen() {
  const { t } = useT('profile');
  const { t: tc } = useT('common');
  const router = useRouter();
  const banner = useBanner();
  const refreshMyProfile = useRefreshMyProfile();
  const [phase, setPhase] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [valid, setValid] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = phone.trim().length > 0 || code.trim().length > 0;

  const onSend = async () => {
    if (busy) return;
    // `value` is '' both when nothing was typed and when the number is half-finished, which is why
    // PhoneField reports validity separately.
    if (!valid || !phone) {
      banner.show(t('phoneInvalid'));
      return;
    }
    setBusy(true);
    try {
      const { error } = await startPhoneChange(supabase, phone);
      if (error) {
        banner.show(t('changePhoneFailed'));
        return;
      }
      setPhase('code');
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async () => {
    if (busy) return;
    if (!code.trim()) {
      banner.show(tc('missingInformation'));
      return;
    }
    setBusy(true);
    try {
      const { error } = await verifyPhoneChange(supabase, phone, code.trim());
      if (error) {
        banner.show(t('invalidCode'));
        return;
      }
      await refreshMyProfile();
      banner.show(t('phoneChanged'), 'success');
      router.back();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="edit" title={t('changePhone')} onClose={() => router.back()} dirty={dirty} />
      <Screen scroll padded={false} style={styles.content}>
        {phase === 'phone' ? (
          <>
            <PhoneField
              label={t('newPhoneLabel')}
              value={phone}
              onChangeValue={(e164, meta) => {
                setPhone(e164);
                setValid(meta.valid);
              }}
              testID="new-phone-input"
            />
            <Button fullWidth label={t('sendCode')} onPress={onSend} loading={busy} testID="send-phone-code" />
          </>
        ) : (
          <>
            <Text variant="body" tone="muted">
              {t('codeSentTo')}
            </Text>
            <Field
              label={t('codeLabel')}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
              testID="phone-code-input"
            />
            <Button fullWidth label={t('verify')} onPress={onVerify} loading={busy} testID="verify-phone-code" />
          </>
        )}
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: space[4], gap: space[2] },
});
