/**
 * A list row that reveals ONE action when swiped left (UX-COMM-18, UX-COMM-19).
 *
 * The first swipe gesture in this app, so two rules are set here rather than
 * rediscovered per call site:
 *
 * 1. **A swipe is never the only way to reach an action.** The revealed button
 *    does not exist in the accessibility tree until it is revealed, so a
 *    swipe-only Archive is invisible to VoiceOver — and, for the same reason,
 *    to the E2E driver. Every caller must also offer the action on tap; the
 *    `accessibilityActions` below give assistive tech a third, direct route.
 * 2. **One action, not a row of them.** Two or three buttons behind a row make
 *    each a small target and force a judgement about which is destructive at
 *    the moment of the gesture. Callers with several actions reveal a single
 *    button that opens the sheet holding them all, which is what "swiping a row
 *    exposes the same actions" means in practice.
 */
import { useRef } from 'react';
import { Pressable, StyleSheet, View, type AccessibilityActionEvent } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { colors, radius, space } from '../../theme';
import { Text } from './Text';

type Props = {
  children: React.ReactNode;
  /** The revealed button's label, and the assistive-tech action name. */
  actionLabel: string;
  onAction: () => void;
  /** Tints the revealed button; the caller still owns any confirmation step. */
  destructive?: boolean;
  testID?: string;
};

export function SwipeRow({ children, actionLabel, onAction, destructive, testID }: Props) {
  const ref = useRef<SwipeableMethods>(null);

  const run = () => {
    // Close first: leaving the row open behind a sheet or a navigation means it
    // is still open when the user comes back to a list that has since changed.
    ref.current?.close();
    onAction();
  };

  return (
    <View
      accessibilityActions={[{ name: 'activate', label: actionLabel }]}
      onAccessibilityAction={(e: AccessibilityActionEvent) => {
        if (e.nativeEvent.actionName === 'activate') run();
      }}
    >
      <ReanimatedSwipeable
        ref={ref}
        friction={2}
        rightThreshold={40}
        overshootRight={false}
        renderRightActions={() => (
          <Pressable
            onPress={run}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            style={[styles.action, destructive ? styles.destructive : styles.neutral]}
            testID={testID}
          >
            <Text
              variant="label"
              style={destructive ? styles.destructiveLabel : styles.neutralLabel}
            >
              {actionLabel}
            </Text>
          </Pressable>
        )}
      >
        {children}
      </ReanimatedSwipeable>
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: space[5],
    marginVertical: space[1],
    marginRight: space[4],
    borderRadius: radius.lg,
  },
  neutral: { backgroundColor: colors.secondary },
  destructive: { backgroundColor: colors.destructive },
  neutralLabel: { color: colors.secondaryForeground },
  destructiveLabel: { color: colors.destructiveForeground },
});
