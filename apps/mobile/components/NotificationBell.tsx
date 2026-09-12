import { useUnreadCount } from '@padel/api';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';

/**
 * The bell glyph + unread dot, with no `Pressable` of its own — meant to be
 * passed as `TopBar.actions[].icon`, which wraps it in its own pressable
 * `IconButton`.
 */
export function NotificationBellIcon() {
  const unread = useUnreadCount();
  const hasUnread = (unread.data ?? 0) > 0;
  return (
    <View>
      <SymbolView
        name={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }}
        size={24}
        tintColor={colors.foreground}
      />
      {hasUnread ? <View style={styles.dot} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute', top: 6, right: 6, width: 10, height: 10,
    borderRadius: 5, backgroundColor: colors.destructive, borderWidth: 1.5, borderColor: colors.border,
  },
});
