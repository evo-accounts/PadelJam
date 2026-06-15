import { useT } from '@padel/i18n';
import { getAppIcon, setAppIcon } from 'expo-dynamic-app-icon';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const ICONS = [
  { name: 'default', key: 'iconDefault' as const, source: require('@/assets/app-icons/default.png') },
  { name: 'blue', key: 'iconBlue' as const, source: require('@/assets/app-icons/blue.png') },
  { name: 'dark', key: 'iconDark' as const, source: require('@/assets/app-icons/dark.png') },
  { name: 'light', key: 'iconLight' as const, source: require('@/assets/app-icons/light.png') },
  { name: 'mono', key: 'iconMono' as const, source: require('@/assets/app-icons/mono.png') },
  { name: 'classic', key: 'iconClassic' as const, source: require('@/assets/app-icons/classic.png') },
];

// getAppIcon() returns "DEFAULT" when no alternate icon is active.
function readActive(): string {
  try {
    const current = getAppIcon();
    return current === 'DEFAULT' ? 'default' : current;
  } catch {
    return 'default';
  }
}

export default function AppIconScreen() {
  const { t } = useT('profile');
  const [active, setActive] = useState<string>(readActive);
  const [error, setError] = useState<string | null>(null);

  const onSelect = (name: string) => {
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('appIcon') }} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.grid}>
        {ICONS.map((icon) => {
          const selected = icon.name === active;
          return (
            <Pressable
              key={icon.name}
              style={[styles.tile, selected && styles.tileActive]}
              onPress={() => onSelect(icon.name)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Image source={icon.source} style={styles.preview} contentFit="cover" />
              <Text style={[styles.label, selected && styles.labelActive]}>{t(icon.key)}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  content: { padding: 16, gap: 12 },
  error: { color: '#D7263D', fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 16 },
  tile: { width: '31%', alignItems: 'center', gap: 8, paddingVertical: 12, borderRadius: 16, borderWidth: 2, borderColor: 'transparent' },
  tileActive: { borderColor: '#0B7BFF', backgroundColor: '#fff' },
  preview: { width: 64, height: 64, borderRadius: 14, backgroundColor: '#fff' },
  label: { fontSize: 13, color: '#0B1F3A', fontWeight: '600' },
  labelActive: { color: '#0B7BFF', fontWeight: '700' },
});
