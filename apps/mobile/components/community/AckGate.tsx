/**
 * Acknowledgement gate for cancellation rules: a labelled switch plus a
 * brand-coloured link that opens the rules in a modal. The parent owns the
 * `value`; this only renders.
 */
import { useT } from '@padel/i18n';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { RulesModal } from '@/components/community/RulesModal';
import { SwitchRow, Text } from '../ui';
import { space } from '../../theme';

export function AckGate({
  value,
  onChange,
  rulesText,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  rulesText: string;
}) {
  const { t } = useT('community');
  const [showRules, setShowRules] = useState(false);

  return (
    <View style={styles.container}>
      <SwitchRow
        label={t('ackLabel')}
        value={value}
        onValueChange={onChange}
        testID="community-ack-toggle"
      />
      <Pressable onPress={() => setShowRules(true)} accessibilityRole="button">
        <Text variant="label" tone="primary">
          {t('cancellationRulesLink')}
        </Text>
      </Pressable>
      <RulesModal visible={showRules} text={rulesText} onClose={() => setShowRules(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space[2] },
});
