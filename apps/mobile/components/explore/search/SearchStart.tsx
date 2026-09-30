/**
 * Search with the input active and nothing typed (UX-EXPL-04): "For you" chips that wrap across
 * lines, then the viewer's recent searches — clock, the query, ✕ — with "Clear all". Each block is
 * hidden when it has nothing in it (D5, D6); with neither, a one-line hint says what can be found.
 *
 * The same blocks, order and behaviour as web's `SearchStart`.
 */
import { useSearchForYouTerms, type ForYouTerm } from '@padel/api';
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Chip, IconButton, Text } from '@/components/ui';
import { colors, space } from '../../../theme';
import { SearchRow } from './SearchRow';

const FORMAT_LABEL: Record<string, 'formatAmericano' | 'formatMexicano' | 'formatUpDown'> = {
  americano: 'formatAmericano',
  mexicano: 'formatMexicano',
  up_and_down: 'formatUpDown',
};

export function SearchStart({
  recents,
  onRunTerm,
  onRunQuery,
  onRemoveRecent,
  onClearRecents,
}: {
  recents: readonly string[];
  onRunTerm: (term: ForYouTerm) => void;
  onRunQuery: (q: string) => void;
  onRemoveRecent: (q: string) => void;
  onClearRecents: () => void;
}) {
  const { t } = useT('discovery');
  const forYou = useSearchForYouTerms();
  const terms = forYou.data ?? [];
  const label = (term: ForYouTerm) =>
    term.kind === 'format' ? t(FORMAT_LABEL[term.value] ?? 'formatAmericano') : term.value;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      // With the keyboard up, the last recent rows would otherwise sit under it.
      automaticallyAdjustKeyboardInsets
    >
      {forYou.isLoading ? (
        <ActivityIndicator color={colors.foreground} style={styles.loading} />
      ) : terms.length > 0 ? (
        <View style={styles.section}>
          <Text variant="sectionTitle" accessibilityRole="header">
            {t('forYouTitle')}
          </Text>
          <View style={styles.chips}>
            {terms.map((term) => (
              <Chip
                key={`${term.kind}:${term.value}`}
                label={label(term)}
                onPress={() => onRunTerm(term)}
                testID={`explore-for-you-${term.kind}-${term.value}`}
              />
            ))}
          </View>
        </View>
      ) : null}

      {recents.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.header}>
            <Text variant="sectionTitle" accessibilityRole="header">
              {t('recentTitle')}
            </Text>
            <Button
              label={t('recentClearAll')}
              variant="tertiary"
              size="sm"
              onPress={onClearRecents}
              testID="explore-recents-clear"
            />
          </View>
          <View>
            {recents.map((q, i) => (
              <SearchRow
                key={q}
                icon="clock"
                label={q}
                onPress={() => onRunQuery(q)}
                testID={`explore-recent-${i}`}
                trailing={
                  <IconButton
                    icon={
                      <SymbolView
                        name={{ ios: 'xmark', android: 'close', web: 'close' } as never}
                        size={14}
                        tintColor={colors.mutedForeground}
                      />
                    }
                    accessibilityLabel={t('recentRemove', { q })}
                    size="sm"
                    onPress={() => onRemoveRecent(q)}
                    testID={`explore-recent-remove-${i}`}
                  />
                }
              />
            ))}
          </View>
        </View>
      ) : null}

      {!forYou.isLoading && terms.length === 0 && recents.length === 0 ? (
        <Text variant="caption" tone="muted" testID="explore-search-hint">
          {t('searchHint')}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[10], gap: space[6] },
  loading: { paddingVertical: space[4] },
  section: { gap: space[3] },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
});
