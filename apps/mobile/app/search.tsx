import { useT } from '@padel/i18n';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EXPLORE_TABS, ExploreList, type ExploreTab } from '@/components/explore/ExploreList';
import { Chip, Field, TopBar } from '@/components/ui';
import { useGoBack } from '@/lib/useGoBack';
import { colors, space } from '../theme';

type Tab = ExploreTab;
const isTab = (v: unknown): v is Tab => EXPLORE_TABS.includes(v as Tab);

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

  // Mirrors the `tab` effect above: a second navigation into an already-mounted
  // `/search` (e.g. a fresh deep link, or a search-within-search from a result)
  // carries a new `?q=` and the typed term should follow it.
  useEffect(() => {
    if (params.q !== undefined) setQuery(params.q);
  }, [params.q]);

  useEffect(() => {
    // autoFocus alone is unreliable once the screen finishes its push
    // transition, so nudge focus after mount as a belt-and-braces measure.
    const id = setTimeout(() => input.current?.focus(), 50);
    return () => clearTimeout(id);
  }, []);

  // "For you" has no dedicated screen here — a dedicated search screen with
  // nothing typed shows the browse (People) list rather than Explore's four
  // curated rails, and a typed query hands over to People the same way,
  // matching Explore's own "For you" behaviour.
  const listKind = tab === 'foryou' ? 'players' : tab;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar
        variant="nav"
        onBack={onBack}
        centre={
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
        }
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={styles.chipsWrap}
      >
        {EXPLORE_TABS.map((k) => (
          <Chip key={k} label={t(`tab_${k}`)} selected={tab === k} onPress={() => setTab(k)} testID={`search-tab-${k}`} />
        ))}
      </ScrollView>
      <ExploreList
        kind={listKind}
        query={query}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  chipsWrap: { flexGrow: 0 },
  chips: { paddingHorizontal: space[4], paddingVertical: space[2], gap: space[2] },
});
