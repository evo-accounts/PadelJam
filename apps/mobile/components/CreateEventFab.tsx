import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function CreateEventFab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      style={[styles.fab, { bottom: insets.bottom + 24 }]}
      onPress={() => router.push('/event/create')}
      accessibilityRole="button"
      accessibilityLabel="Create event">
      <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} tintColor="#fff" size={28} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0B7BFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
