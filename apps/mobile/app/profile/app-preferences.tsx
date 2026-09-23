/**
 * App preferences (UX-SET-08).
 *
 * Two things that were scattered: Language lived as a row plus a bottom sheet inside
 * `settings.tsx`, and the app icon had a screen of its own at `/profile/app-icon` reached from
 * another Settings row. Neither is an account setting — they change how this install of the app
 * looks and reads, and nothing about the account behind it — so they belong together.
 *
 * Both apply IMMEDIATELY. There is no Save button and no confirmation: picking a language changes
 * the language, picking an icon changes the icon. A Save step here would be asking the user to
 * confirm something they can already see has happened.
 *
 * No Jammer+ gate on the icon, deliberately. It has never been gated, and putting a paywall in
 * front of a working feature would be taking it away from the people already using it.
 */
import { useUpdateProfile } from '@padel/api';
import { useT } from '@padel/i18n';
import { getAppIcon, setAppIcon } from 'expo-dynamic-app-icon';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, space, weight } from '../../theme';
import { Badge, BottomSheet, ListRow, Screen, Text, TopBar } from '../../components/ui';

const LANGS = [
  { code: 'en', key: 'languageEnglish' as const },
  { code: 'pt-PT', key: 'languagePtPt' as const },
  { code: 'pt-BR', key: 'languagePtBr' as const },
];

const ICONS = [
  // 'primary' (not 'default'): Android resource names can't be Java keywords,
  // and the plugin emits a mipmap per key — 'default' broke the release build.
  { name: 'primary', key: 'iconDefault' as const, source: require('@/assets/app-icons/primary.png') },
  { name: 'blue', key: 'iconBlue' as const, source: require('@/assets/app-icons/blue.png') },
  { name: 'dark', key: 'iconDark' as const, source: require('@/assets/app-icons/dark.png') },
  { name: 'light', key: 'iconLight' as const, source: require('@/assets/app-icons/light.png') },
  { name: 'mono', key: 'iconMono' as const, source: require('@/assets/app-icons/mono.png') },
  { name: 'classic', key: 'iconClassic' as const, source: require('@/assets/app-icons/classic.png') },
];

/**
 * getAppIcon() returns "DEFAULT" when no alternate icon is active.
 *
 * Seeded from the OS, not from storage: the selection IS persisted — by the system, which keeps
 * the alternate icon across launches — so this `useState` mirrors a native read rather than
 * owning the value.
 */
function readActive(): string {
  try {
    const current = getAppIcon();
    return current === 'DEFAULT' ? 'primary' : current;
  } catch {
    return 'primary';
  }
}

export default function AppPreferencesScreen() {
  const { t, i18n } = useT('profile');
  const router = useRouter();
  const update = useUpdateProfile();

  const [langOpen, setLangOpen] = useState(false);
  const [active, setActive] = useState<string>(readActive);
  const [error, setError] = useState<string | null>(null);

  const current = (LANGS.find((l) => l.code === i18n.language) ?? LANGS[0])!;

  const onSelectLang = (code: string) => {
    void i18n.changeLanguage(code);
    // Persisted to `profiles.locale` so the choice follows the account to another device, and so
    // server-sent notifications are written in the language the user actually picked.
    update.mutate({ locale: code });
    setLangOpen(false);
  };

  const onSelectIcon = (name: string) => {
    setError(null);
    if (name === active) return;
    try {
      const result = setAppIcon(name);
      if (result === false) {
        setError(t('appIconUnsupported'));
        return;
      }
      setActive(name);
    } catch {
      setError(t('appIconUnsupported'));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="nav" title={t('appPreferencesTitle')} onBack={() => router.back()} />
      <Screen scroll padded={false} style={styles.content}>
        <View style={styles.block}>
          <Text variant="label">{t('language')}</Text>
          <Text variant="hint" tone="muted">
            {t('languageDescription')}
          </Text>
          <ListRow
            variant="card"
            title={t(current.key)}
            onPress={() => setLangOpen(true)}
            testID="app-preferences-language-row"
          />
        </View>

        <View style={styles.block}>
          <Text variant="label">{t('appIcon')}</Text>
          <Text variant="hint" tone="muted">
            {t('appIconDescription')}
          </Text>
          {error ? (
            <Text variant="hint" tone="destructive">
              {error}
            </Text>
          ) : null}
          <View style={styles.grid}>
            {ICONS.map((icon) => {
              const selected = icon.name === active;
              return (
                <Pressable
                  key={icon.name}
                  style={[styles.tile, selected && styles.tileActive]}
                  onPress={() => onSelectIcon(icon.name)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  testID={`app-icon-${icon.name}`}
                >
                  <Image source={icon.source} style={styles.preview} contentFit="cover" />
                  <Text variant="hint" tone={selected ? 'primary' : 'default'} style={styles.tileLabel}>
                    {t(icon.key)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Screen>

      <BottomSheet
        visible={langOpen}
        onClose={() => setLangOpen(false)}
        title={t('languageSheetTitle')}
        testID="language-sheet"
      >
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
  content: { padding: space[4], gap: space[6] },
  block: { gap: space[2] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space[4] },
  tile: {
    width: '31%',
    alignItems: 'center',
    gap: space[2],
    paddingVertical: space[3],
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tileActive: { borderColor: colors.primary, backgroundColor: colors.card },
  preview: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.card },
  tileLabel: { fontWeight: weight.semibold },
});
