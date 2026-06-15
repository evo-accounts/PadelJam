import { useUnreadCount } from '@padel/api';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

export function NotificationBell() {
  const router = useRouter();
  const unread = useUnreadCount();
  const hasUnread = (unread.data ?? 0) > 0;
  return (
    <Pressable
      onPress={() => router.push('/notifications' as never)}
      accessibilityRole="button"
      accessibilityLabel="Notifications"
      hitSlop={12}
      style={styles.wrap}
    >
      <SymbolView
        name={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }}
        size={24}
        tintColor="#0B1F3A"
      />
      {hasUnread ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 4 },
  dot: {
    position: 'absolute', top: 2, right: 2, width: 10, height: 10,
    borderRadius: 5, backgroundColor: '#D7263D', borderWidth: 1.5, borderColor: '#F7F9FC',
  },
});
