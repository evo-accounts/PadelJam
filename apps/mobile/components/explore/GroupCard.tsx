import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';

type Group = { id: string; name: string };

export function GroupCard({ group, onOpen }: { group: Group; onOpen: () => void }) {
  return (
    <Pressable style={styles.card} onPress={onOpen} accessibilityRole="button">
      <View style={styles.thumb} />
      <Text style={styles.name} numberOfLines={2}>
        {group.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 160, backgroundColor: colors.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 12, gap: 6 },
  thumb: { height: 72, borderRadius: 10, backgroundColor: colors.muted },
  name: { fontSize: 15, fontWeight: '700', color: colors.foreground },
});
