import { useGroupMembers } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GroupMemberRow, type GroupMember } from '@/components/group/GroupMemberRow';
import { colors } from '../../../theme';

export default function GroupMembersScreen() {
  const { t } = useT('group');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: members, isLoading } = useGroupMembers(id);
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const list = (members ?? []) as GroupMember[];
    const q = query.trim().toLowerCase();
    if (q.length === 0) return list;
    return list.filter((m) => (m.profiles?.full_name ?? '').toLowerCase().includes(q));
  }, [members, query]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('back')}
          hitSlop={12}
        >
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>{t('membersTitle')}</Text>
        <View style={styles.backSpacer} />
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder={t('membersSearchPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.foreground} />
        </View>
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(m) => m.user_id}
          renderItem={({ item }) => <GroupMemberRow member={item} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.empty}>{t('membersTitle')}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  back: { fontSize: 32, color: colors.foreground, lineHeight: 32 },
  backSpacer: { width: 24 },
  title: { fontSize: 17, fontWeight: '700', color: colors.foreground },
  searchWrap: { padding: 16 },
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  empty: { fontSize: 15, color: colors.mutedForeground },
});
