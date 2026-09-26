import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { colors, radius, space } from '../../../theme';
import { Text } from '../../ui';

/**
 * An inline "good to know" box inside a wizard step — the manual venue's "this event only" note,
 * the "selecting courts does not book them" note. Not the transient top `Banner`: this stays put
 * next to what it explains. The icon is decorative; the sentence is read as one element.
 */
export function InfoNote({ text, testID }: { text: string; testID?: string }) {
  return (
    // Deliberately NOT an `accessible` grouping View: non-button accessible Views have left later
    // screens' buttons reporting as AXGenericElement in the E2E tree. The Text is the element.
    <View style={styles.box}>
      <SymbolView
        name={{ ios: 'info.circle', android: 'info', web: 'info' } as never}
        size={18}
        tintColor={colors.info}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text variant="caption" tone="default" style={styles.text} testID={testID}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[2],
    padding: space[3],
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: { flex: 1 },
});
