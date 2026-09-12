import { useT } from '@padel/i18n';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { colors } from '../../theme';
import { BottomSheet } from '../ui';

/** Read-only sheet rendering a community's cancellation rules text. */
export function RulesModal({
  visible,
  text,
  onClose,
}: {
  visible: boolean;
  text: string;
  onClose: () => void;
}) {
  const { t } = useT('community');
  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('rulesViewTitle')} testID="rules-sheet">
      <ScrollView style={styles.body}>
        <Text style={styles.text}>{text}</Text>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { maxHeight: 420 },
  text: { fontSize: 15, color: colors.foreground, lineHeight: 22 },
});
