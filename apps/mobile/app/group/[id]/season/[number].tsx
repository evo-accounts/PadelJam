/**
 * One closed season (UX-GRP-14): its final ranking and the events it held. Reached from a card in
 * the group page's Past seasons, from the season-ended notice, and — with `?ended=1` — straight
 * after an admin resets the ranking, when it opens as the completion screen: a closing message
 * above the same final leaderboard, and "Share".
 *
 * A player who left before the season closed is still in its standings, in greyscale: the
 * standings record who played, not who is in the group now (UX-GRP-15).
 */
import { useGroup, useGroupEvents, useGroupRanking, useGroupSeasons } from '@padel/api';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventCard } from '@/components/event/EventCard';
import { RankingList } from '@/components/group/RankingList';
import { groupDeepLink } from '@/lib/groupShare';
import { useGoBack } from '@/lib/useGoBack';
import { colors, radius, space } from '../../../../theme';
import { Button, EmptyState, emptyIcon, Text, TopBar } from '../../../../components/ui';

export default function GroupSeasonScreen() {
  const { t, i18n } = useT('group');
  const router = useRouter();
  const goBack = useGoBack();
  const { id, number, ended } = useLocalSearchParams<{ id: string; number: string; ended?: string }>();
  const n = Number(number);
  const { data: group } = useGroup(id);
  const { data: seasons } = useGroupSeasons(id);
  const { data: events } = useGroupEvents(id);
  const season = (seasons ?? []).find((s) => s.season_number === n);
  const { data: ranking } = useGroupRanking(season?.id ?? '');
  const isCompletion = ended === '1';

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });
  const from = season ? new Date(season.started_at).getTime() : 0;
  const to = season?.ended_at ? new Date(season.ended_at).getTime() : Number.POSITIVE_INFINITY;
  const seasonEvents = (events ?? [])
    .filter((e) => {
      const at = new Date(e.starts_at).getTime();
      return at >= from && at <= to && e.status !== 'cancelled';
    })
    .reverse();

  const onShare = () => {
    const lines = (ranking ?? []).slice(0, 10).map((r) => `${r.rank}. ${r.name ?? '—'} — ${r.points}`);
    void Share.share({
      message: [
        `${group?.name ?? ''} · ${t('seasonFinalTitle', { number: n })}`,
        ...lines,
        groupDeepLink(id),
      ].join('\n'),
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <TopBar onBack={goBack} backLabel={t('back')} title={t('seasonTag', { number: n })} />
      <ScrollView contentContainerStyle={styles.content}>
        {isCompletion ? (
          <View style={styles.closing} testID="season-completion">
            <Text variant="heading">{t('seasonClosedTitle', { number: n })}</Text>
            <Text variant="body" tone="muted">
              {t('seasonClosedBody', { next: n + 1 })}
            </Text>
          </View>
        ) : null}
        {season?.ended_at ? (
          <Text variant="hint" tone="muted">
            {t('seasonPeriod', { from: fmt(season.started_at), to: fmt(season.ended_at) })}
          </Text>
        ) : null}

        <Text variant="sectionTitle" accessibilityRole="header">
          {t('finalRankingTitle')}
        </Text>
        {(ranking ?? []).length === 0 ? (
          <EmptyState icon={emptyIcon('trophy')} title={t('seasonNoRanking')} testID="empty-season-ranking" />
        ) : (
          <RankingList rows={ranking ?? []} variant="full" onPressRow={(u) => router.push(`/profile/${u}` as Href)} />
        )}

        <Text variant="sectionTitle" accessibilityRole="header" style={styles.eventsTitle}>
          {t('eventsTitle')}
        </Text>
        {seasonEvents.length === 0 ? (
          <EmptyState icon={emptyIcon('calendar')} title={t('seasonNoEvents')} testID="empty-season-events" />
        ) : (
          <View style={styles.events}>
            {seasonEvents.map((e) => (
              <EventCard key={e.id} event={e} onPress={() => router.push(`/event/${e.id}` as Href)} />
            ))}
          </View>
        )}
      </ScrollView>
      {(ranking ?? []).length > 0 ? (
        <View style={styles.footer}>
          <Button label={t('shareCta')} fullWidth variant={isCompletion ? 'primary' : 'secondary'} onPress={onShare} testID="season-share" />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: space[4], gap: space[3] },
  closing: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space[4], gap: space[2] },
  eventsTitle: { marginTop: space[3] },
  events: { gap: space[2] },
  footer: {
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
