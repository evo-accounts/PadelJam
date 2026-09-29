/**
 * Activity (UX-MEVT-17, B14) — a full screen reached from the Manage Event dashboard's Activity
 * card. Organizer only. The server writes every entry (decision 15, `_log_activity`); this lists
 * them newest first, each as who (avatar + name, UX-GLOB-04) / what / when.
 *
 * The copy for every action name lives in `components/event/manage/activityLine.ts`, whose test
 * checks each key exists in pt-PT, pt-BR and en. Relative times come from i18n too — the old
 * screen printed "3h ago" in English whatever the language (B14).
 */
import { useEvent, useEventActivity, type ActivityRow } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { activityWhat, relativeWhen } from '@/components/event/manage/activityLine';
import { formatMoney } from '@/components/event/manage/paymentList';
import { avatarUrl } from '@/lib/community-images';
import { useGoBack } from '@/lib/useGoBack';
import { colors, space } from '../../../theme';
import { Avatar, EmptyState, emptyIcon, listEmptyContent, Text, TopBar } from '../../../components/ui';

export default function EventActivityScreen() {
  const { t, i18n } = useT('event');
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useSession().session?.user.id;
  const { data: event, isLoading: loadingEvent } = useEvent(id);
  const isOrganizer = event != null && uid != null && uid === event.organizer_id;
  const { data: rows, isLoading } = useEventActivity(id);

  if (loadingEvent || (isOrganizer && isLoading)) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }
  if (!isOrganizer) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TopBar onBack={goBack} backLabel={t('back')} title={t('activityTitle')} />
        <EmptyState fill title={t('forbidden')} testID="activity-forbidden" />
      </SafeAreaView>
    );
  }

  const money = (n: number) => formatMoney(n, i18n.language);
  const whatOf = (row: ActivityRow) => {
    const what = activityWhat(row, money);
    const groups = what.groups?.map((g) => t(g as never)).join(', ');
    return t(what.key as never, { ...what.params, ...(groups ? { groups } : {}) });
  };
  const whenOf = (iso: string) => {
    const w = relativeWhen(iso);
    if (w.key === 'actAgoDate') {
      const sameYear = w.date.getFullYear() === new Date().getFullYear();
      return w.date.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
    }
    return w.key === 'actAgoNow' ? t('actAgoNow') : t(w.key, { count: w.count });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar onBack={goBack} backLabel={t('back')} title={t('activityTitle')} />
      <FlashList
        data={rows ?? []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ ...styles.list, ...((rows ?? []).length === 0 ? listEmptyContent : null) }}
        ListEmptyComponent={
          <EmptyState fill icon={emptyIcon('clock')} title={t('activityEmpty')} body={t('activityEmptyBody')} testID="empty-activity" />
        }
        renderItem={({ item }) => {
          // No actor: the scheduler or a deleted account wrote it.
          const who = item.profiles?.full_name ?? t('actSystemActor');
          const what = whatOf(item);
          const when = whenOf(item.created_at);
          return (
            // One accessibility element per entry, read as a sentence: "Maria · marked João as paid · 3 minutes ago".
            <View style={styles.row} accessible accessibilityLabel={`${who}, ${what}, ${when}`} testID={`activity-row-${item.action}`}>
              <Avatar
                uri={avatarUrl(item.profiles?.avatar_url)}
                name={who}
                colourKey={item.profiles?.id ?? item.actor_id ?? item.id}
                size="md"
                decorative
              />
              <View style={styles.rowBody}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {who}
                </Text>
                <Text variant="body">{what}</Text>
                <Text variant="caption" tone="muted">
                  {when}
                </Text>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[8] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space[3], paddingVertical: space[3] },
  rowBody: { flex: 1, gap: 2 },
});
