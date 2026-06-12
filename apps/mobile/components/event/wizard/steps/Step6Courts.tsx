import { useT } from '@padel/i18n';
import { StyleSheet, Text, View } from 'react-native';

import { CourtCounter } from '../CourtCounter';
import type { WizardStepProps } from '../draft';

export function Step6Courts({ draft, patch }: WizardStepProps) {
  const { t } = useT('event');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('step6Title')}</Text>
      <CourtCounter value={draft.numCourts} onChange={(n) => patch({ numCourts: n })} />
      <Text style={styles.hint}>{t('capacityHint', { count: draft.numCourts * 4 })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#0B1F3A' },
  hint: { fontSize: 14, color: '#6B7685' },
});
