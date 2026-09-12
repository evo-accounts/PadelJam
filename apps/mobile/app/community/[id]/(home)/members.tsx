import { useAbility, useCommunityMembers } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useCommunityId } from '@/components/community/CommunityIdContext';
import { MemberRow, type CommunityMember } from '@/components/community/MemberRow';
import { colors } from '../../../../theme';
import { EmptyState, emptyIcon, listEmptyContent } from '../../../../components/ui';

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 };

export default function CommunityMembersScreen() {
  const { t } = useT('community');
  const router = useRouter();
  const id = useCommunityId();

  const { data: members, isLoading, isError, refetch } = useCommunityMembers(id);
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
        contentContainerStyle={listEmptyContent}
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
          isError ? (
            <EmptyState
              fill
              tone="error"
              title={t('loadError', { ns: 'common' })}
              action={{ label: t('retry', { ns: 'common' }), onPress: () => refetch() }}
              testID="empty-members"
            />
          ) : (
            <EmptyState
              fill
              icon={emptyIcon('person.2')}
              title={t('noMembers')}
              body={t('communityMembersEmptyBody')}
              action={
                canInvite
                  ? {
                      label: t('communityMembersEmptyCta'),
                      onPress: () => router.push(`/community/${id}/manage/invite`),
                    }
                  : undefined
              }
              testID="empty-members"
            />
          )
        }
        renderItem={({ item }) => <MemberRow member={item} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  invite: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  inviteText: { fontSize: 16, fontWeight: '700', color: colors.primary },
});
