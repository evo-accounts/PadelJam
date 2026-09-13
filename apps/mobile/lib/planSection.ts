import { PLAN_MATRIX, type PlanDef } from '@padel/features';

/** i18n keys (community namespace) for the community plan titles. */
export const PLAN_TITLE_KEYS: Record<string, string> = {
  starter: 'planStarter',
  basic: 'planBasic',
  community_pro: 'planCommunityPro',
  club: 'planClub',
};

export type PlanAction = 'upgrade' | 'downgrade' | null;

export type PlanSectionView = {
  /** The left card: the community's current plan, or Starter when Community Pro is current. */
  left: PlanDef;
  leftTitleKey: string;
  leftCurrent: boolean;
  proCurrent: boolean;
  /** What the owner button does; null when the plan cannot be changed from the app (club). */
  action: PlanAction;
};

const STARTER = PLAN_MATRIX.find((p) => p.id === 'starter') as PlanDef;

function communityPlanDef(id: string): PlanDef | undefined {
  return PLAN_MATRIX.find((p) => p.dimension === 'community' && p.id === id);
}

/**
 * Pure view model for Manage Community's Plan section. The left card always describes the plan
 * the community is actually on (Starter, Basic or Club, with that plan's limits) so a community
 * on Basic is not shown as Starter; Community Pro stays on the right as the upgrade target.
 * `set_community_plan` only accepts 'starter' and 'community_pro', so Club has no action.
 */
export function planSectionView(plan: string | null | undefined): PlanSectionView {
  const current = (plan ? communityPlanDef(plan) : undefined) ?? STARTER;
  const proCurrent = current.id === 'community_pro';
  const left = proCurrent ? STARTER : current;
  const action: PlanAction =
    proCurrent ? 'downgrade' : current.id === 'starter' || current.id === 'basic' ? 'upgrade' : null;
  return { left, leftTitleKey: PLAN_TITLE_KEYS[left.id] ?? 'planStarter', leftCurrent: !proCurrent, proCurrent, action };
}
