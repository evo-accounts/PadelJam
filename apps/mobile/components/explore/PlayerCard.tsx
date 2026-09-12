import { Pressable, StyleSheet, Text } from 'react-native';

import { avatarUrl } from '@/lib/community-images';
import { colors } from '../../theme';
import { Avatar } from '../ui';

type Player = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  dominant_hand: string | null;
  court_side: string | null;
};

export function PlayerCard({ player, onPress }: { player: Player; onPress?: () => void }) {
  return (
    <Pressable style={styles.card} onPress={onPress} accessibilityRole="button" accessibilityLabel={player.full_name}>
      <Avatar uri={avatarUrl(player.avatar_url)} name={player.full_name} colourKey={player.id} size="lg" />
      <Text style={styles.name} numberOfLines={1}>
        {player.full_name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 110, alignItems: 'center', gap: 8, paddingVertical: 8 },
  name: { fontSize: 13, fontWeight: '600', color: colors.foreground, textAlign: 'center' },
});
