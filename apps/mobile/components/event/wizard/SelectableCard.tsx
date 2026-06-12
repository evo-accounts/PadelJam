import { Pressable, StyleSheet, Text, View } from 'react-native';

export function SelectableCard({
  title,
  description,
  selected,
  onPress,
  disabled,
}: {
  title: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.card, selected && styles.cardSelected, disabled && styles.cardDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
    >
      <View style={styles.text}>
        <Text style={[styles.title, selected && styles.titleSelected]}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#E6EAF0',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#fff',
  },
  cardSelected: { borderColor: '#0B7BFF', backgroundColor: '#EAF3FF' },
  cardDisabled: { opacity: 0.5 },
  text: { flex: 1 },
  title: { fontSize: 16, fontWeight: '700', color: '#0B1F3A' },
  titleSelected: { color: '#0B7BFF' },
  description: { fontSize: 13, color: '#6B7685', marginTop: 4 },
});
