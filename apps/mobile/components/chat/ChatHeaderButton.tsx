import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';

import { useStreamUnread } from '@/components/chat/useStreamUnread';
import { colors } from '../../theme';

/**
 * The chat glyph + unread dot, with no `Pressable` of its own — meant to be
 * passed as `TopBar.actions[].icon`, which wraps it in its own pressable
 * `IconButton`.
 */
export function ChatHeaderButtonIcon() {
  const unread = useStreamUnread();
  return (
    <View style={styles.wrap}>
      <SymbolView name={{ ios: 'bubble.left.and.bubble.right.fill', android: 'chat', web: 'chat' }} size={22} tintColor={colors.foreground} />
      {unread > 0 ? <View style={styles.dot} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 4 },
  dot: { position: 'absolute', top: 2, right: 2, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.destructive, borderWidth: 1.5, borderColor: colors.border },
});
