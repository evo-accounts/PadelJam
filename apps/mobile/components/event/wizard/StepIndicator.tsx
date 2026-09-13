import { useT } from '@padel/i18n';
import { StyleSheet, View } from 'react-native';

import { space } from '../../../theme';
import { Dots, Text } from '../../ui';

/**
 * The wizard's "Step 3 of 7" header. The dot row it used to hand-roll is now
 * `Dots`, which is the same eight-point row `welcome.tsx` grew independently.
 *
 * The visible label is `accessible={false}` on purpose: `Dots` announces itself
 * with the SAME `event:stepProgress` string, so leaving both in the tree would
 * make a screen reader say "Step 3 of 7" twice — and would give the E2E driver
 * two matches for one piece of text.
 */
export function StepIndicator({ stepIndex, total }: { stepIndex: number; total: number }) {
  const { t } = useT('event');
  const label = t('stepProgress', { current: stepIndex + 1, total });
  return (
    <View style={styles.container}>
      <Text variant="label" tone="default" accessible={false}>
        {label}
      </Text>
      <Dots count={total} index={stepIndex} accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[5],
    paddingVertical: space[3],
  },
});
