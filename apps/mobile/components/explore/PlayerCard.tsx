import { StyleSheet, Text, View } from 'react-native';

type Player = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  dominant_hand: string | null;
  court_side: string | null;
};

/** Tap is intentionally a no-op until the Profile module + player-profile screen land. */
export function PlayerCard({ player }: { player: Player }) {
  const initials = player.full_name
    .split(' ')
    .map((p) => p.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <View style={styles.card} accessibilityLabel={player.full_name}>
      <View style={styles.avatar}>
        <Text style={styles.initials}>{initials}</Text>
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {player.full_name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 110, alignItems: 'center', gap: 8, paddingVertical: 8 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#E6F0FF', alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 20, fontWeight: '700', color: '#0B7BFF' },
  name: { fontSize: 13, fontWeight: '600', color: '#0B1F3A', textAlign: 'center' },
});
