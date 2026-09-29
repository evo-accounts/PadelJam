/**
 * Explore's search input — the only global search in the app (UX-EXPL-01, D12).
 *
 * Full width under the title and inert on arrival: the feed shows below it. Focusing it enters
 * search mode, and a Cancel to its right leaves it again (blur, clear, back to the feed). What
 * search mode SHOWS is the screen's business, so M2's search states plug in without touching
 * this bar.
 */
import { useT } from '@padel/i18n';
import { forwardRef } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { space } from '../../theme';
import { Button, SearchInput } from '../ui';

export const ExploreSearchBar = forwardRef<
  TextInput,
  {
    value: string;
    onChangeText: (v: string) => void;
    active: boolean;
    onActivate: () => void;
    onCancel: () => void;
  }
>(function ExploreSearchBar({ value, onChangeText, active, onActivate, onCancel }, ref) {
  const { t } = useT('discovery');
  const { t: tc } = useT('common');
  return (
    <View style={styles.row}>
      <SearchInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => {
          if (!active) onActivate();
        }}
        placeholder={t('searchPlaceholder')}
        clearButtonMode="while-editing"
        containerStyle={styles.input}
        testID="explore-search-input"
      />
      {active ? (
        <Button label={tc('cancel')} variant="tertiary" size="sm" onPress={onCancel} testID="explore-search-cancel" />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[4],
    paddingBottom: space[2],
  },
  input: { flex: 1 },
});
