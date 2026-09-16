/**
 * BottomSheet — the ONE way this app presents an overflow menu, a confirmation or a selector
 * (UX-GLOB-02). Anchored to the bottom, ✕ top-right, optional title, children stacked full width.
 *
 * Accessibility shape, learned from PendingActionsSheet: the backdrop is `accessible={false}` so
 * VoiceOver does not collapse the modal into one element; the sheet is a View with
 * `accessibilityViewIsModal` that claims the responder so taps inside never reach the backdrop.
 */
import { useT } from '@padel/i18n';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, space } from '../../theme';
import { IconButton } from './IconButton';
import { Text } from './Text';

type Props = {
  visible: boolean;
  onClose: () => void;
  /**
   * Fires once the sheet has actually finished dismissing — not when `visible`
   * flips to false, but after the Modal itself is gone. On iOS this is the
   * Modal's own `onDismiss`. Android's Modal has no such callback, so it is
   * simulated here: a `useEffect` watches `visible` flip true -> false and
   * fires after a `requestAnimationFrame`, giving the close animation a frame
   * to start before callers (e.g. a caller `await`ing the sheet's promise)
   * act on the dismissal. Guarded to fire once per close on both platforms.
   * Does not fire if the component unmounts while still visible.
   */
  onDismissed?: () => void;
  title?: string;
  children: ReactNode;
  style?: ViewStyle;
  testID?: string;
};

export function BottomSheet({ visible, onClose, onDismissed, title, children, style, testID }: Props) {
  const { t } = useT('common');
  const insets = useSafeAreaInsets();
  const wasVisible = useRef(visible);
  const onDismissedRef = useRef(onDismissed);

  // Keep the latest callback available to the emulation effect below without
  // making it a dependency — see that effect for why.
  useEffect(() => {
    onDismissedRef.current = onDismissed;
  });

  useEffect(() => {
    const justClosed = wasVisible.current && !visible;
    wasVisible.current = visible;
    if (Platform.OS === 'ios' || !justClosed) return;
    // Depends on `visible` only: `SheetHost` passes an inline `onDismissed`
    // closure, so including it here would re-run this effect (cancelling and
    // never rescheduling the frame, since `justClosed` is only true once) on
    // any re-render between the true -> false flip and the scheduled frame.
    const handle = requestAnimationFrame(() => onDismissedRef.current?.());
    return () => cancelAnimationFrame(handle);
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={onDismissed}
    >
      {/*
        The sheet is bottom-anchored, so an open keyboard sits ON TOP of it.
        Everything it covered was not merely hidden but ABSENT from the
        accessibility tree — measured on the country picker, keyboard top y=590
        and no element below it — which made rows unreachable to VoiceOver and
        invisible to the end-to-end driver.

        There is a second, sharper reason this matters. When a control is
        occluded, driver/actions.ts dismisses the keyboard by tapping a caption;
        the only captions left reachable were BEHIND the sheet, and a tap there
        lands on this backdrop and closes it. The sheet vanished mid-test and
        the failure surfaced somewhere else entirely. Lifting the sheet above
        the keyboard removes the occlusion, and with it the whole path.
      */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <Pressable style={styles.backdrop} onPress={onClose} accessible={false}>
        <View
          testID={testID}
          style={[styles.sheet, { paddingBottom: insets.bottom + space[4] }, style]}
          accessibilityViewIsModal
          onStartShouldSetResponder={() => true}
          onAccessibilityEscape={onClose}
        >
          <View style={styles.header}>
            {title ? (
              <Text
                variant="sectionTitle"
                tone="default"
                style={styles.title}
                numberOfLines={2}
                accessibilityRole="header"
              >
                {title}
              </Text>
            ) : (
              <View style={styles.title} />
            )}
            <IconButton icon="✕" accessibilityLabel={t('close')} size="md" onPress={onClose} testID={testID ? `${testID}-close` : undefined} />
          </View>
          {children}
        </View>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: space[3],
    paddingHorizontal: space[2],
  },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[2], marginBottom: space[2] },
  title: { flex: 1 },
});
