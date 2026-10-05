import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/native';

import { Avatar } from '@/components/ui';
import { colors, palette } from '../../theme';
import { avatarUrl } from '@/lib/community-images';

type Player = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  dominant_hand: string | null;
  court_side: string | null;
};

/**
 * A tappable player card: avatar and name. Presentational — the caller
 * supplies the row and an onPress.
 *
 * Two arrangements of the same content (UX-GLOB-09): `vertical` (the
 * default, and the only look this card had before) is a fixed-width card for
 * a rail (avatar on top, name below); `horizontal` is a full-width row for a
 * list screen (avatar left, name middle, chevron right). Both now go through
 * the shared `Avatar` primitive instead of a hand-rolled initials circle —
 * that circle never rendered `avatar_url` at all.
 *
 * The avatar is `decorative` in both arrangements: the name is always
 * rendered right next to it, so the avatar does not need its own accessible
 * label too (see the prop's doc comment on `Avatar`).
 *
 * `action` (UX-EXPL-02: Follow) sits BESIDE the tappable body, never inside it:
 * an accessible Pressable swallows its children on iOS, so a button nested in
 * the card would be unreachable to VoiceOver and to the E2E driver. With an
 * action the card is a plain View holding two siblings — the body that opens
 * the profile and the action — and without one it is the Pressable it always was.
 */
export function PlayerCard({
  player,
  onPress,
  orientation = 'vertical',
  railWidth = 140,
  action,
}: {
  player: Player;
  onPress?: () => void;
  /** An inline action (Follow) rendered beside the tappable body. */
  action?: React.ReactNode;
  orientation?: 'vertical' | 'horizontal';
  railWidth?: number;
}) {
  if (orientation === 'horizontal') {
    const body = (
      <>
        <Avatar uri={avatarUrl(player.avatar_url)} name={player.full_name} colourKey={player.id} size="md" decorative />
        <Text style={styles.nameHorizontal} numberOfLines={1}>
          {player.full_name}
        </Text>
      </>
    );
    if (action) {
      return (
        <View style={styles.cardHorizontal}>
          <Pressable
            style={styles.bodyHorizontal}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={player.full_name}
            testID={`player-card-${player.id}`}
          >
            {body}
          </Pressable>
          {action}
        </View>
      );
    }
    return (
      <Pressable
        style={styles.cardHorizontal}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={player.full_name}
        testID={`player-card-${player.id}`}
      >
        {body}
        <Text style={styles.chevron} accessibilityElementsHidden importantForAccessibility="no">
          ›
        </Text>
      </Pressable>
    );
  }

  const body = (
    <>
      <Avatar uri={avatarUrl(player.avatar_url)} name={player.full_name} colourKey={player.id} size="lg" decorative />
      <Text style={styles.name} numberOfLines={1}>
        {player.full_name}
      </Text>
    </>
  );
  if (action) {
    return (
      <View style={[styles.card, { width: railWidth }]}>
        <Pressable
          style={styles.bodyVertical}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={player.full_name}
          testID={`player-card-${player.id}`}
        >
          {body}
        </Pressable>
        {action}
      </View>
    );
  }
  return (
    <Pressable
      style={[styles.card, { width: railWidth }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={player.full_name}
      testID={`player-card-${player.id}`}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  bodyVertical: { alignItems: 'center', gap: 8, alignSelf: 'stretch' },
  bodyHorizontal: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardHorizontal: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 12,
    gap: 12,
  },
  name: { fontSize: 13, fontWeight: '600', color: colors.foreground, textAlign: 'center' },
  nameHorizontal: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.foreground },
  chevron: { fontSize: 24, color: palette.slate[400], marginLeft: 4 },
});
