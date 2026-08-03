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

import { space, type ThemeColors, useColors, useThemedStyles } from '../../theme';
import { Text } from './Text';

type ScreenProps = {
  children?: React.ReactNode;
  /** Wraps content in a ScrollView. Off by default — most lists scroll themselves. */
  scroll?: boolean;
  /** Horizontal gutter. `none` for full-bleed lists that pad their own rows. */
  padded?: boolean;
  style?: ViewStyle;
  testID?: string;
};

export function Screen({ children, scroll = false, padded = true, style, testID }: ScreenProps) {
  const styles = useThemedStyles(makeStyles);
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
  const styles = useThemedStyles(makeStyles);
  const colors = useColors();
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

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: c.background,
  },
  padded: { paddingHorizontal: space[5] },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingFill: { flex: 1 },
  loadingLabel: { marginTop: space[3] },
});
