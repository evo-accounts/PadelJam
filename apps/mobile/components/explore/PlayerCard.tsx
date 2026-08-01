import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, palette } from '../../theme';

type Player = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  dominant_hand: string | null;
  court_side: string | null;
};

export function PlayerCard({ player, onPress }: { player: Player; onPress?: () => void }) {
  const initials = player.full_name
    .split(' ')
    .map((p) => p.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <Pressable style={styles.card} onPress={onPress} accessibilityRole="button" accessibilityLabel={player.full_name}>
      <View style={styles.avatar}>
        <Text style={styles.initials}>{initials}</Text>
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {player.full_name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 110, alignItems: 'center', gap: 8, paddingVertical: 8 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: palette.purple[100], alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 20, fontWeight: '700', color: colors.primary },
  name: { fontSize: 13, fontWeight: '600', color: colors.foreground, textAlign: 'center' },
});
