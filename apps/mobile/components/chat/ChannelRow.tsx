import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Channel as ChannelType } from 'stream-chat';

import { streamClient } from '@/lib/streamClient';
import { useT } from '@padel/i18n';

import { useChannelPreview } from './useChannelPreview';
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
      <Pressable style={styles.main} onPress={() => router.push(('/chat/' + channel.cid) as never)} accessibilityRole="button">
        <Image source={image ? { uri: image } : undefined} style={styles.avatar} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{channelTitle(channel)}</Text>
          {lastMessage ? <Text style={styles.preview} numberOfLines={1}>{lastMessage}</Text> : null}
        </View>
        {unread > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{unread}</Text></View> : null}
      </Pressable>
      <Pressable
        onPress={() => setMenuOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('more')}
        hitSlop={10}
        style={styles.kebab}
      >
        <Text style={styles.kebabDots}>•••</Text>
      </Pressable>

      {/* action sheet */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.sheet}>
            {tab === 'archived' ? (
              <Pressable style={styles.sheetRow} onPress={() => run(() => channel.unarchive())} accessibilityRole="button">
                <Text style={styles.sheetText}>{t('unarchive')}</Text>
              </Pressable>
            ) : (
              <>
                <Pressable style={styles.sheetRow} onPress={() => { setMenuOpen(false); setConfirm('archive'); }} accessibilityRole="button">
                  <Text style={styles.sheetText}>{t('archive')}</Text>
                </Pressable>
                {isDirect ? (
                  <Pressable style={styles.sheetRow} onPress={() => { setMenuOpen(false); setConfirm('delete'); }} accessibilityRole="button">
                    <Text style={[styles.sheetText, { color: colors.destructive }]}>{t('delete')}</Text>
                  </Pressable>
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
            <Text style={styles.confirmTitle}>{t(confirm === 'archive' ? 'archiveTitle' : 'deleteTitle')}</Text>
            <Text style={styles.confirmBody}>{t(confirm === 'archive' ? 'archiveBody' : 'deleteBody')}</Text>
            <View style={styles.confirmActions}>
              <Pressable onPress={() => setConfirm(null)} accessibilityRole="button"><Text style={styles.cancel}>{t('cancel')}</Text></Pressable>
              <Pressable
                onPress={() => run(() => (confirm === 'archive' ? channel.archive() : channel.hide(null, true)))}
                accessibilityRole="button"
              >
                <Text style={[styles.confirmCta, confirm === 'delete' && { color: colors.destructive }]}>
                  {t(confirm === 'archive' ? 'archive' : 'delete')}
                </Text>
              </Pressable>
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
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.muted },
  title: { fontSize: 15, fontWeight: '700', color: colors.foreground },
  preview: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { color: colors.card, fontSize: 11, fontWeight: '700' },
  kebab: { paddingHorizontal: 8, paddingVertical: 8 },
  kebabDots: { fontSize: 16, color: colors.mutedForeground, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center' },
  sheet: { backgroundColor: colors.card, borderRadius: 12, minWidth: 220, overflow: 'hidden' },
  sheetRow: { paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.muted },
  sheetText: { fontSize: 15, color: colors.foreground, fontWeight: '600' },
  confirm: { backgroundColor: colors.card, borderRadius: 14, padding: 20, marginHorizontal: 32, gap: 8 },
  confirmTitle: { fontSize: 16, fontWeight: '700', color: colors.foreground },
  confirmBody: { fontSize: 14, color: colors.mutedForeground },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24, marginTop: 12 },
  cancel: { fontSize: 15, color: colors.mutedForeground, fontWeight: '600' },
  confirmCta: { fontSize: 15, color: colors.primary, fontWeight: '700' },
});
