import { SCORING_MODES } from '@padel/api';
import { useT } from '@padel/i18n';
import { StyleSheet, Text, View } from 'react-native';

import type { WizardStepProps } from '../draft';
import { ScoringPanels } from '../ScoringPanels';
import { SelectableCard } from '../SelectableCard';
import { colors } from '../../../../theme';

export function Step4Scoring({ draft, patch }: WizardStepProps) {
  const { t } = useT('event');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('step4Title')}</Text>
      <View style={styles.list}>
        {SCORING_MODES.map((value) => {
          const cap = `scoring${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;
          return (
            <SelectableCard
              key={value}
              title={t(`${cap}Label`)}
              subtitle={t(`${cap}Desc`)}
              selected={draft.scoringMode === value}
              onPress={() =>
                patch({
                  scoringMode: value,
                  scoringValue: value === 'classic' ? null : value === 'points' ? 24 : 15,
                })
              }
            />
          );
        })}
      </View>
      <ScoringPanels
        mode={draft.scoringMode}
        value={draft.scoringValue}
        onChange={(v) => patch({ scoringValue: v })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  title: { fontSize: 22, fontWeight: '700', color: colors.foreground },
  list: { gap: 10 },
});
