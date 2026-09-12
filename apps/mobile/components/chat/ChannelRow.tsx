import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Channel as ChannelType } from 'stream-chat';

import { streamClient } from '@/lib/streamClient';
import { useT } from '@padel/i18n';

import { useChannelPreview } from './useChannelPreview';
import { Avatar, Badge, IconButton, Text, useActionSheet, useBanner } from '../ui';
import { colors } from '../../theme';

type Tab = 'active' | 'archived';

function channelTitle(channel: ChannelType): string {
  const name = (channel.data as { name?: string } | undefined)?.name;
  if (name) return name;
  return (
    Object.values(channel.state.members)
      .map((m) => m.user?.name)
      .filter((n): n is string => !!n && n !== streamClient.user?.name)
      .join(', ') || 'Chat'
  );
}

export function ChannelRow({ channel, tab }: { channel: ChannelType; tab: Tab }) {
  const { t } = useT('chat');
  const router = useRouter();
  const show = useActionSheet();
  const banner = useBanner();

  const isDirect = channel.type === 'messaging';
  const { lastMessage, unread } = useChannelPreview(channel);
  const image = (channel.data as { image?: string } | undefined)?.image;

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch {
      banner.show(t('actionFailed'));
    }
  };

  const onMenu = async () => {
    const key = await show({
      actions:
        tab === 'archived'
          ? [{ key: 'unarchive', label: t('unarchive') }]
          : [
              { key: 'archive', label: t('archive') },
              ...(isDirect
                ? [
                    {
                      key: 'delete',
                      label: t('delete'),
                      destructive: true,
                      confirm: { title: t('deleteTitle'), body: t('deleteBody'), confirmLabel: t('delete') },
                    },
                  ]
                : []),
            ],
    });
    if (key === 'unarchive') void run(() => channel.unarchive());
    if (key === 'archive') void run(() => channel.archive());
    if (key === 'delete') void run(() => channel.hide(null, true));
  };

  return (
    <View style={styles.row}>
      {/* Deliberately NOT a ListRow, despite being exactly its shape.
          The kebab is a SIBLING action, and ListRow sets an accessibilityLabel,
          which makes the row one accessibility element — a touchable placed in
          its trailing slot would be unreachable. ListRow does not model
          "tappable row PLUS a separate button", so forcing it here would trade a
          real a11y regression for a slightly shorter file.
          The row's INNARDS still become primitives, which is where the
          duplicated style keys actually were. */}
      <Pressable style={styles.main} onPress={() => router.push(('/chat/' + channel.cid) as never)} accessibilityRole="button">
        <Avatar uri={image} name={channelTitle(channel)} size="md" />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" numberOfLines={1}>{channelTitle(channel)}</Text>
          {lastMessage ? (
            <Text variant="caption" tone="muted" numberOfLines={1} style={styles.preview}>
              {lastMessage}
            </Text>
          ) : null}
        </View>
        {unread > 0 ? <Badge label={String(unread)} tone="primary" /> : null}
      </Pressable>
      <IconButton icon="•••" accessibilityLabel={t('more')} onPress={onMenu} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.muted },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  preview: { marginTop: 2 },
});
