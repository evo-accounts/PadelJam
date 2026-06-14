import { useMySettings, useUpdateSettings, type NotificationSettings } from '@padel/api';
import { useT } from '@padel/i18n';
import { Stack } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

export default function NotificationsScreen() {
  const { t } = useT('profile');
  const settings = useMySettings();
  const update = useUpdateSettings();

  if (settings.isLoading || !settings.data) {
    return <ActivityIndicator color="#0B1F3A" style={{ marginTop: 48 }} />;
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('notifications') }} />
      {ROWS.map((r) => (
        <View key={r.key} style={styles.row}>
          <Text style={styles.rowLabel}>{r.label}</Text>
          <Switch value={value[r.key]} onValueChange={toggle(r.key)} />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  content: { padding: 16, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowLabel: { fontSize: 15, color: '#0B1F3A', fontWeight: '600' },
});
