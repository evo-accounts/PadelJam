import { useAccountPlan, useAuthProviders, useUpdateProfile } from '@padel/api';
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
  const authProviders = useAuthProviders();
  const [langOpen, setLangOpen] = useState(false);

  const current = (LANGS.find((l) => l.code === i18n.language) ?? LANGS[0])!;
  // Neutral while the plan query is loading: `data` is undefined then, and defaulting to
  // "planJammer" would flash the free label at a Jammer+ member before it resolves.
  const planLabel = accountPlan.isLoading
    ? undefined
    : t(accountPlan.data === 'jammer_plus' ? 'planJammerPlus' : 'planJammer');

  /**
   * "Change password" was shown to everyone, and for an account with no password it opened a
   * screen that asks for the current one and verifies it with signInWithPassword — a call that
   * cannot succeed when there is nothing to verify against. A Google or Apple sign-up was told
   * their password was wrong forever, with no way forward and no explanation.
   *
   * `auth_providers.has_password` decides which of the two the row is. While the query is IN
   * FLIGHT the row is withheld rather than guessed at: a title that flips from "Change password"
   * to "Create password" under the user's finger is the same lie in a shorter form. If the query
   * FAILS it settles on the existing label, which is the pre-existing behaviour and is also what
   * a database that has not yet had migration 0097 applied will produce — and the screen it opens
   * re-derives has_password for itself either way.
   */
  const hasPassword = authProviders.data?.has_password;
  const passwordRowTitle = hasPassword === false ? t('createPassword') : t('changePassword');

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
        {!authProviders.isLoading && (
          <ListRow
            title={passwordRowTitle}
            onPress={() => router.push('/profile/change-password')}
            testID="settings-password-row"
          />
        )}
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
