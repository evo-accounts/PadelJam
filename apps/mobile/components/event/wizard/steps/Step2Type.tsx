import { EVENT_TYPES } from '@padel/api';
import { useT } from '@padel/i18n';
import { StyleSheet, Text, View } from 'react-native';

import type { WizardStepProps } from '../draft';
import { SelectableCard } from '../SelectableCard';

export function Step2Type({ draft, patch }: WizardStepProps) {
  const { t } = useT('event');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('step2Title')}</Text>
      <View style={styles.list}>
        {EVENT_TYPES.map((value) => {
          const cap = `type${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;
          return (
            <SelectableCard
              key={value}
              title={t(`${cap}Label`)}
              description={t(`${cap}Desc`)}
              selected={draft.eventType === value}
              onPress={() => patch({ eventType: value })}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  title: { fontSize: 22, fontWeight: '700', color: '#0B1F3A' },
  list: { gap: 10 },
});
