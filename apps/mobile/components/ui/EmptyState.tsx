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
 *
 * IT IS A CARD, not a bare centred block. It used to be the latter, which is how
 * three treatments ended up in the app: Home hand-rolled a 12px card, chat
 * hand-rolled a 16px one, and only `groups` used this primitive — so the one
 * component meant to make empty states consistent was the odd one out.
 * Composing `Card` puts the surface, border and radius in one place.
 */
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { radius, space } from '../../theme';
import { Button, type ButtonVariant } from './Button';
import { Card } from './Card';
import { emptyIcon } from './emptyIcon';
import { Text } from './Text';

type Props = {
  title: string;
  body?: string;
  /**
   * An illustration or icon above the title. A ReactNode rather than a name, for
   * the same reason IconButton takes one: these are SF Symbols on iOS, and the
   * caller owns size and tint.
   *
   * Decorative by definition — it restates the title — so pass
   * `accessibilityElementsHidden` on whatever you give it rather than having a
   * screen reader announce the picture and then the sentence.
   *
   * Defaults to a warning triangle when `tone="error"` and no icon is given.
   */
  icon?: React.ReactNode;
  action?: { label: string; onPress: () => void; variant?: ButtonVariant };
  style?: ViewStyle;
  testID?: string;
  /**
   * `error` is for a failed fetch, not "nothing here yet": the title reads in
   * `destructive`, and the icon (absent an explicit one) is a warning triangle
   * rather than the generic decorative icon a caller passes for a true empty
   * list. `action` is expected to be a Retry in this tone.
   */
  tone?: 'default' | 'error';
  /**
   * This is the only content of a `FlashList`/`FlatList`'s `ListEmptyComponent`,
   * so it should fill and centre in the space the rows would have occupied
   * rather than hugging the top of the list. Pair with `listEmptyContent` on
   * the list's own `contentContainerStyle` — that gives the scroll view
   * something to stretch, and this centres inside it.
   */
  fill?: boolean;
};

/**
 * `contentContainerStyle` for any `FlashList`/`FlatList` that renders an
 * `EmptyState` (with `fill`) as its `ListEmptyComponent`: without `flexGrow: 1`
 * the container shrinks to the empty content's own height and centring has
 * nothing to centre within.
 */
export const listEmptyContent: ViewStyle = { flexGrow: 1 };

export function EmptyState({ title, body, icon, action, style, testID, tone = 'default', fill }: Props) {
  const resolvedIcon = icon ?? (tone === 'error' ? emptyIcon('exclamationmark.triangle') : undefined);
  return (
    <Card testID={testID} padding="lg" style={StyleSheet.flatten([styles.card, fill && styles.fill, style])}>
      {resolvedIcon ? <View style={styles.icon}>{resolvedIcon}</View> : null}

      <Text variant="sectionTitle" tone={tone === 'error' ? 'destructive' : 'default'} style={styles.title}>
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
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    justifyContent: 'center',
    // 16, the step the UX audit specifies. Overridden here rather than changing
    // Card's own `lg`, so this is the empty-state treatment and not a silent
    // reshaping of every card in the app.
    borderRadius: radius['2xl'],
    marginHorizontal: space[4],
    marginVertical: space[4],
  },
  fill: { flex: 1, justifyContent: 'center' },
  icon: { marginBottom: space[3] },
  title: { textAlign: 'center' },
  body: { textAlign: 'center', marginTop: space[2], marginBottom: space[5] },
});
