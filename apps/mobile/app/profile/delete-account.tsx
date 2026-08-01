import { signOut } from '@padel/auth';
import { useT } from '@padel/i18n';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { unregisterForPush } from '@/lib/push';
import { SUPABASE_URL, supabase } from '@/lib/supabase';
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('deleteAccount') }} />
      <Text style={styles.title}>{t('deleteWarningTitle')}</Text>
      <Text style={styles.body}>{t('deleteWarningBody')}</Text>
      <Text style={styles.item}>{t('deleteErasedProfile')}</Text>
      <Text style={styles.item}>{t('deleteErasedMemberships')}</Text>
      <Text style={styles.item}>{t('deleteErasedSocial')}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={[styles.delete, busy && styles.deleteDisabled]} onPress={confirm} disabled={busy} accessibilityRole="button">
        <Text style={styles.deleteText}>{t('deleteConfirm')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 8 },
  title: { fontSize: 20, fontWeight: '700', color: colors.foreground },
  body: { fontSize: 14, color: colors.mutedForeground },
  item: { fontSize: 14, color: colors.mutedForeground },
  error: { color: colors.destructive, fontSize: 13 },
  delete: { backgroundColor: colors.destructive, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  deleteDisabled: { opacity: 0.6 },
  deleteText: { color: colors.card, fontWeight: '700', fontSize: 16 },
});
