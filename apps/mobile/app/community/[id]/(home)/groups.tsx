import { useDb } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

type GroupRow = { id: string; name: string; is_general: boolean };

/** Read-only list of a community's groups. Group detail is owned by the Groups module. */
function useCommunityGroups(communityId: string) {
  const db = useDb();
  return useQuery({
    queryKey: ['community-groups', communityId],
    queryFn: async () => {
      const { data, error } = await db
        .from('groups')
        .select('id, name, is_general')
        .eq('community_id', communityId)
        .is('archived_at', null)
        .order('is_general', { ascending: false })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as GroupRow[];
    },
  });
}

export default function CommunityGroupsScreen() {
  const { t } = useT('community');
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: groups, isLoading } = useCommunityGroups(id);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#0B1F3A" />
      </View>
    );
  }

  const rows = groups ?? [];

  if (rows.length === 0) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.empty}>{t('noGroups')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlashList
        data={rows}
        keyExtractor={(g) => g.id}
        ListFooterComponent={<Text style={styles.note}>{t('groupDetailComingSoon')}</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.name} numberOfLines={1}>
              {item.name}
            </Text>
            {item.is_general ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{t('generalGroup')}</Text>
              </View>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  empty: { fontSize: 15, color: '#3A4A60' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E6EAF0',
  },
  name: { flex: 1, fontSize: 16, fontWeight: '600', color: '#0B1F3A' },
  badge: { backgroundColor: '#EEF2F7', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#3A4A60' },
  note: { fontSize: 13, color: '#8A95A5', padding: 16, textAlign: 'center' },
});
