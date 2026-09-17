import { startEmailChange, verifyEmailChange } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { Button, Screen, TopBar, useBanner } from '../../components/ui';
import { colors } from '../../theme';

export default function ChangeEmailScreen() {
  const { t } = useT('profile');
  const { t: tc } = useT('common');
  const router = useRouter();
  const banner = useBanner();
  const [phase, setPhase] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = email.trim().length > 0 || code.trim().length > 0;

  const onSend = async () => {
    if (busy) return;
    if (!email.trim()) { banner.show(tc('missingInformation')); return; }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      banner.show(t('emailInvalid'));
      return;
    }
    setBusy(true);
    try {
      const { error: e } = await startEmailChange(supabase, email.trim());
      if (e) {
        banner.show(t('changeEmailFailed'));
        return;
      }
      setPhase('code');
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async () => {
    if (busy) return;
    if (!code.trim()) { banner.show(tc('missingInformation')); return; }
    setBusy(true);
    try {
      const { error: e } = await verifyEmailChange(supabase, email.trim(), code.trim());
      if (e) {
        banner.show(t('invalidCode'));
        return;
      }
      banner.show(t('emailChanged'), 'success');
      router.back();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="edit" title={t('changeEmail')} onClose={() => router.back()} dirty={dirty} />
      <Screen scroll padded={false} style={styles.content}>
      {phase === 'email' ? (
        <>
          <Text style={styles.label}>{t('newEmailLabel')}</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Button fullWidth label={t('sendCode')} onPress={onSend} loading={busy} />
        </>
      ) : (
        <>
          <Text style={styles.hint}>{t('codeSentTo')}</Text>
          <Text style={styles.label}>{t('codeLabel')}</Text>
          <TextInput style={styles.input} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
          <Button fullWidth label={t('verify')} onPress={onVerify} loading={busy} />
        </>
      )}
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 8 },
  hint: { color: colors.mutedForeground, fontSize: 14 },
  label: { fontSize: 13, fontWeight: '600', color: colors.foreground, marginTop: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: colors.card },
});
