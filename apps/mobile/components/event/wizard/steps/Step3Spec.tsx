import { SPECIFICATIONS } from '@padel/api';
import { useT } from '@padel/i18n';
import { StyleSheet, Text, View } from 'react-native';

import type { WizardStepProps } from '../draft';
import { SelectableCard } from '../SelectableCard';

export function Step3Spec({ draft, patch }: WizardStepProps) {
  const { t } = useT('event');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('step3Title')}</Text>
      <View style={styles.list}>
        {SPECIFICATIONS.map((value) => {
          const cap = `spec${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;
          return (
            <SelectableCard
              key={value}
              title={t(`${cap}Label`)}
              description={t(`${cap}Desc`)}
              selected={draft.specification === value}
              onPress={() => patch({ specification: value })}
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
