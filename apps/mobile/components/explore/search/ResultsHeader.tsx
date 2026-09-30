/**
 * The top of a typed result tab (UX-EXPL-07): the result count on the left and the filter control
 * on the right, then the applied filters as chips with ✕ in a row that scrolls sideways — and is
 * not there at all when nothing is applied. The same header as web's `ResultsHeader`.
 */
import { buttonSize, buttonTone } from '@padel/ui';
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Chip, Text } from '@/components/ui';
import { space } from '../../../theme';

/** One applied filter as a removable chip. */
export type AppliedChip = { key: string; label: string; onRemove: () => void };

export function ResultsHeader({
  count,
  loading,
  onFilter,
  chips,
  testID,
}: {
  count: number;
  loading: boolean;
  onFilter: () => void;
  chips: AppliedChip[];
  testID: string;
}) {
  const { t } = useT('discovery');
  const applied = chips.length;
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text variant="label" testID={`${testID}-count`} accessibilityLiveRegion="polite">
          {loading ? ' ' : t('resultCount', { count })}
        </Text>
        <Button
          label={applied > 0 ? `${t('filter')} (${applied})` : t('filter')}
          accessibilityLabel={applied > 0 ? `${t('filter')}, ${t('filtersApplied', { count: applied })}` : t('filter')}
          variant="secondary"
          size="sm"
          leftIcon={
            <SymbolView
              name={{ ios: 'line.3.horizontal.decrease', android: 'tune', web: 'tune' } as never}
              size={buttonSize.sm.icon}
              tintColor={buttonTone.secondary.fg}
            />
          }
          onPress={onFilter}
          testID={`${testID}-filter`}
        />
      </View>
      {applied > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.chips}
          style={styles.chipsWrap}
        >
          {chips.map((chip, i) => (
            <Chip
              key={chip.key}
              label={chip.label}
              removeLabel={t('removeFilter', { label: chip.label })}
              onPress={chip.onRemove}
              testID={`${testID}-chip-${i}`}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[3], paddingTop: space[3] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[3],
    paddingHorizontal: space[4],
  },
  chipsWrap: { flexGrow: 0 },
  chips: { flexDirection: 'row', gap: space[2], paddingHorizontal: space[4] },
});
