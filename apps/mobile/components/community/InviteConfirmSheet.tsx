/**
 * The invitation confirmation of UX-COMM-22 — "Never a native alert".
 *
 * It is a component rather than a `useConfirm()` call because the multi-group
 * case is INTERACTIVE: the audit requires the group choice to be made here, and
 * confirm disabled until at least one is chosen. `useConfirm` carries a title,
 * a body and two labels, and nothing that can be ticked.
 *
 * Moving the choice into the sheet also retires a smaller version of the fault
 * UX-COMM-23 fixes for leaving. The picker used to sit in the list's footer,
 * out of sight below the results, and pressing the CTA with nothing chosen
 * showed a banner saying a group was required — asking, then refusing. Now the
 * button is simply not available until the form is answerable.
 */
import { useT } from '@padel/i18n';
import { StyleSheet, View } from 'react-native';

import { space } from '../../theme';
import { BottomSheet, Button, Checkbox, Text } from '../ui';

export type InviteGroup = { id: string; name: string; is_general: boolean };

export function InviteConfirmSheet({
  visible,
  onClose,
  count,
  groups,
  selected,
  onToggle,
  onConfirm,
  pending = false,
}: {
  visible: boolean;
  onClose: () => void;
  /** How many people are being invited — the title states it. */
  count: number;
  groups: InviteGroup[];
  selected: Record<string, boolean>;
  onToggle: (groupId: string) => void;
  onConfirm: () => void;
  pending?: boolean;
}) {
  const { t } = useT('community');
  const multi = groups.length > 1;
  const chosen = groups.filter((g) => selected[g.id]).length;
  const canConfirm = count > 0 && (!multi || chosen > 0) && !pending;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={t('inviteCta', { count })}
      testID="invite-confirm-sheet"
    >
      <View style={styles.body}>
        {multi ? (
          <>
            <Text variant="label">{t('inviteGroupsTitle')}</Text>
            {groups.map((g) => (
              <Checkbox
                key={g.id}
                checked={!!selected[g.id]}
                onChange={() => onToggle(g.id)}
                label={g.is_general ? t('generalGroup') : g.name}
                testID={`invite-group-${g.id}`}
              />
            ))}
            {/* Why choosing one group is not a loss: the rest stay reachable. */}
            <Text variant="caption" tone="muted">
              {t('inviteGroupsNote')}
            </Text>
          </>
        ) : (
          <Text variant="body" tone="muted">
            {t('inviteConfirmGeneral')}
          </Text>
        )}

        <Button
          label={t('invite')}
          size="lg"
          fullWidth
          disabled={!canConfirm}
          loading={pending}
          onPress={onConfirm}
          testID="invite-confirm-submit"
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: space[3], paddingBottom: space[2] },
});
