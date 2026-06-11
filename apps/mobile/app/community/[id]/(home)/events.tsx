import { useT } from '@padel/i18n';
import { StyleSheet, Text, View } from 'react-native';

export default function CommunityEventsScreen() {
  const { t } = useT('community');
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{t('eventsComingSoon')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6F8FB', padding: 32 },
  text: { fontSize: 15, color: '#3A4A60' },
});
