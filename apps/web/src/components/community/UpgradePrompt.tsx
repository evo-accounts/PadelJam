'use client';
import { useT } from '@padel/i18n';
import { GroupConfirm } from '@/components/group/GroupConfirm';

/**
 * UpgradePrompt — web's twin of mobile's (UX-GLOB-10): a plan-cap error is not a raw error line
 * but a dialog naming the limit. Mobile's "See plans" goes to the community's Plan section, which
 * the web does not have yet, so the dialog says where the plan is changed instead: an owner or
 * admin is pointed at the app's Plan section, anyone else is told only an admin can change it.
 */
export function UpgradePrompt({
  open,
  onClose,
  title,
  canManage,
  body,
}: {
  open: boolean;
  onClose: () => void;
  /** The limit that was hit, e.g. "Recurring events need Community Pro." */
  title: string;
  canManage: boolean;
  /** Replaces the community-plan line — e.g. a group-less event's account plan (Jammer+). */
  body?: string;
}) {
  const { t } = useT('community');
  return (
    <GroupConfirm
      open={open}
      onClose={onClose}
      title={title}
      body={body ?? (canManage ? t('upgradeBodyAdmin') : t('upgradeBodyMember'))}
      confirmLabel={t('upgradeOk')}
      onConfirm={onClose}
    />
  );
}
