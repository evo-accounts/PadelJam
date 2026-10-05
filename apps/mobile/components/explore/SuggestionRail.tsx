import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/native';
import { colors } from '../../theme';
import { EmptyState, emptyIcon } from '../ui';

type Props<T> = {
  title: string;
  seeAllLabel?: string;
  /** Omitted for a section with nowhere to go (search's Players row, UX-EXPL-06). */
  onSeeAll?: () => void;
  data: T[];
  isLoading: boolean;
  isError: boolean;
  emptyLabel: string;
  errorLabel: string;
  keyExtractor: (item: T) => string;
  renderItem: (item: T, index: number) => React.ReactElement;
  /**
   * Retry the failed fetch. Optional: a caller that has not wired a refetch
   * callback through yet still gets the error-tone card, just without the
   * button — better than the old bare line either way.
   */
  onRetry?: () => void;
  /**
   * Distinguishes each rail's empty/error card in tests — four rails on one
   * screen would otherwise all answer to the same `empty-suggestion-rail`.
   * Defaults to that shared id so existing callers keep working unchanged.
   */
  testID?: string;
  /**
   * UX-EXPL-02 / D10: a section with nothing to recommend and no meaningful
   * next step is hidden rather than shown as an empty row. Only once the fetch
   * has settled — a loading or failed rail still shows its spinner or error.
   */
  hideWhenEmpty?: boolean;
  /** The empty state's call to action, for the sections that keep one (Events → Create event). */
  emptyAction?: { label: string; onPress: () => void; testID?: string };
  /** `See all`'s testID — four rails on one screen share its label. */
  seeAllTestID?: string;
};

export function SuggestionRail<T>({
  title,
  seeAllLabel,
  onSeeAll,
  data,
  isLoading,
  isError,
  emptyLabel,
  errorLabel,
  keyExtractor,
  renderItem,
  onRetry,
  testID = 'empty-suggestion-rail',
  hideWhenEmpty = false,
  emptyAction,
  seeAllTestID,
}: Props<T>) {
  const { t } = useT('common');
  if (hideWhenEmpty && !isLoading && !isError && data.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {onSeeAll ? (
          <Pressable onPress={onSeeAll} accessibilityRole="button" hitSlop={8} testID={seeAllTestID}>
            <Text style={styles.seeAll}>{seeAllLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {isLoading ? (
        <ActivityIndicator color={colors.foreground} style={styles.state} />
      ) : isError ? (
        <EmptyState
          tone="error"
          title={errorLabel}
          action={onRetry ? { label: t('retry'), onPress: onRetry } : undefined}
          testID={testID}
        />
      ) : data.length === 0 ? (
        <EmptyState icon={emptyIcon('magnifyingglass')} title={emptyLabel} action={emptyAction} testID={testID} />
      ) : (
        <FlashList
          horizontal
          data={data}
          keyExtractor={keyExtractor}
          showsHorizontalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
          contentContainerStyle={styles.listContent}
          renderItem={({ item, index }) => renderItem(item, index)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12, paddingVertical: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16 },
  title: { fontSize: 18, fontWeight: '700', color: colors.foreground },
  seeAll: { fontSize: 14, fontWeight: '600', color: colors.primary },
  listContent: { paddingHorizontal: 16 },
  state: { paddingVertical: 16 },
});
