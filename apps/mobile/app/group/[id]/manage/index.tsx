import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, palette } from '../../../../theme';
import { TopBar } from '../../../../components/ui';

export default function GroupManageIndexScreen() {
  const { t } = useT('group');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar title={t('manageTitle')} onBack={() => router.back()} backLabel={t('back')} />
      <ScrollView contentContainerStyle={styles.inner}>
        <View style={styles.card}>
          <NavRow label={t('settingsRow')} onPress={() => router.push(`/group/${id}/manage/settings` as Href)} />
          <NavRow label={t('membersRow')} onPress={() => router.push(`/group/${id}/manage/members` as Href)} />
          <NavRow label={t('seasonsRow')} onPress={() => router.push(`/group/${id}/manage/seasons` as Href)} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function NavRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="button">
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: { padding: 16 },
  card: { backgroundColor: colors.card, borderRadius: 12, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: { fontSize: 16, color: colors.foreground, fontWeight: '500' },
  chevron: { fontSize: 22, color: palette.slate[400] },
});
