import { useAbility, useCommunityMembers } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useCommunityId } from '@/components/community/CommunityIdContext';
import { MemberRow, type CommunityMember } from '@/components/community/MemberRow';
import { colors } from '../../../../theme';

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 };

export default function CommunityMembersScreen() {
  const { t } = useT('community');
  const router = useRouter();
  const id = useCommunityId();

  const { data: members, isLoading, isError } = useCommunityMembers(id);
  const { data: ability } = useAbility(id);
  // Ability is already scoped to this community; type-only check is sufficient.
  const canInvite = ability?.can('create', 'Member') ?? false;

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.foreground} />
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
            <Text style={[styles.empty, isError && styles.error]}>
              {isError ? t('loadError') : t('noMembers')}
            </Text>
          </View>
        }
        renderItem={({ item }) => <MemberRow member={item} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  empty: { fontSize: 15, color: colors.mutedForeground },
  error: { color: colors.destructive, fontWeight: '600' },
  invite: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  inviteText: { fontSize: 16, fontWeight: '700', color: colors.primary },
});
