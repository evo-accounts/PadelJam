import { useUpdateProfile } from '@padel/api';
import { signOut } from '@padel/auth';
import { useT } from '@padel/i18n';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text } from 'react-native';

import { unregisterForPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { colors } from '../../theme';

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
  const [langOpen, setLangOpen] = useState(false);

  const current = (LANGS.find((l) => l.code === i18n.language) ?? LANGS[0])!;

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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('settings') }} />

      <Text style={styles.section}>{t('preferences')}</Text>
      <Pressable style={styles.row} onPress={() => setLangOpen((v) => !v)} accessibilityRole="button">
        <Text style={styles.rowLabel}>{t('language')}</Text>
        <Text style={styles.rowValue}>{t(current.key)}</Text>
      </Pressable>
      {langOpen &&
        LANGS.map((l) => (
          <Pressable key={l.code} style={styles.option} onPress={() => onSelectLang(l.code)} accessibilityRole="button">
            <Text style={[styles.optionText, l.code === current.code && styles.optionActive]}>{t(l.key)}</Text>
          </Pressable>
        ))}
      <Pressable style={styles.row} onPress={() => router.push('/profile/app-icon')} accessibilityRole="button">
        <Text style={styles.rowLabel}>{t('appIcon')}</Text>
      </Pressable>
      <Pressable style={styles.row} onPress={() => router.push('/profile/notifications')} accessibilityRole="button">
        <Text style={styles.rowLabel}>{t('notifications')}</Text>
      </Pressable>

      <Text style={styles.section}>{t('account')}</Text>
      <Pressable style={styles.row} onPress={() => router.push('/profile/change-password')} accessibilityRole="button">
        <Text style={styles.rowLabel}>{t('changePassword')}</Text>
      </Pressable>
      <Pressable style={styles.row} onPress={() => router.push('/profile/change-email')} accessibilityRole="button">
        <Text style={styles.rowLabel}>{t('changeEmail')}</Text>
      </Pressable>
      <Pressable style={styles.row} onPress={() => router.push('/profile/delete-account')} accessibilityRole="button">
        <Text style={[styles.rowLabel, { color: colors.destructive }]}>{t('deleteAccount')}</Text>
      </Pressable>

      <Text style={styles.section}>{t('support')}</Text>
      <Pressable style={styles.row} onPress={() => router.push('/profile/support')} accessibilityRole="button">
        <Text style={styles.rowLabel}>{t('contactSupport')}</Text>
      </Pressable>
      <Pressable style={styles.row} onPress={() => void Linking.openURL(HELP_URL)} accessibilityRole="button">
        <Text style={styles.rowLabel}>{t('helpCenter')}</Text>
      </Pressable>
      <Pressable style={styles.row} onPress={() => void Share.share({ message: t('shareMessage') })} accessibilityRole="button">
        <Text style={styles.rowLabel}>{t('shareApp')}</Text>
      </Pressable>

      <Text style={styles.section}>{t('legal')}</Text>
      <Pressable style={styles.row} onPress={() => void Linking.openURL(TERMS_URL)} accessibilityRole="button">
        <Text style={styles.rowLabel}>{t('terms')}</Text>
      </Pressable>
      <Pressable style={styles.row} onPress={() => void Linking.openURL(PRIVACY_URL)} accessibilityRole="button">
        <Text style={styles.rowLabel}>{t('privacy')}</Text>
      </Pressable>

      <Pressable style={styles.logout} onPress={onLogout} accessibilityRole="button">
        <Text style={styles.logoutText}>{t('logout')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 4 },
  section: { fontSize: 13, fontWeight: '700', color: colors.mutedForeground, textTransform: 'uppercase', marginTop: 16, marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 6 },
  rowLabel: { fontSize: 15, color: colors.foreground, fontWeight: '600' },
  rowValue: { fontSize: 14, color: colors.mutedForeground },
  option: { backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginBottom: 4 },
  optionText: { fontSize: 15, color: colors.foreground },
  optionActive: { color: colors.primary, fontWeight: '700' },
  logout: { marginTop: 24, alignItems: 'center', paddingVertical: 14 },
  logoutText: { color: colors.destructive, fontWeight: '700', fontSize: 16 },
});
