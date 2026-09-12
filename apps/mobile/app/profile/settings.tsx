import { useAccountPlan, useUpdateProfile } from '@padel/api';
import { signOut } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, Share, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { unregisterForPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { colors } from '../../theme';
import { Badge, BottomSheet, Button, ListRow, Text, TopBar } from '../../components/ui';

const TERMS_URL = 'https://padeljam.app/terms';
const PRIVACY_URL = 'https://padeljam.app/privacy';
const HELP_URL = 'https://padeljam.app/help';
const LANGS = [
  { code: 'en', key: 'languageEnglish' as const },
  { code: 'pt-PT', key: 'languagePtPt' as const },
  { code: 'pt-BR', key: 'languagePtBr' as const },
];

export default function SettingsScreen() {
  const { t, i18n } = useT('profile');
  const router = useRouter();
  const update = useUpdateProfile();
  const accountPlan = useAccountPlan();
  const [langOpen, setLangOpen] = useState(false);

  const current = (LANGS.find((l) => l.code === i18n.language) ?? LANGS[0])!;
  const planLabel = t(accountPlan.data === 'jammer_plus' ? 'planJammerPlus' : 'planJammer');

  const onSelectLang = (code: string) => {
    void i18n.changeLanguage(code);
    update.mutate({ locale: code });
    setLangOpen(false);
  };

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
        <ListRow
          title={t('language')}
          trailing={<Text variant="body" tone="muted">{t(current.key)}</Text>}
          trailingLabel={t(current.key)}
          onPress={() => setLangOpen(true)}
        />
        <ListRow title={t('appIcon')} onPress={() => router.push('/profile/app-icon')} />
        <ListRow title={t('notifications')} onPress={() => router.push('/profile/notifications')} />

        <Text style={styles.section}>{t('account')}</Text>
        <ListRow
          title={t('planRow')}
          trailing={<Text variant="body" tone="muted">{planLabel}</Text>}
          trailingLabel={planLabel}
          onPress={() => router.push('/profile/plan')}
        />
        <ListRow title={t('changePassword')} onPress={() => router.push('/profile/change-password')} />
        <ListRow title={t('changeEmail')} onPress={() => router.push('/profile/change-email')} />
        <ListRow
          title={t('deleteAccount')}
          titleTone="destructive"
          onPress={() => router.push('/profile/delete-account')}
        />

        <Text style={styles.section}>{t('support')}</Text>
        <ListRow title={t('contactSupport')} onPress={() => router.push('/profile/support')} />
        <ListRow title={t('helpCenter')} onPress={() => void Linking.openURL(HELP_URL)} />
        <ListRow
          title={t('shareApp')}
          onPress={() => void Share.share({ message: t('shareMessage') })}
        />

        <Text style={styles.section}>{t('legal')}</Text>
        <ListRow title={t('terms')} onPress={() => void Linking.openURL(TERMS_URL)} />
        <ListRow title={t('privacy')} onPress={() => void Linking.openURL(PRIVACY_URL)} />

        <Button
          label={t('logout')}
          variant="ghost"
          fullWidth
          style={styles.logout}
          onPress={onLogout}
        />
      </ScrollView>

      <BottomSheet visible={langOpen} onClose={() => setLangOpen(false)} title={t('languageSheetTitle')} testID="language-sheet">
        {LANGS.map((l) => (
          <ListRow
            key={l.code}
            title={t(l.key)}
            selected={l.code === current.code}
            trailing={l.code === current.code ? <Badge label="✓" tone="primary" /> : undefined}
            onPress={() => onSelectLang(l.code)}
            testID={`language-sheet-${l.code}`}
          />
        ))}
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 4 },
  section: { fontSize: 13, fontWeight: '700', color: colors.mutedForeground, textTransform: 'uppercase', marginTop: 16, marginBottom: 4 },
  logout: { marginTop: 24, alignItems: 'center', paddingVertical: 14 },
});
