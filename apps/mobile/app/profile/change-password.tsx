import { changePassword, useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { Button, TopBar, useBanner } from '../../components/ui';
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
  const [busy, setBusy] = useState(false);
  const dirty = current.length > 0 || next.length > 0 || repeat.length > 0;

  const onSave = async () => {
    if (busy) return;
    if (!email || !current || !next || !repeat) { banner.show(tc('missingInformation')); return; }
    if (next.length < 8) {
      banner.show(t('passwordTooShort'));
      return;
    }
    if (next !== repeat) {
      banner.show(t('passwordsDontMatch'));
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
        <Text style={styles.label}>{t('currentPassword')}</Text>
        <TextInput style={styles.input} value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" />
        <Text style={styles.label}>{t('newPassword')}</Text>
        <TextInput style={styles.input} value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" />
        <Text style={styles.label}>{t('repeatPassword')}</Text>
        <TextInput style={styles.input} value={repeat} onChangeText={setRepeat} secureTextEntry autoCapitalize="none" />
        <Button fullWidth label={t('changePassword')} onPress={onSave} loading={busy} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: 16, gap: 8 },
  label: { fontSize: 13, fontWeight: '600', color: colors.foreground, marginTop: 8 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, backgroundColor: colors.card },
});
