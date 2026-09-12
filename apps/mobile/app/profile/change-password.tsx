import { changePassword, useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { passwordValid } from '@/lib/passwordRules';
import { supabase } from '@/lib/supabase';
import { Button, PasswordField, TopBar, useBanner } from '../../components/ui';
import { colors } from '../../theme';

export default function ChangePasswordScreen() {
  const { t } = useT('profile');
  const { t: tc } = useT('common');
  const router = useRouter();
  const banner = useBanner();
  const email = useSession().session?.user.email;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [repeatError, setRepeatError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = current.length > 0 || next.length > 0 || repeat.length > 0;

  const onSave = async () => {
    if (busy) return;
    setRepeatError(null);
    if (!email || !current || !next || !repeat) { banner.show(tc('missingInformation')); return; }
    if (!passwordValid(next)) {
      banner.show(tc('missingInformation'));
      return;
    }
    if (next !== repeat) {
      setRepeatError(t('passwordsDontMatch'));
      return;
    }
    setBusy(true);
    try {
      const r = await changePassword(supabase, email, current, next);
      if (r.ok) {
        banner.show(t('passwordChanged'), 'success');
        router.back();
        return;
      }
      banner.show(r.reason === 'current_password_wrong' ? t('currentPasswordWrong') : t('updateFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="edit" title={t('changePassword')} onClose={() => router.back()} dirty={dirty} />
      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        <PasswordField
          label={t('currentPassword')}
          value={current}
          onChangeText={setCurrent}
          testID="current-password-input"
        />
        <PasswordField
          label={t('newPassword')}
          value={next}
          onChangeText={setNext}
          showRules
          testID="new-password-input"
        />
        <PasswordField
          label={t('repeatPassword')}
          value={repeat}
          onChangeText={(v) => {
            setRepeat(v);
            if (repeatError) setRepeatError(null);
          }}
          error={repeatError}
          testID="repeat-password-input"
        />
        <Button fullWidth label={t('changePassword')} onPress={onSave} loading={busy} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: 16, gap: 8 },
});
