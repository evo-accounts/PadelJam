import { useMySettings, useUpdateSettings, type NotificationSettings } from '@padel/api';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../theme';
import { TopBar } from '../../components/ui';

export default function NotificationsScreen() {
  const { t } = useT('profile');
  const router = useRouter();
  const settings = useMySettings();
  const update = useUpdateSettings();

  if (settings.isLoading || !settings.data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
        <TopBar title={t('notifications')} onBack={() => router.back()} />
        <ActivityIndicator color={colors.foreground} style={{ marginTop: 48 }} />
      </SafeAreaView>
    );
  }

  const value = settings.data;
  const toggle = (key: keyof NotificationSettings) => (next: boolean) =>
    update.mutate({ [key]: next } as Partial<NotificationSettings>);

  const ROWS: { key: keyof NotificationSettings; label: string }[] = [
    { key: 'notifications_push', label: t('notifPush') },
    { key: 'notifications_whatsapp', label: t('notifWhatsapp') },
    { key: 'notifications_email', label: t('notifEmail') },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar title={t('notifications')} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        {ROWS.map((r) => (
          <View key={r.key} style={styles.row}>
            <Text style={styles.rowLabel}>{r.label}</Text>
            <Switch value={value[r.key]} onValueChange={toggle(r.key)} />
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowLabel: { fontSize: 15, color: colors.foreground, fontWeight: '600' },
});
