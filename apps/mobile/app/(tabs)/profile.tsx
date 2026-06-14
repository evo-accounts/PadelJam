import { useT } from '@padel/i18n';
import { StyleSheet, Text, View } from 'react-native';

export default function ProfileScreen() {
  const { t } = useT('profile');
  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>{t('placeholder')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC', alignItems: 'center', justifyContent: 'center', padding: 24 },
  placeholder: { color: '#6B7685', fontSize: 16, textAlign: 'center' },
});
