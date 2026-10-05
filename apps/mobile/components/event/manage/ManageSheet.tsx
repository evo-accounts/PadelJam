/**
 * The chrome every Manage Event sheet shares (UX-MEVT-04..08, 19–21): a BottomSheet (UX-GLOB-02 —
 * title, ✕ top-right) whose body scrolls, and a fixed footer with the primary action over a
 * secondary Cancel.
 *
 * Submission feedback (UX-GLOB-06) lives IN the sheet: the app's banner is mounted under the
 * navigator, and a sheet is a Modal on top of it, so a banner raised while a sheet is open would
 * be hidden behind it. A failed Save therefore shows its message here, as an alert line above the
 * buttons, and the invalid inputs turn red through their own `error`. Success closes the sheet and
 * the caller raises the success banner, which is visible again once the sheet is gone.
 */
import { useT } from '@padel/i18n';
import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space } from '../../../theme';
import { BottomSheet, Button, Text } from '../../ui';

type Props = {
  title: string;
  onClose: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  busy?: boolean;
  destructive?: boolean;
  /** Defaults to the common "Cancel". */
  secondaryLabel?: string;
  /** The failed submit's message, shown as an alert above the buttons. */
  error?: string | null;
  /** Pinned above the buttons, outside the scrolling body — e.g. Send blast's "Save blast" tick. */
  footerExtra?: ReactNode;
  children: ReactNode;
  /** The sheet is `{testID}`; Save `{testID}-save`, Cancel `{testID}-cancel`, ✕ `{testID}-close`. */
  testID: string;
};

export function ManageSheet({
  title,
  onClose,
  primaryLabel,
  onPrimary,
  busy = false,
  destructive = false,
  secondaryLabel,
  error,
  footerExtra,
  children,
  testID,
}: Props) {
  const { t: tc } = useT('common');
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  // BottomSheet lifts itself above the keyboard; the body must shrink by the same amount or the
  // sheet's top (the field being typed in) is pushed off screen. What stays: status bar, the
  // sheet's title row and the two footer buttons.
  const maxBody = keyboard > 0 ? Math.max(120, height - keyboard - insets.top - CHROME) : height * 0.62;
  return (
    <BottomSheet visible onClose={onClose} title={title} testID={testID}>
      <ScrollView
        style={{ maxHeight: maxBody }}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      <View style={styles.footer}>
        {footerExtra}
        {error ? (
          <Text variant="caption" tone="destructive" accessibilityRole="alert" testID={`${testID}-error`}>
            {error}
          </Text>
        ) : null}
        <Button
          label={primaryLabel}
          variant={destructive ? 'destructive' : 'primary'}
          fullWidth
          loading={busy}
          onPress={onPrimary}
          testID={`${testID}-save`}
        />
        <Button
          label={secondaryLabel ?? tc('cancel')}
          variant="secondary"
          fullWidth
          disabled={busy}
          onPress={onClose}
          testID={`${testID}-cancel`}
        />
      </View>
    </BottomSheet>
  );
}

/** Title row + footer buttons + paddings, in points: what the body must leave room for. */
const CHROME = 250;

function useKeyboardHeight(): number {
  const [h, setH] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) =>
      setH(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return h;
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space[2], paddingBottom: space[4], gap: space[4] },
  footer: { gap: space[2], paddingHorizontal: space[2], paddingTop: space[3] },
});
