import { useT } from '@padel/i18n';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ExploreList, type ExploreKind } from '@/components/explore/ExploreList';
import { Chip, Field, TopBar } from '@/components/ui';
import { useGoBack } from '@/lib/useGoBack';
import { colors, space } from '../theme';

type Tab = 'foryou' | ExploreKind;
const TABS: Tab[] = ['foryou', 'events', 'groups', 'communities', 'players'];
const isTab = (v: unknown): v is Tab => TABS.includes(v as Tab);

/**
 * `/search` — one screen for every tab bar's search icon (UX-GLOB-08).
 *
 * `?tab=` seeds which chip is active (Home's quick actions deep-link here with
 * `events`/`groups`/`communities`); `?q=` seeds the typed term. `useGoBack`
 * rather than `router.back()`: a cold deep link into `/search` has nothing to
 * pop back to, and `router.back()` would leave the user stranded.
 */
export default function SearchScreen() {
  const { t } = useT('discovery');
  const onBack = useGoBack();
  const params = useLocalSearchParams<{ tab?: string; q?: string }>();
  const [tab, setTab] = useState<Tab>(isTab(params.tab) ? params.tab : 'foryou');
  const [query, setQuery] = useState(params.q ?? '');
  const input = useRef<TextInput>(null);

  useEffect(() => {
    if (isTab(params.tab)) setTab(params.tab);
  }, [params.tab]);

  useEffect(() => {
    // autoFocus alone is unreliable once the screen finishes its push
    // transition, so nudge focus after mount as a belt-and-braces measure.
    const id = setTimeout(() => input.current?.focus(), 50);
    return () => clearTimeout(id);
  }, []);

  // "For you" cannot filter four curated rails by a term; a typed query hands
  // over to People, matching Explore's own "For you" behaviour.
  const listKind: ExploreKind = tab === 'foryou' ? 'players' : tab;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="nav" title={t('searchTitle')} onBack={onBack} />
      <View style={styles.searchWrap}>
        <Field
          ref={input}
          value={query}
          onChangeText={setQuery}
          placeholder={t('searchPlaceholder')}
          autoFocus
          returnKeyType="search"
          autoCapitalize="none"
          clearButtonMode="while-editing"
          accessibilityLabel={t('searchPlaceholder')}
          testID="search-input"
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={styles.chipsWrap}
      >
        {TABS.map((k) => (
          <Chip key={k} label={t(`tab_${k}`)} selected={tab === k} onPress={() => setTab(k)} testID={`search-tab-${k}`} />
        ))}
      </ScrollView>
      <ExploreList kind={listKind} query={query} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchWrap: { paddingHorizontal: space[4], paddingTop: space[2] },
  chipsWrap: { flexGrow: 0 },
  chips: { paddingHorizontal: space[4], paddingVertical: space[2], gap: space[2] },
});
