/**
 * Explore's search input — the only global search in the app (UX-EXPL-01, D12).
 *
 * Full width under the title and inert on arrival: the feed shows below it. Focusing it enters
 * search mode, and a Cancel to its right leaves it again (blur, clear, back to the feed). Once a
 * query has run, a back arrow to the LEFT of the input returns to the suggestions for what is
 * typed (UX-EXPL-06). The keyboard's Search key runs what is typed. What each state SHOWS is the
 * screen's business.
 */
import { useT } from '@padel/i18n';
import { SymbolView } from 'expo-symbols';
import { forwardRef } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';

import { colors, space } from '../../theme';
import { Button, IconButton, SearchInput } from '../ui';

export const ExploreSearchBar = forwardRef<
  TextInput,
  {
    value: string;
    onChangeText: (v: string) => void;
    active: boolean;
    onActivate: () => void;
    onCancel: () => void;
    /** Runs what is typed (the keyboard's Search key). */
    onSubmit: () => void;
    /** Shown only once a query has run: back to the suggestions (UX-EXPL-06). */
    onBack?: () => void;
  }
>(function ExploreSearchBar({ value, onChangeText, active, onActivate, onCancel, onSubmit, onBack }, ref) {
  const { t } = useT('discovery');
  const { t: tc } = useT('common');
  return (
    <View style={styles.row}>
      {onBack ? (
        <IconButton
          icon={
            <SymbolView
              name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' } as never}
              size={20}
              tintColor={colors.foreground}
            />
          }
          accessibilityLabel={t('backToSuggestions')}
          size="md"
          onPress={onBack}
          testID="explore-search-back"
        />
      ) : null}
      <SearchInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => {
          if (!active) onActivate();
        }}
        onSubmitEditing={onSubmit}
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
