import { useAbility, useCommunity, useCommunityMembers, useCommunityRequests } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useCommunityId } from '@/components/community/CommunityIdContext';
import { MemberRow, type CommunityMember } from '@/components/community/MemberRow';
import { colors, space } from '../../../theme';
import { Badge, EmptyState, emptyIcon, Field, ListRow, listEmptyContent, Text } from '../../ui';

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 };

/** Accent-insensitive, case-insensitive contains — "joao" must find "João". */
const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export default function CommunityMembersScreen() {
  const { t } = useT('community');
  const router = useRouter();
  const id = useCommunityId();

  const { data: members, isLoading, isError, refetch } = useCommunityMembers(id);
  const { data: community } = useCommunity(id);
  const { data: ability } = useAbility(id);
  const [query, setQuery] = useState('');

  // Ability is already scoped to this community; type-only check is sufficient.
  const canInvite = ability?.can('create', 'Member') ?? false;
  /**
   * The client mirror of `may_approve_requests` (migration 0099): an admin, or a
   * member holding the approve_join_requests toggle. Asking the ability rather
   * than the role is what lets a plain member with the permission see the queue
   * they are allowed to answer — the bug 0099 fixed on the server side.
   */
  const canApprove = ability?.can('update', 'JoinRequest') ?? false;
  const { data: requests } = useCommunityRequests(id);
  const pending = requests?.length ?? 0;

  /**
   * UX-COMM-11 shows the requests entry "when the community requires approval and
   * the user can approve". The `pending > 0` arm is the non-stranding rule:
   * switching a community to public does not withdraw the requests already
   * queued, and without it those people wait for an answer behind a row nobody
   * can see any more. UX-COMM-19 makes the same change to the manage screen.
   */
  const showRequests = canApprove && (community?.privacy === 'request_to_join' || pending > 0);

  const rows = useMemo(() => {
    const all = [...((members ?? []) as CommunityMember[])].sort(
      (a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9),
    );
    const needle = fold(query.trim());
    if (!needle) return all;
    return all.filter((m) => fold(m.profiles?.full_name ?? '').includes(needle));
  }, [members, query]);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.foreground} />
      </View>
    );
  }

  const header = (
    <View style={styles.header}>
      {/*
        Inline, not the global search screen of UX-GLOB-08 — the audit resolved
        that conflict in favour of a filter that lives with the list it filters.
      */}
      <Field
        value={query}
        onChangeText={setQuery}
        placeholder={t('memberSearchPlaceholder')}
        accessibilityLabel={t('memberSearchPlaceholder')}
        autoCapitalize="none"
        autoCorrect={false}
        testID="member-search"
      />
      {showRequests ? (
        <ListRow
          title={t('memberRequests')}
          variant="plain"
          onPress={() => router.push(`/community/${id}/manage/requests`)}
          trailing={pending > 0 ? <Badge label={String(pending)} /> : undefined}
          // The count is INFORMATION, not decoration: without this the row
          // collapses into one element and the number goes unannounced.
          trailingLabel={pending > 0 ? t('memberRequestsPending', { count: pending }) : undefined}
          testID="member-requests-entry"
        />
      ) : null}
      {canInvite ? (
        <ListRow
          title={t('inviteMember')}
          variant="plain"
          onPress={() => router.push(`/community/${id}/manage/invite`)}
          testID="invite-member-entry"
        />
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlashList
        data={rows}
        keyExtractor={(m) => m.user_id}
        contentContainerStyle={listEmptyContent}
        ListHeaderComponent={header}
        ListEmptyComponent={
          isError ? (
            <EmptyState
              fill
              tone="error"
              title={t('loadError', { ns: 'common' })}
              action={{ label: t('retry', { ns: 'common' }), onPress: () => refetch() }}
              testID="empty-members"
            />
          ) : query.trim() ? (
            // A search that matched nothing is not an empty community, and
            // offering "Invite" here would answer a question nobody asked.
            <View style={styles.noMatches}>
              <Text variant="body" tone="muted">
                {t('memberSearchNoMatches', { query: query.trim() })}
              </Text>
            </View>
          ) : (
            <EmptyState
              fill
              icon={emptyIcon('person.2')}
              title={t('noMembers')}
              body={t('communityMembersEmptyBody')}
              // The invite entry is pinned in the header above, so it is not
              // repeated inside the empty state.
              testID="empty-members"
            />
          )
        }
        renderItem={({ item }) => (
          <MemberRow member={item} onPress={() => router.push(`/profile/${item.user_id}`)} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  header: { paddingHorizontal: space[4], paddingTop: space[3], gap: space[2] },
  noMatches: { padding: space[5], alignItems: 'center' },
});
