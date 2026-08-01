/**
 * EmptyState — "there is nothing here yet", with a way out.
 *
 * `empty:` appears 26 times. This generalises
 * `apps/mobile/components/community/EmptyState.tsx`, which is the most complete
 * of them; that file keeps its community-specific rail and composes this for the
 * generic part when it migrates.
 *
 * `action` is optional but strongly encouraged: an empty screen with no next
 * step is a dead end, and 26 of them is 26 places a user can get stuck.
 */
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { space } from '../../theme';
import { Button, type ButtonVariant } from './Button';
import { Text } from './Text';

type Props = {
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void; variant?: ButtonVariant };
  style?: ViewStyle;
  testID?: string;
};

export function EmptyState({ title, body, action, style, testID }: Props) {
  return (
    <View testID={testID} style={[styles.container, style]}>
      <Text variant="sectionTitle" tone="default" style={styles.title}>
        {title}
      </Text>

      {body ? (
        <Text variant="body" tone="muted" style={styles.body}>
          {body}
        </Text>
      ) : null}

      {action ? (
        <Button
          label={action.label}
          onPress={action.onPress}
          variant={action.variant ?? 'primary'}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[6],
    paddingVertical: space[10],
  },
  title: { textAlign: 'center' },
  body: { textAlign: 'center', marginTop: space[2], marginBottom: space[5] },
});
