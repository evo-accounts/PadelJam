/**
 * SwitchRow — a label, an optional supporting line, and a switch on the right.
 *
 * Six places had drawn this by hand: community permissions, profile
 * notifications, the community rules toggle, the acknowledgement gate, the
 * group composer and two event wizard steps. Each re-derived its own font
 * sizes, row padding and text colours, which is how three different label
 * sizes ended up in the same layout.
 *
 * WHY THE SWITCH CARRIES NO `accessibilityLabel`: React Native's Switch
 * surfaces on iOS as an UNLABELLED element of type CheckBox, and
 * `apps/mobile/e2e/suites/11-community-admin.e2e.ts` selects the permission
 * toggles positionally because of it (`{ type: 'CheckBox', nth: 2 }`). Naming
 * the control here would be the right accessibility change and it would move
 * those indices, so it belongs in a change that can run the suite — not in a
 * refactor that must leave behaviour identical. `testID` is set instead, which
 * becomes an identifier rather than a name and moves nothing.
 */
import { StyleSheet, Switch, View, type ViewStyle } from 'react-native';

import { space } from '../../theme';
import { Text } from './Text';

export type SwitchRowProps = {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  /** LAYOUT only — margins and alignment. */
  style?: ViewStyle;
  testID?: string;
};

export function SwitchRow({
  label,
  description,
  value,
  onValueChange,
  disabled = false,
  style,
  testID,
}: SwitchRowProps) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.text}>
        <Text variant="label">{label}</Text>
        {description ? (
          <Text variant="hint" tone="muted" style={styles.description}>
            {description}
          </Text>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} disabled={disabled} testID={testID} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  text: { flex: 1 },
  description: { marginTop: space[1] },
});
