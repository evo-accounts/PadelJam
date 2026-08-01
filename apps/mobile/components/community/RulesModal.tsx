import { useT } from '@padel/i18n';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';

/** Read-only modal rendering a community's cancellation rules text. */
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
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>{t('rulesViewTitle')}</Text>
          <ScrollView style={styles.body}>
            <Text style={styles.text}>{text}</Text>
          </ScrollView>
          <Pressable style={styles.button} onPress={onClose} accessibilityRole="button">
            <Text style={styles.buttonText}>{t('close')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '70%',
  },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 16, color: colors.foreground },
  body: { marginBottom: 16 },
  text: { fontSize: 15, color: colors.foreground, lineHeight: 22 },
  button: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: colors.card, fontSize: 16, fontWeight: '600' },
});
