/**
 * Typeahead (UX-EXPL-05, D7): up to 8 names matching what is typed, each a row with a chevron.
 * The caller passes the debounced text, so the list follows each keystroke without a request per
 * key, and the previous list stays up while the next loads. Tapping a row runs the full search
 * for that name. The first row always runs exactly what was typed, so the keyboard's Search key
 * has a visible twin — the same as web's `SearchSuggestions`.
 */
import { useSearchSuggest, type SearchSuggestionKind } from '@padel/api';
import { useT } from '@padel/i18n';
import { ScrollView, StyleSheet } from 'react-native';

import { space } from '../../../theme';
import { SearchRow } from './SearchRow';

const KIND_LABEL: Record<SearchSuggestionKind, 'kindPlayer' | 'kindEvent' | 'kindCommunity' | 'kindGroup'> = {
  player: 'kindPlayer',
  event: 'kindEvent',
  community: 'kindCommunity',
  group: 'kindGroup',
};

export function SearchSuggestions({
  typed,
  debounced,
  onRun,
}: {
  /** What is in the input right now — the first row runs exactly this. */
  typed: string;
  /** The same text, debounced: what the suggestions are fetched for. */
  debounced: string;
  onRun: (q: string) => void;
}) {
  const { t } = useT('discovery');
  const text = typed.trim();
  const suggest = useSearchSuggest(debounced);
  const rows = (suggest.data ?? []).filter((s) => s.label.toLocaleLowerCase() !== text.toLocaleLowerCase());

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      // The keyboard is up while typing: iOS insets the list by its height, so the last
      // suggestion can always be scrolled clear of it.
      automaticallyAdjustKeyboardInsets
    >
      <SearchRow icon="search" label={t('searchFor', { q: text })} onPress={() => onRun(text)} chevron testID="explore-suggestion-typed" />
      {rows.map((s) => (
        <SearchRow
          key={`${s.kind}:${s.id}`}
          icon={s.kind}
          label={s.label}
          accessibilityLabel={`${s.label}, ${t(KIND_LABEL[s.kind])}`}
          onPress={() => onRun(s.label)}
          chevron
          testID={`explore-suggestion-${s.kind}-${s.id}`}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space[4], paddingBottom: space[10] },
});
