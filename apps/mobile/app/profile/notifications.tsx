import { useMySettings, useUpdateSettings, type NotificationSettings } from '@padel/api';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, space } from '../../theme';
import { SwitchRow, TopBar } from '../../components/ui';

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

  // UX-SET-04: each toggle says what it actually turns off. "WhatsApp" alone does not tell you
  // whether switching it off stops match reminders or stops everything.
  const ROWS: { key: keyof NotificationSettings; label: string; description: string }[] = [
    { key: 'notifications_push', label: t('notifPush'), description: t('notifPushDescription') },
    { key: 'notifications_whatsapp', label: t('notifWhatsapp'), description: t('notifWhatsappDescription') },
    { key: 'notifications_email', label: t('notifEmail'), description: t('notifEmailDescription') },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar title={t('notifications')} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        {ROWS.map((r) => (
          <SwitchRow
            key={r.key}
            label={r.label}
            description={r.description}
            value={value[r.key]}
            onValueChange={toggle(r.key)}
            style={styles.row}
            testID={`setting-${r.key}`}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: space[4], gap: space[1] },
  row: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
});
