import { useT } from '@padel/i18n';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { Channel as ChannelType } from 'stream-chat';
// NOTE (reconciled against stream-chat-expo 9.3.1): the input component is MessageComposer,
// not MessageInput (MessageInput is not exported in 9.x).
import { Channel, MessageComposer, MessageList } from 'stream-chat-expo';

import { streamClient } from '@/lib/streamClient';

export default function ConversationScreen() {
  const { t } = useT('chat');
  const { cid } = useLocalSearchParams<{ cid: string }>();
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator color="#0B1F3A" />
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
      <Stack.Screen options={{ title }} />
      <Channel channel={channel}>
        <MessageList />
        <MessageComposer />
      </Channel>
    </View>
  );
}
