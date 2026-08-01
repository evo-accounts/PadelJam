import { useT } from '@padel/i18n';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import type { Channel as ChannelType } from 'stream-chat';
// NOTE (reconciled against stream-chat-expo 9.3.1): the input component is MessageComposer,
// not MessageInput (MessageInput is not exported in 9.x).
import { Channel, MessageComposer, MessageList } from 'stream-chat-expo';

import { streamClient } from '@/lib/streamClient';
import { colors } from '../../../theme';

export default function ConversationScreen() {
  const { t } = useT('chat');
  const { cid } = useLocalSearchParams<{ cid: string }>();
  const router = useRouter();
  const [channel, setChannel] = useState<ChannelType | null>(null);

  useEffect(() => {
    if (!cid) return;
    let cancelled = false;
    // cid is "<type>:<id>" — resolve and watch it.
    const [type, id] = cid.split(':');
    if (!type || !id) return;
    const ch = streamClient.channel(type, id);
    ch.watch()
      .then(() => {
        if (!cancelled) setChannel(ch);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cid]);

  if (!channel) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}>
        <ActivityIndicator color={colors.foreground} />
      </View>
    );
  }

  const title =
    ((channel.data as { name?: string } | undefined)?.name ??
      Object.values(channel.state.members)
        .map((m) => m.user?.name)
        .filter((n) => n && n !== streamClient.user?.name)
        .join(', ')) ||
    t('title');

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <Pressable onPress={() => router.push(('/chat/' + cid + '/details') as never)} accessibilityRole="button">
              <Text style={{ fontSize: 17, fontWeight: '700', color: colors.foreground }}>{title}</Text>
            </Pressable>
          ),
        }}
      />
      <Channel channel={channel}>
        <MessageList />
        <MessageComposer />
      </Channel>
    </View>
  );
}
