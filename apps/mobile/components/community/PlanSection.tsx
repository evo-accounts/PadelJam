import { useCommunityPlan, useSetCommunityPlan } from '@padel/api';
import { PLAN_MATRIX, type LimitKey, type PlanDef } from '@padel/features';
import { useT } from '@padel/i18n';
import type { TFunction } from 'i18next';
import { ActivityIndicator, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { colors, space } from '../../theme';
import { Badge, Button, Card, Text, useBanner, useConfirm } from '../ui';

type Props = {
  communityId: string;
  /**
   * Whether the viewer can act on the plan (upgrade/downgrade) — the community owner. An
   * admin still sees the section (P1: it is no longer an owner-only dead end for the cap
   * errors that route admins here) but gets a read-only hint instead of the action button.
   */
  canAct: boolean;
  /** Reports this section's y position on the manage screen so `?section=plan` can scroll to it. */
  onLayout?: (event: LayoutChangeEvent) => void;
};

const STARTER = PLAN_MATRIX.find((p) => p.id === 'starter') as PlanDef;
const COMMUNITY_PRO = PLAN_MATRIX.find((p) => p.id === 'community_pro') as PlanDef;

const LIMIT_ORDER: readonly LimitKey[] = ['members_per_community', 'groups_per_community', 'recurring_events', 'co_organizers'];
const LIMIT_LABEL_KEYS: Record<LimitKey, string> = {
  members_per_community: 'limitMembers',
  groups_per_community: 'limitGroups',
  recurring_events: 'limitRecurring',
  co_organizers: 'limitCoOrganizers',
};

/**
 * Manage Community's Plan section (UX-GLOB-10): Starter and Community Pro side by side, limits
 * read from the `packages/features` registry, the current one marked with a `Badge`. The owner
 * action upgrades or downgrades on request — no transaction, reversible, refused with
 * `plan_downgrade_over_limit` while the community exceeds Starter's limits.
 */
export function PlanSection({ communityId, canAct, onLayout }: Props) {
  const { t } = useT('community');
  const banner = useBanner();
  const confirm = useConfirm();
  const plan = useCommunityPlan(communityId);
  const setPlan = useSetCommunityPlan();

  const isPro = plan.data === 'community_pro';
  const busy = setPlan.isPending;

  const onError = (e: unknown) => {
    const code = e instanceof Error ? e.message : 'unknown_error';
    if (code === 'plan_downgrade_over_limit') {
      banner.show(t('downgradeOverLimit'));
      return;
    }
    banner.show(t(code, { defaultValue: t('unknown_error') }));
  };

  const upgrade = async () => {
    try {
      await setPlan.mutateAsync({ communityId, plan: 'community_pro' });
      banner.show(t('planActivated'), 'success');
    } catch (e) {
      onError(e);
    }
  };

  const downgrade = async () => {
    const ok = await confirm({
      title: t('returnToStarterTitle'),
      body: t('returnToStarterBody'),
      confirmLabel: t('returnToStarter'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await setPlan.mutateAsync({ communityId, plan: 'starter' });
    } catch (e) {
      onError(e);
    }
  };

  if (plan.isLoading) {
    return (
      <View style={styles.section} onLayout={onLayout}>
        <Text style={styles.sectionTitle}>{t('planSectionTitle')}</Text>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.foreground} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section} onLayout={onLayout}>
      <Text style={styles.sectionTitle}>{t('planSectionTitle')}</Text>
      <View style={styles.cardsRow}>
        <PlanCard title={t('planStarter')} current={!isPro} def={STARTER} t={t} />
        <PlanCard title={t('planCommunityPro')} current={isPro} def={COMMUNITY_PRO} t={t} />
      </View>
      {canAct ? (
        isPro ? (
          <Button
            label={t('returnToStarter')}
            variant="outline"
            fullWidth
            loading={busy}
            onPress={() => void downgrade()}
          />
        ) : (
          <Button
            label={t('upgradeToPro')}
            variant="primary"
            fullWidth
            loading={busy}
            onPress={() => void upgrade()}
          />
        )
      ) : (
        <Text style={styles.ownerOnlyHint}>{t('planOwnerOnly')}</Text>
      )}
    </View>
  );
}

function PlanCard({
  title,
  current,
  def,
  t,
}: {
  title: string;
  current: boolean;
  def: PlanDef;
  t: TFunction<'community'>;
}) {
  return (
    <Card padding="md" style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        {current ? <Badge label={t('planCurrent')} tone="primary" /> : null}
      </View>
      <View style={styles.limits}>
        {LIMIT_ORDER.map((key) => {
          const value = def.limits?.[key] ?? null;
          return (
            <View key={key} style={styles.limitRow}>
              <Text style={styles.limitLabel}>{t(LIMIT_LABEL_KEYS[key])}</Text>
              <Text style={styles.limitValue}>{value === null ? t('limitUnlimited') : String(value)}</Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 12, gap: space[3] },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    marginLeft: 4,
  },
  loading: { paddingVertical: space[4], alignItems: 'center' },
  cardsRow: { flexDirection: 'row', gap: space[3] },
  card: { flex: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[3] },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.foreground },
  limits: { gap: space[2] },
  limitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  limitLabel: { fontSize: 13, color: colors.mutedForeground, flexShrink: 1 },
  limitValue: { fontSize: 13, fontWeight: '600', color: colors.foreground },
  ownerOnlyHint: { fontSize: 13, color: colors.mutedForeground, textAlign: 'center' },
});
