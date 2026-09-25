import { EVENT_TYPES } from '@padel/api';
import { useT } from '@padel/i18n';
import { StyleSheet, View } from 'react-native';

import type { WizardStepProps } from '../draft';
import { SelectableCard } from '../SelectableCard';
import { space } from '../../../../theme';

/** Format (UX-CEVT-03): three cards with their descriptions; the tap sets the format and advances. */
export function Step2Type({ advance }: WizardStepProps) {
  const { t } = useT('event');

  return (
    <View style={styles.list}>
      {EVENT_TYPES.map((value) => {
        const cap = `type${value[0]?.toUpperCase() ?? ''}${value.slice(1)}`;
        return (
          <SelectableCard
            key={value}
            title={t(`${cap}Label`)}
            subtitle={t(`${cap}Desc`)}
            // The tap is the answer — no selected state is left on the card (UX-CEVT-01).
            selected={false}
            onPress={() => advance?.({ eventType: value })}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space[3] },
});
