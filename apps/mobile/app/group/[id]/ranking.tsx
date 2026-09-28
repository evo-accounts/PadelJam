/**
 * The full ranking of the current season (UX-GRP-06), from "See all" on the group page: position,
 * avatar, name, Points and Events played, sortable, with the period filter that only appears here
 * where there is content to filter (UX-GRP-04). A row opens the player; someone who has left stays
 * ranked, in greyscale. "Share" is fixed at the bottom.
 */
import { useGroup, useGroupRanking, useGroupSeasons } from '@padel/api';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RankingList, sortRanking, type RankingSort } from '@/components/group/RankingList';
import { groupDeepLink } from '@/lib/groupShare';
import { useGoBack } from '@/lib/useGoBack';
import { colors, space } from '../../../theme';
import { Button, Chip, EmptyState, emptyIcon, Segmented, Text, TopBar } from '../../../components/ui';

type Period = 'all' | '3m' | '6m' | '12m';

const monthsAgoIso = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString();
};

export default function GroupRankingScreen() {
  const { t, i18n } = useT('group');
  const router = useRouter();
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: group } = useGroup(id);
  const { data: seasons } = useGroupSeasons(id);
  const season = (seasons ?? []).find((s) => s.ended_at == null);
  const [period, setPeriod] = useState<Period>('all');
  const [sort, setSort] = useState<RankingSort>('points');
  const since = period === 'all' ? undefined : monthsAgoIso(period === '3m' ? 3 : period === '6m' ? 6 : 12);
  const { data: ranking } = useGroupRanking(season?.id ?? '', since);
  const rows = sortRanking(ranking ?? [], sort);
  const lastUpdated = rows[0]?.lastUpdated;

  const onShare = () => {
    const lines = (ranking ?? []).slice(0, 10).map((r) => `${r.rank}. ${r.name ?? '—'} — ${r.points}`);
    void Share.share({
      message: [`${group?.name ?? ''} · ${t('rankingTitle')}`, ...lines, groupDeepLink(id)].join('\n'),
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <TopBar onBack={goBack} backLabel={t('back')} title={t('rankingTitle')} />
      <ScrollView contentContainerStyle={styles.content}>
        {lastUpdated ? (
          <Text variant="hint" tone="muted">
            {t('lastUpdate', {
              date: new Date(lastUpdated).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }),
            })}
          </Text>
        ) : null}
        {(ranking ?? []).length > 0 || period !== 'all' ? (
          <>
            <View style={styles.periods}>
              {(['all', '3m', '6m', '12m'] as const).map((p) => (
                <Chip
                  key={p}
                  label={t(p === 'all' ? 'periodAll' : p === '3m' ? 'period3m' : p === '6m' ? 'period6m' : 'period12m')}
                  selected={period === p}
                  onPress={() => setPeriod(p)}
                />
              ))}
            </View>
            <Segmented
              options={[
                { value: 'points', label: t('sortPoints') },
                { value: 'events', label: t('sortEvents') },
              ]}
              value={sort === 'wins' ? 'points' : sort}
              onChange={setSort}
            />
          </>
        ) : null}
        {rows.length === 0 ? (
          <EmptyState icon={emptyIcon('trophy')} title={t('rankingEmptyTitle')} body={t('rankingPlaceholder')} testID="empty-ranking" />
        ) : (
          <RankingList rows={rows} variant="full" onPressRow={(userId) => router.push(`/profile/${userId}` as Href)} />
        )}
      </ScrollView>
      {rows.length > 0 ? (
        <View style={styles.footer}>
          <Button label={t('shareCta')} fullWidth variant="secondary" onPress={onShare} testID="ranking-share" />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: space[4], gap: space[3] },
  periods: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  footer: {
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
