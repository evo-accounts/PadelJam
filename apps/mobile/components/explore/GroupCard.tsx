import { Pressable, StyleSheet, Text, View } from 'react-native';

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
  card: { width: 160, backgroundColor: '#fff', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: '#E6EAF0', padding: 12, gap: 6 },
  thumb: { height: 72, borderRadius: 10, backgroundColor: '#F0F3F8' },
  name: { fontSize: 15, fontWeight: '700', color: '#0B1F3A' },
});
