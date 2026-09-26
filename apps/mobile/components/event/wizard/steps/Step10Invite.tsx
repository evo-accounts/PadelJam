import { useT } from '@padel/i18n';
import { StyleSheet, Text, View } from 'react-native';

import type { WizardStepProps } from '../draft';
import { InvitePicker } from '../InvitePicker';
import { colors } from '../../../../theme';

export function Step10Invite({ draft, patch }: WizardStepProps) {
  const { t } = useT('event');

  return (
    <View style={styles.container}>
      <Text style={styles.subtitle}>{t('inviteSubtitle')}</Text>

      {draft.specification === 'team' ? (
        <View style={styles.note}>
          <Text style={styles.noteTitle}>{t('teamPairLabel')}</Text>
          <Text style={styles.noteBody}>{t('noInvitesHint')}</Text>
        </View>
      ) : null}

      <InvitePicker
        groupId={draft.groupId}
        isPrivate={draft.isPrivate}
        specification={draft.specification}
        invitees={draft.invitees ?? []}
        onChange={(invitees) => patch({ invitees })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  subtitle: { fontSize: 15, color: colors.mutedForeground },
  note: {
    gap: 6,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noteTitle: { fontSize: 15, fontWeight: '700', color: colors.foreground },
  noteBody: { fontSize: 13, color: colors.mutedForeground },
});
