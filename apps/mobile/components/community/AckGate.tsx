import { useT } from '@padel/i18n';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { RulesModal } from '@/components/community/RulesModal';
import { colors } from '../../theme';

/**
 * Acknowledgement gate for cancellation rules: a toggle plus a brand-coloured link
 * that opens the rules in a modal. The parent owns the `value`; this only renders.
 */
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
      <View style={styles.row}>
        <Switch value={value} onValueChange={onChange} accessibilityRole="switch" />
        <Text style={styles.label}>{t('ackLabel')}</Text>
      </View>
      <Pressable onPress={() => setShowRules(true)} accessibilityRole="button">
        <Text style={styles.link}>{t('cancellationRulesLink')}</Text>
      </Pressable>
      <RulesModal visible={showRules} text={rulesText} onClose={() => setShowRules(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { flex: 1, fontSize: 14, color: colors.foreground, lineHeight: 20 },
  link: { fontSize: 14, fontWeight: '700', color: colors.primary, marginLeft: 52 },
});
