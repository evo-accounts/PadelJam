/**
 * SearchInput — the inline "filter the list you are already looking at" box.
 *
 * Five screens hand-rolled this before it existed (chat's New Chat, group
 * invite, group members, followers, following), each with its own inline
 * `StyleSheet` entry and its own idea of the radius and padding. Two of them
 * also carried a literal `borderRadius: 12`, which is what the size ratchet in
 * `scripts/check-size-budget.mjs` exists to stop.
 *
 * This is NOT `Field`, and the difference is deliberate:
 *
 * - **No label, and no `accessibilityLabel`.** `Field` sets `accessibilityLabel`
 *   from its `label`, which turns the input into a LABELLED element. The E2E
 *   driver reads the accessibility tree, and a dozen assertions across suites
 *   01, 02, 07 and 12 select a box with a bare `{ type: 'TextField' }`. Giving
 *   this one a label would change its type out from under them. Suite 11 has
 *   already been through exactly this: the community invite search moved to
 *   `Field` and its test had to be rewritten to address the field by `testID`,
 *   with a comment recording why. One migration of that kind is a lesson; five
 *   would be a bad afternoon. Pass `testID` when a test needs to find a
 *   specific box — a `TextInput` is an accessibility element, so its testID
 *   does reach the tree (a plain `View`'s does not).
 *
 * - **No message slot.** A filter cannot be invalid. `Field` reserves space for
 *   an error so forms do not jump as you type; there is nothing here to say.
 *
 * VoiceOver announces the placeholder, which is what these five inputs already
 * did — the magnifier is decorative and hidden, because "search" next to a box
 * whose placeholder already says "Search players" is the icon being read twice.
 *
 * This is the INLINE search of UX-PROF-05 and UX-SET-06, not the global search
 * screen of UX-GLOB-08 — that one lives in `TopBar`'s `centre` slot and is a
 * different thing.
 */
import { SymbolView } from 'expo-symbols';
import { forwardRef } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

import { colors, radius, space, type } from '../../theme';

export type SearchInputProps = Omit<TextInputProps, 'style'> & {
  /** Wrapper style — margins and width. The box itself is not themeable. */
  containerStyle?: ViewStyle;
};

export const SearchInput = forwardRef<TextInput, SearchInputProps>(function SearchInput(
  { containerStyle, ...rest },
  ref,
) {
  return (
    <View style={[styles.container, containerStyle]}>
      <SymbolView
        name={{ ios: 'magnifyingglass', android: 'search', web: 'search' } as never}
        size={18}
        tintColor={colors.mutedForeground}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <TextInput
        ref={ref}
        style={styles.input}
        placeholderTextColor={colors.ring}
        autoCapitalize="none"
        autoCorrect={false}
        // `search` swaps the keyboard's return key for a Search key. It does not
        // submit anything: every consumer filters as you type.
        returnKeyType="search"
        {...rest}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.input,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    backgroundColor: colors.card,
  },
  // `flex: 1` rather than a width: the magnifier is a fixed 18pt and the box
  // takes whatever is left, so the input still fills a narrow phone.
  input: { flex: 1, minHeight: 44, color: colors.foreground, fontSize: type.body.fontSize },
});
