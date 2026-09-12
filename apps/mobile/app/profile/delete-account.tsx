import { signOut } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { unregisterForPush } from '@/lib/push';
import { SUPABASE_URL, supabase } from '@/lib/supabase';
import { Button, TopBar } from '../../components/ui';
import { colors } from '../../theme';

export default function DeleteAccountScreen() {
  const { t } = useT('profile');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError(t('deleteFailed'));
        return;
      }
      try {
        await unregisterForPush();
      } catch {
        /* best-effort; the migration also purges tokens server-side */
      }
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      });
      if (!resp.ok) {
        setError(t('deleteFailed'));
        return;
      }
      await signOut(supabase);
      router.replace('/(auth)/welcome');
    } catch {
      setError(t('deleteFailed'));
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    if (busy) return;
    Alert.alert(t('deleteWarningTitle'), t('deleteWarningBody'), [
      { text: t('deleteCancel'), style: 'cancel' },
      { text: t('deleteConfirm'), style: 'destructive', onPress: () => void doDelete() },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="nav" title={t('deleteAccount')} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{t('deleteWarningTitle')}</Text>
        <Text style={styles.body}>{t('deleteWarningBody')}</Text>
        <Text style={styles.item}>{t('deleteErasedProfile')}</Text>
        <Text style={styles.item}>{t('deleteErasedMemberships')}</Text>
        <Text style={styles.item}>{t('deleteErasedSocial')}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button variant="destructive" fullWidth label={t('deleteConfirm')} onPress={confirm} loading={busy} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 8 },
  title: { fontSize: 20, fontWeight: '700', color: colors.foreground },
  body: { fontSize: 14, color: colors.mutedForeground },
  item: { fontSize: 14, color: colors.mutedForeground },
  error: { color: colors.destructive, fontSize: 13 },
});
