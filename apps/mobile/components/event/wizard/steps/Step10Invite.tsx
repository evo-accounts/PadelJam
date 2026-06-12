import { useT } from '@padel/i18n';
import { StyleSheet, Text, View } from 'react-native';

import type { WizardStepProps } from '../draft';
import { InvitePicker } from '../InvitePicker';

export function Step10Invite({ draft, patch }: WizardStepProps) {
  const { t } = useT('event');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('step10Title')}</Text>
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
        invitees={draft.invitees ?? []}
        onChange={(invitees) => patch({ invitees })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#0B1F3A' },
  subtitle: { fontSize: 15, color: '#6B7685' },
  note: {
    gap: 6,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F0F3F8',
    borderWidth: 1,
    borderColor: '#E6EAF0',
  },
  noteTitle: { fontSize: 15, fontWeight: '700', color: '#0B1F3A' },
  noteBody: { fontSize: 13, color: '#6B7685' },
});
