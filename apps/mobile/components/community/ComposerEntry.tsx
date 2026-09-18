/**
 * The composer entry that sits at the top of the Posts tab (UX-COMM-10).
 *
 * It replaces a floating action button, and the audit is specific about why the
 * replacement is not simply a button in a different place: it is "styled as an
 * input rather than a button". A FAB says "there is an action here"; a row that
 * looks like the field you are about to type in says what the action produces.
 * It is also "always visible even with no posts", so it is a list HEADER rather
 * than part of the empty state — the one thing you can do with an empty feed
 * should not be hidden inside the message telling you it is empty.
 *
 * It only LOOKS like an input. Tapping opens the full composer screen, so this
 * is a button as far as assistive tech is concerned — announcing it as a text
 * field would promise an edit that never happens here.
 */
import { useT } from '@padel/i18n';
import { Pressable, StyleSheet, View } from 'react-native';

import { avatarUrl } from '@/lib/community-images';
import { Avatar, Text } from '../ui';
import { colors, radius, space } from '../../theme';

export function ComposerEntry({
  avatarPath,
  name,
  onPress,
}: {
  avatarPath: string | null | undefined;
  name: string | null | undefined;
  onPress: () => void;
}) {
  const { t } = useT('community');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('composerPrompt')}
      onPress={onPress}
      testID="community-composer-entry"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Avatar uri={avatarUrl(avatarPath)} name={name} size="sm" decorative />
      {/* The fake field. `pointerEvents` is irrelevant — it is a Text, not an
          input — but the border and muted placeholder are what make the promise. */}
      <View style={styles.field}>
        <Text variant="body" tone="muted" numberOfLines={1}>
          {t('composerPrompt')}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: { opacity: 0.6 },
  field: {
    flex: 1,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: space[4],
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
});
