import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';
import { EmptyState, emptyIcon } from '../ui';

type Props<T> = {
  title: string;
  seeAllLabel: string;
  onSeeAll: () => void;
  data: T[];
  isLoading: boolean;
  isError: boolean;
  emptyLabel: string;
  errorLabel: string;
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => React.ReactElement;
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
}: Props<T>) {
  const { t } = useT('common');
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Pressable onPress={onSeeAll} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.seeAll}>{seeAllLabel}</Text>
        </Pressable>
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
        <EmptyState icon={emptyIcon('magnifyingglass')} title={emptyLabel} testID={testID} />
      ) : (
        <FlashList
          horizontal
          data={data}
          keyExtractor={keyExtractor}
          showsHorizontalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => renderItem(item)}
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
