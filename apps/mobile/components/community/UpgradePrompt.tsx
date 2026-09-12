/**
 * UpgradePrompt — the shared destination every plan-cap error opens onto (UX-GLOB-10).
 *
 * A cap error (group/member/co-organizer/recurring-event limits, or a Starter-only
 * feature like custom blasts) is not a dead end: it is a `BottomSheet` naming the
 * limit and a "See plans" action that goes straight to the community's Plan section
 * (`/community/[id]/manage?section=plan`), where an owner or admin can upgrade on
 * request.
 *
 * Only owners/admins can act on that screen, so a caller that knows the current
 * user cannot manage the community passes `canManage={false}`: the sheet still
 * states the limit, but offers "OK" instead of a dead-end navigation.
 */
import { useT } from '@padel/i18n';
import { useRouter } from 'expo-router';

import { BottomSheet, Button } from '../ui';

type Props = {
  visible: boolean;
  onClose: () => void;
  communityId: string;
  message: string;
  /** Defaults to true: most call sites already gate the triggering action to owners/admins. */
  canManage?: boolean;
};

export function UpgradePrompt({ visible, onClose, communityId, message, canManage = true }: Props) {
  const { t } = useT('community');
  const router = useRouter();

  const onSeePlans = () => {
    onClose();
    router.push(`/community/${communityId}/manage?section=plan` as never);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={message} testID="upgrade-prompt-sheet">
      <Button
        label={canManage ? t('seePlans') : t('ok')}
        onPress={canManage ? onSeePlans : onClose}
        fullWidth
        testID="upgrade-prompt-cta"
      />
    </BottomSheet>
  );
}
