import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { Stack, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChannelList } from 'stream-chat-expo';
import type { Channel } from 'stream-chat';

export default function ChatListScreen() {
  const { t } = useT('chat');
  const router = useRouter();
  const uid = useSession().session?.user.id;

  if (!uid) return null;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t('title'),
          headerRight: () => (
            <Pressable onPress={() => router.push('/chat/new' as never)} accessibilityRole="button" hitSlop={12}>
              <Text style={styles.new}>{t('newChat')}</Text>
            </Pressable>
          ),
        }}
      />
      <ChannelList
        filters={{ members: { $in: [uid] } }}
        sort={{ last_message_at: -1 }}
        onSelect={(channel: Channel) => router.push(('/chat/' + channel.cid) as never)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  new: { color: '#0B7BFF', fontWeight: '700', fontSize: 15, paddingHorizontal: 8 },
});
