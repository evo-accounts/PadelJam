/**
 * Screen and Loading — the outermost wrapper, and the thing shown while it
 * waits.
 *
 * `container:` appears 91 times and `center:` 26; an ActivityIndicator shows up
 * in 58 files, each choosing its own colour and centring. Those are the two
 * shapes almost every screen starts from.
 *
 * `Screen` deliberately does NOT apply safe-area insets. expo-router already
 * renders these inside a navigator that handles the top inset, so adding it here
 * double-pads every header. Screens that genuinely need the bottom inset (a
 * pinned footer above the home indicator) should reach for
 * `useSafeAreaInsets()` explicitly, where it is visible in review.
 */
import { ActivityIndicator, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, space } from '../../theme';
import { Text } from './Text';

type ScreenProps = {
  children?: React.ReactNode;
  /**
   * Wraps content in a ScrollView. Off by default — most lists scroll themselves.
   *
   * That ScrollView sets `keyboardShouldPersistTaps="handled"`, which is the whole reason a
   * screen with a form should reach for this rather than roll its own. The RN default is
   * "never": the first tap anywhere inside the scroller while the keyboard is up is spent
   * DISMISSING the keyboard and never reaches the child. Submit is the last thing you touch
   * after typing, so it takes two taps, and the first reads as nothing happening at all — no
   * banner, no spinner, the form still filled. "handled" keeps dismiss-on-tap-outside for
   * taps no control claims, which is what was wanted in the first place.
   */
  scroll?: boolean;
  /**
   * Horizontal gutter of `space[5]` (20). Off for full-bleed lists that pad their own rows —
   * and for the screens whose content container already sets `padding: 16`, which is BOTH a
   * narrower gutter and a vertical pad this prop does not give. Those pass `padded={false}`
   * with their own `style`, so they take the scroll behaviour without a layout change.
   */
  padded?: boolean;
  style?: ViewStyle;
  testID?: string;
};

export function Screen({ children, scroll = false, padded = true, style, testID }: ScreenProps) {
  const content = [styles.screen, padded && styles.padded, style];

  if (scroll) {
    return (
      <ScrollView
        testID={testID}
        style={styles.screen}
        contentContainerStyle={[padded && styles.padded, style]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View testID={testID} style={content}>
      {children}
    </View>
  );
}

type LoadingProps = {
  /** Announced to assistive tech and shown under the spinner. */
  label?: string;
  /** Fills its parent and centres. Off for inline use inside a row. */
  fill?: boolean;
  testID?: string;
};

export function Loading({ label, fill = true, testID }: LoadingProps) {
  return (
    <View
      testID={testID}
      style={[styles.loading, fill && styles.loadingFill]}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <ActivityIndicator size="large" color={colors.primary} />
      {label ? (
        <Text variant="caption" tone="muted" style={styles.loadingLabel}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  padded: { paddingHorizontal: space[5] },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingFill: { flex: 1 },
  loadingLabel: { marginTop: space[3] },
});
