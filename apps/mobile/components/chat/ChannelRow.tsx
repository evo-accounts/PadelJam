import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View } from 'react-native';
import type { Channel as ChannelType } from 'stream-chat';

import { streamClient } from '@/lib/streamClient';
import { useT } from '@padel/i18n';

import { useChannelPreview } from './useChannelPreview';
import { Avatar, Badge, Button, IconButton, ListRow, Text } from '../ui';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | 'archive' | 'delete'>(null);

  const isDirect = channel.type === 'messaging';
  const { lastMessage, unread } = useChannelPreview(channel);
  const image = (channel.data as { image?: string } | undefined)?.image;

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch {
      Alert.alert(t('actionFailed'));
    } finally {
      setConfirm(null);
      setMenuOpen(false);
    }
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
      <IconButton icon="•••" accessibilityLabel={t('more')} onPress={() => setMenuOpen(true)} />

      {/* action sheet */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.sheet}>
            {/* Action-sheet rows ARE ListRow's shape exactly: a tappable row,
                one label, no nested control. `titleTone` replaces the inline
                colour override the delete row used to carry. */}
            {tab === 'archived' ? (
              <ListRow title={t('unarchive')} onPress={() => run(() => channel.unarchive())} />
            ) : (
              <>
                <ListRow
                  title={t('archive')}
                  onPress={() => {
                    setMenuOpen(false);
                    setConfirm('archive');
                  }}
                />
                {isDirect ? (
                  <ListRow
                    title={t('delete')}
                    titleTone="destructive"
                    onPress={() => {
                      setMenuOpen(false);
                      setConfirm('delete');
                    }}
                  />
                ) : null}
              </>
            )}
          </View>
        </Pressable>
      </Modal>

      {/* confirmation modals */}
      <Modal visible={confirm !== null} transparent animationType="fade" onRequestClose={() => setConfirm(null)}>
        <Pressable style={styles.backdrop} onPress={() => setConfirm(null)}>
          <View style={styles.confirm}>
            <Text variant="sectionTitle">
              {t(confirm === 'archive' ? 'archiveTitle' : 'deleteTitle')}
            </Text>
            <Text variant="body" tone="muted">
              {t(confirm === 'archive' ? 'archiveBody' : 'deleteBody')}
            </Text>
            <View style={styles.confirmActions}>
              <Button variant="ghost" label={t('cancel')} onPress={() => setConfirm(null)} />
              {/* The destructive tone was an inline colour override on the label;
                  as a variant it also gets the right pressed and disabled states. */}
              <Button
                variant={confirm === 'delete' ? 'destructive' : 'primary'}
                label={t(confirm === 'archive' ? 'archive' : 'delete')}
                onPress={() => run(() => (confirm === 'archive' ? channel.archive() : channel.hide(null, true)))}
              />
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.muted },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  preview: { marginTop: 2 },
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center' },
  sheet: { backgroundColor: colors.card, borderRadius: 12, minWidth: 220, overflow: 'hidden' },
  confirm: { backgroundColor: colors.card, borderRadius: 14, padding: 20, marginHorizontal: 32, gap: 8 },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 12 },
});
