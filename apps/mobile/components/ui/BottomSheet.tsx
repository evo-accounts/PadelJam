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
import { Modal, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, space } from '../../theme';
import { IconButton } from './IconButton';
import { Text } from './Text';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  style?: ViewStyle;
  testID?: string;
};

export function BottomSheet({ visible, onClose, title, children, style, testID }: Props) {
  const { t } = useT('common');
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
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
    </Modal>
  );
}

const styles = StyleSheet.create({
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
