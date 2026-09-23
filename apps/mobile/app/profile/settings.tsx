import { useAccountPlan } from '@padel/api';
import { signOut } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { unregisterForPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { colors } from '../../theme';
import { Button, ListRow, Text, TopBar } from '../../components/ui';

const LANGS = [
  { code: 'en', key: 'languageEnglish' as const },
  { code: 'pt-PT', key: 'languagePtPt' as const },
  { code: 'pt-BR', key: 'languagePtBr' as const },
];

export default function SettingsScreen() {
  const { t, i18n } = useT('profile');
  const router = useRouter();
  const accountPlan = useAccountPlan();

  const current = (LANGS.find((l) => l.code === i18n.language) ?? LANGS[0])!;
  // Neutral while the plan query is loading: `data` is undefined then, and defaulting to
  // "planJammer" would flash the free label at a Jammer+ member before it resolves.
  const planLabel = accountPlan.isLoading
    ? undefined
    : t(accountPlan.data === 'jammer_plus' ? 'planJammerPlus' : 'planJammer');

  const onLogout = async () => {
    try {
      await unregisterForPush();
    } catch {
      /* best-effort; never block sign-out */
    }
    await signOut(supabase);
    router.replace('/(auth)/sign-in');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar title={t('settings')} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.section}>{t('preferences')}</Text>
        {/* Language and the app icon moved into App preferences (UX-SET-08) — neither is an
            account setting, and the language sheet lived in THIS file. Provisional placement,
            like the account rows below; UX-SET-01 regroups the page. */}
        <ListRow
          title={t('appPreferencesTitle')}
          trailing={<Text variant="body" tone="muted">{t(current.key)}</Text>}
          trailingLabel={t(current.key)}
          onPress={() => router.push('/profile/app-preferences')}
          testID="settings-app-preferences-row"
        />
        <ListRow
          title={t('notifications')}
          onPress={() => router.push('/profile/notifications')}
          testID="settings-notifications-row"
        />

        <Text style={styles.section}>{t('account')}</Text>
        {/* Provisional placement. UX-SET-01 regroups this whole screen into five cards (a later
            PR); these two rows exist NOW because UX-PROF-06 removed the "Editar" button from the
            profile, and without them there would be no route to editing your own details at all. */}
        <ListRow
          title={t('accountTitle')}
          onPress={() => router.push('/profile/account')}
          testID="settings-account-row"
        />
        <ListRow
          title={t('gameTitle')}
          onPress={() => router.push('/profile/game')}
          testID="settings-game-row"
        />
        <ListRow
          title={t('planRow')}
          trailing={planLabel ? <Text variant="body" tone="muted">{planLabel}</Text> : undefined}
          trailingLabel={planLabel}
          onPress={() => router.push('/profile/plan')}
        />
        {/* Provisional, like the two rows above: UX-SET-01 regroups this page later. The password
            row moved to Privacy (UX-SET-07), so this is the way to it — and to Blocked users,
            which had no entry point anywhere in the app before. */}
        <ListRow
          title={t('privacyTitle')}
          onPress={() => router.push('/profile/privacy')}
          testID="settings-privacy-row"
        />
        <ListRow title={t('changeEmail')} onPress={() => router.push('/profile/change-email')} />
        <ListRow
          title={t('deleteAccount')}
          titleTone="destructive"
          onPress={() => router.push('/profile/delete-account')}
        />

        {/* Both groups collapse to one row each (UX-SET-12, UX-SET-13). Help center, Rate the app
            and Share the app now live on the Support hub, and the two legal documents on Legal —
            they were five loose rows spread across two headings. Provisional, like the rows
            above; UX-SET-01 regroups the page. */}
        <Text style={styles.section}>{t('support')}</Text>
        <ListRow
          title={t('support')}
          onPress={() => router.push('/profile/support')}
          testID="settings-support-row"
        />
        <ListRow
          title={t('legal')}
          onPress={() => router.push('/profile/legal')}
          testID="settings-legal-row"
        />

        <Button
          label={t('logout')}
          variant="ghost"
          fullWidth
          style={styles.logout}
          onPress={onLogout}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 4 },
  section: { fontSize: 13, fontWeight: '700', color: colors.mutedForeground, textTransform: 'uppercase', marginTop: 16, marginBottom: 4 },
  logout: { marginTop: 24, alignItems: 'center', paddingVertical: 14 },
});
