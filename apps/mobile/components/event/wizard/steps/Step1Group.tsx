import { useCommunityGroups } from '@padel/api';
import { useT } from '@padel/i18n';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useEventWizard } from '../CreateEventContext';
import type { WizardStepProps } from '../draft';
import { SelectableCard } from '../SelectableCard';
import { colors } from '../../../../theme';

export function Step1Group({ draft, patch }: WizardStepProps) {
  const { t } = useT('event');
  const { communityId } = useEventWizard();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('step1Title')}</Text>
      <Text style={styles.subtitle}>{t('step1Subtitle')}</Text>
      {communityId ? (
        <GroupList draft={draft} patch={patch} communityId={communityId} />
      ) : (
        <View style={styles.list}>
          <SelectableCard
            title={t('noGroupOption')}
            selected={draft.groupId === null}
            onPress={() => patch({ groupId: null })}
          />
          <Text style={styles.hint}>{t('noGroupHint')}</Text>
        </View>
      )}
    </View>
  );
}

function GroupList({
  draft,
  patch,
  communityId,
}: WizardStepProps & { communityId: string }) {
  const { t } = useT('event');
  const groups = useCommunityGroups(communityId);

  if (groups.isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  const rows = groups.data ?? [];

  return (
    <View style={styles.list}>
      {rows.length === 0 ? <Text style={styles.hint}>{t('noGroupsYet')}</Text> : null}
      {rows.map((group) => (
        <SelectableCard
          key={group.id}
          title={group.name}
          selected={draft.groupId === group.id}
          onPress={() => patch({ groupId: group.id })}
        />
      ))}
      <SelectableCard
        title={t('noGroupOption')}
        selected={draft.groupId === null}
        onPress={() => patch({ groupId: null })}
      />
      <Text style={styles.hint}>{t('noGroupHint')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  title: { fontSize: 22, fontWeight: '700', color: colors.foreground },
  subtitle: { fontSize: 15, color: colors.mutedForeground, marginBottom: 8 },
  list: { gap: 10 },
  loading: { paddingVertical: 24, alignItems: 'center' },
  hint: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
});
