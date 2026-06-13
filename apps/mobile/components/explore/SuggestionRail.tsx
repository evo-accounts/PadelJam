import { FlashList } from '@shopify/flash-list';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

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
}: Props<T>) {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Pressable onPress={onSeeAll} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.seeAll}>{seeAllLabel}</Text>
        </Pressable>
      </View>
      {isLoading ? (
        <ActivityIndicator color="#0B1F3A" style={styles.state} />
      ) : isError ? (
        <Text style={styles.stateText}>{errorLabel}</Text>
      ) : data.length === 0 ? (
        <Text style={styles.stateText}>{emptyLabel}</Text>
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
  title: { fontSize: 18, fontWeight: '700', color: '#0B1F3A' },
  seeAll: { fontSize: 14, fontWeight: '600', color: '#0B7BFF' },
  listContent: { paddingHorizontal: 16 },
  state: { paddingVertical: 16 },
  stateText: { paddingHorizontal: 16, paddingVertical: 12, color: '#6B7685', fontSize: 14 },
});
