import {
  useClearAll,
  useCompleteNotificationCta,
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  usePartnerRequestSummary,
  type NotificationRow,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { notificationRoute } from '@padel/utils';
import { FlashList } from '@shopify/flash-list';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, palette } from '../../theme';

const CTA_TYPES = ['event_invite', 'group_invite', 'community_invite'];

function targetHref(n: NotificationRow): string | null {
  return notificationRoute(n);
}

export default function NotificationsScreen() {
  const { t } = useT('notifications');
  const router = useRouter();
  const list = useNotifications();
  const summary = usePartnerRequestSummary();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const clearAll = useClearAll();
  const completeCta = useCompleteNotificationCta();
  const [menuOpen, setMenuOpen] = useState(false);

  const rows = list.data?.pages.flat() ?? [];
  const pending = summary.data ?? 0;

  const onRowPress = (n: NotificationRow) => {
    if (!n.read_at) markRead.mutate(n.id);
    const href = targetHref(n);
    if (href) router.push(href as never);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: t('title'),
          headerRight: () => (
            <Pressable onPress={() => setMenuOpen(true)} accessibilityRole="button" hitSlop={12}>
              <Text style={styles.menuDots}>•••</Text>
            </Pressable>
          ),
        }}
      />

      {pending > 0 && (
        <Pressable
          style={styles.pinned}
          onPress={() => router.push('/notifications/partner-requests' as never)}
          accessibilityRole="button"
        >
          <Text style={styles.pinnedLabel}>{t('partnerRequests')}</Text>
          <Text style={styles.pinnedCount}>{t('pendingCount', { count: pending })}</Text>
        </Pressable>
      )}

      {list.isLoading ? (
        <ActivityIndicator color={colors.foreground} style={{ marginTop: 32 }} />
      ) : list.isError ? (
        <Text style={styles.empty}>{t('loadError')}</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>{t('empty')}</Text>
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(n) => n.id}
          onEndReached={() => list.hasNextPage && list.fetchNextPage()}
          renderItem={({ item }) => (
            <Pressable
              style={[styles.row, !item.read_at && styles.rowUnread]}
              onPress={() => onRowPress(item)}
              accessibilityRole="button"
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowText}>
                  {t(item.type, { actor: item.actor_name ?? '', entity: item.entity_name ?? '' })}
                </Text>
              </View>
              {CTA_TYPES.includes(item.type) ? (
                item.cta_done ? (
                  <Text style={styles.joined}>{t('joined')}</Text>
                ) : (
                  <Pressable
                    style={styles.joinBtn}
                    onPress={() => completeCta.mutate(item)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.joinText}>{t('join')}</Text>
                  </Pressable>
                )
              ) : null}
            </Pressable>
          )}
        />
      )}

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.sheet}>
            <Pressable
              style={styles.sheetRow}
              onPress={() => {
                markAllRead.mutate();
                setMenuOpen(false);
              }}
              accessibilityRole="button"
            >
              <Text style={styles.sheetText}>{t('markAllRead')}</Text>
            </Pressable>
            <Pressable
              style={styles.sheetRow}
              onPress={() => {
                clearAll.mutate();
                setMenuOpen(false);
              }}
              accessibilityRole="button"
            >
              <Text style={[styles.sheetText, { color: colors.destructive }]}>{t('clearAll')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  menuDots: { fontSize: 18, color: colors.foreground, paddingHorizontal: 8, fontWeight: '700' },
  pinned: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.card, margin: 12, borderRadius: 12, padding: 16,
  },
  pinnedLabel: { fontSize: 15, fontWeight: '700', color: colors.foreground },
  pinnedCount: { fontSize: 14, color: colors.primary, fontWeight: '600' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.card, marginHorizontal: 12, marginBottom: 6, borderRadius: 12, padding: 14,
  },
  rowUnread: { backgroundColor: palette.purple[100] },
  rowText: { fontSize: 14, color: colors.foreground },
  joinBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  joinText: { color: colors.card, fontWeight: '700', fontSize: 13 },
  joined: { color: colors.mutedForeground, fontWeight: '700', fontSize: 13 },
  empty: { textAlign: 'center', marginTop: 48, color: colors.mutedForeground, fontSize: 15 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'flex-start', alignItems: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderRadius: 12, margin: 12, marginTop: 48, minWidth: 200, overflow: 'hidden' },
  sheetRow: { paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.muted },
  sheetText: { fontSize: 15, color: colors.foreground, fontWeight: '600' },
});
