import { useUnreadCount } from '@padel/api';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { IconButton } from './ui';

export function NotificationBell() {
  const router = useRouter();
  const unread = useUnreadCount();
  const hasUnread = (unread.data ?? 0) > 0;
  return (
    <IconButton
      onPress={() => router.push('/notifications' as never)}
      // Deliberately still a hardcoded English string. It is the last
      // untranslated a11y label in the header, but `notifications` lives in the
      // PROFILE namespace and this is a shared component — and suite 13 taps the
      // bell by this exact name. Both are decisions separate from this one.
      accessibilityLabel="Notifications"
      icon={
        <>
          <SymbolView
            name={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }}
            size={24}
            tintColor={colors.foreground}
          />
          {hasUnread ? <View style={styles.dot} /> : null}
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  // Offsets are 6, not the old 2: the hand-rolled wrapper was a 32pt box (24pt
  // symbol + 4pt padding) and IconButton's `md` is 36pt, so the corner moved out
  // 2pt on each axis. This keeps the dot the same distance from the glyph.
  dot: {
    position: 'absolute', top: 6, right: 6, width: 10, height: 10,
    borderRadius: 5, backgroundColor: colors.destructive, borderWidth: 1.5, borderColor: colors.border,
  },
});
