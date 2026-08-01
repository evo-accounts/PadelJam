import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { useStreamUnread } from '@/components/chat/useStreamUnread';
import { colors } from '../../theme';

export function ChatHeaderButton() {
  const router = useRouter();
  const unread = useStreamUnread();
  return (
    <Pressable onPress={() => router.push('/chat' as never)} accessibilityRole="button" accessibilityLabel="Chat" hitSlop={10} style={styles.wrap}>
      <SymbolView name={{ ios: 'bubble.left.and.bubble.right.fill', android: 'chat', web: 'chat' }} size={22} tintColor={colors.foreground} />
      {unread > 0 ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 4 },
  dot: { position: 'absolute', top: 2, right: 2, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.destructive, borderWidth: 1.5, borderColor: colors.border },
});
