import { useT } from '@padel/i18n';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '70%',
  },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 16, color: '#0B1F3A' },
  body: { marginBottom: 16 },
  text: { fontSize: 15, color: '#333', lineHeight: 22 },
  button: { backgroundColor: '#0B1F3A', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
