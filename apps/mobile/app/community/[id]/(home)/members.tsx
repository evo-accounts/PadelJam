import { useAbility, useCommunityMembers } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { MemberRow, type CommunityMember } from '@/components/community/MemberRow';

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 };

export default function CommunityMembersScreen() {
  const { t } = useT('community');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: members, isLoading } = useCommunityMembers(id);
  const { data: ability } = useAbility(id);
  // Ability is already scoped to this community; type-only check is sufficient.
  const canInvite = ability?.can('create', 'Member') ?? false;

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#0B1F3A" />
      </View>
    );
  }

  const rows = [...((members ?? []) as CommunityMember[])].sort(
    (a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9),
  );

  return (
    <View style={styles.container}>
      <FlashList
        data={rows}
        keyExtractor={(m) => m.user_id}
        ListHeaderComponent={
          canInvite ? (
            <Pressable
              style={styles.invite}
              accessibilityRole="button"
              onPress={() => router.push(`/community/${id}/manage/invite`)}
            >
              <Text style={styles.inviteText}>＋ {t('inviteMember')}</Text>
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.empty}>{t('noMembers')}</Text>
          </View>
        }
        renderItem={({ item }) => <MemberRow member={item} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  empty: { fontSize: 15, color: '#3A4A60' },
  invite: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E6EAF0',
  },
  inviteText: { fontSize: 16, fontWeight: '700', color: '#0B7BFF' },
});
