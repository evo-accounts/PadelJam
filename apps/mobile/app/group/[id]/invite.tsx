/**
 * Invite Members (UX-GRP-08). Shaped like the community's picker (UX-COMM-22): ✕ in place of back,
 * Share and Copy link first — a link reaches people with no account — then "or" and a search.
 *
 * Who is listed, in this order:
 *   Community members   of the parent community, not in the group
 *   My connections      people the viewer follows, not already listed above
 *   Others              anyone else, only once a name is typed
 * Several can be picked at once; the fixed button says how many.
 *
 * Anyone outside the community is added to BOTH on accepting (accept_group_invitation records
 * the community entry) — there is no separate community invitation. When the selection includes
 * such a person, a sheet says so before anything is sent; otherwise the invites go straight out.
 *
 * Only reachable for whoever may invite (0107's may_invite_to_group): everyone else is sent back.
 */
import {
  useCanInviteToGroup,
  useCommunity,
  useCommunityMembers,
  useGroup,
  useGroupMemberList,
  useInviteToGroup,
  useFollowing,
  useSearchProfiles,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { avatarUrl } from '@/lib/community-images';
import { copyGroupLink, shareGroup } from '@/lib/groupShare';
import { colors, space } from '../../../theme';
import {
  Avatar,
  BottomSheet,
  Button,
  Checkbox,
  Chip,
  EmptyState,
  emptyIcon,
  Field,
  ListRow,
  Text,
  TopBar,
  useBanner,
} from '../../../components/ui';

type Person = { id: string; full_name: string | null; avatar_url: string | null };
type Section = { key: 'community' | 'connections' | 'others'; title: string; data: Person[] };

export default function GroupInviteScreen() {
  const { t } = useT('group');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const banner = useBanner();
  const uid = useSession().session?.user.id;
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: group } = useGroup(id);
  const communityId = group?.community_id;
  const { data: community } = useCommunity(communityId);
  const { data: communityMembers } = useCommunityMembers(communityId);
  const { data: people } = useGroupMemberList(id);
  const { data: canInvite, isLoading: checking } = useCanInviteToGroup(id);
  const invite = useInviteToGroup(id);

  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<Record<string, Person>>({});
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => setTerm(query), 300);
    return () => clearTimeout(handle);
  }, [query]);

  const { data: following } = useFollowing(uid, term);
  const { data: found, isFetching } = useSearchProfiles(term);

  // Nobody without the right to invite should be here; a deep link is sent back.
  useEffect(() => {
    if (!checking && canInvite === false) router.back();
  }, [checking, canInvite, router]);

  const inGroup = useMemo(
    () => new Set((people ?? []).filter((p) => p.is_member).map((p) => p.user_id)),
    [people],
  );
  const inCommunity = useMemo(() => new Set((communityMembers ?? []).map((m) => m.user_id)), [communityMembers]);

  const sections = useMemo<Section[]>(() => {
    const q = term.trim().toLowerCase();
    const matches = (name: string | null) => q.length === 0 || (name ?? '').toLowerCase().includes(q);
    const seen = new Set<string>([...inGroup, uid ?? '']);
    const take = (list: Person[]) =>
      list.filter((p) => {
        if (seen.has(p.id) || !matches(p.full_name)) return false;
        seen.add(p.id);
        return true;
      });

    const community = take(
      (communityMembers ?? []).map((m) => ({
        id: m.user_id,
        full_name: m.profiles?.full_name ?? null,
        avatar_url: m.profiles?.avatar_url ?? null,
      })),
    );
    const connections = take(
      (following?.pages.flat() ?? []).map((f) => ({ id: f.id, full_name: f.full_name, avatar_url: f.avatar_url })),
    );
    const others = q.length > 0 ? take((found ?? []) as Person[]) : [];
    return [
      { key: 'community' as const, title: t('inviteSectionCommunity'), data: community },
      { key: 'connections' as const, title: t('inviteSectionConnections'), data: connections },
      { key: 'others' as const, title: t('inviteSectionOthers'), data: others },
    ].filter((s) => s.data.length > 0);
  }, [term, inGroup, uid, communityMembers, following, found, t]);

  const selectedList = Object.values(selected);
  const outsiders = selectedList.filter((p) => !inCommunity.has(p.id));

  const toggle = (p: Person) =>
    setSelected((s) => {
      const next = { ...s };
      if (next[p.id]) delete next[p.id];
      else next[p.id] = p;
      return next;
    });

  const send = async () => {
    setSending(true);
    try {
      for (const p of selectedList) await invite.mutateAsync(p.id);
      setConfirming(false);
      banner.show(t('inviteSentToast'), 'success');
      router.back();
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      banner.show(t(code, { defaultValue: t('unknown_error') }));
    } finally {
      setSending(false);
    }
  };

  const onSubmit = () => (outsiders.length > 0 ? setConfirming(true) : void send());

  const header = (
    <View style={styles.header}>
      <View style={styles.shareRow}>
        <Button
          label={t('shareCta')}
          variant="secondary"
          style={styles.shareButton}
          onPress={() => void shareGroup(id, group?.name ?? '')}
          testID="group-invite-share"
        />
        <Button
          label={t('copyLinkCta')}
          variant="secondary"
          style={styles.shareButton}
          onPress={async () => {
            await copyGroupLink(id);
            banner.show(t('linkCopied'), 'success');
          }}
          testID="group-invite-copy"
        />
      </View>
      <View style={styles.orRow}>
        <View style={styles.rule} />
        <Text variant="caption" tone="muted">
          {t('orDivider')}
        </Text>
        <View style={styles.rule} />
      </View>
      <Field
        value={query}
        onChangeText={setQuery}
        placeholder={t('inviteSearchPlaceholder')}
        accessibilityLabel={t('inviteSearchPlaceholder')}
        autoCapitalize="none"
        autoCorrect={false}
        testID="group-invite-search"
      />
      {selectedList.length > 0 ? (
        <View style={styles.chips}>
          {selectedList.map((p) => {
            const name = p.full_name ?? '—';
            return (
              <Chip
                key={p.id}
                label={name}
                selected
                removeLabel={t('removeSelected', { name })}
                onPress={() => toggle(p)}
                testID={`group-invite-chip-${p.id}`}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="edit" title={t('inviteTitle')} onClose={() => router.back()} dirty={selectedList.length > 0} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SectionList
          sections={sections}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          renderSectionHeader={({ section }) => (
            <Text variant="caption" tone="muted" style={styles.sectionTitle} accessibilityRole="header">
              {section.title}
            </Text>
          )}
          ListEmptyComponent={
            isFetching ? (
              <View style={styles.center}>
                <ActivityIndicator color={colors.foreground} />
              </View>
            ) : (
              <EmptyState
                icon={emptyIcon('magnifyingglass')}
                title={term.trim() ? t('inviteNoResults') : t('inviteSearchHint')}
                testID="empty-group-invite"
              />
            )
          }
          renderItem={({ item }) => {
            const name = item.full_name ?? '—';
            return (
              <ListRow
                title={name}
                variant="plain"
                onPress={() => toggle(item)}
                leading={<Avatar uri={avatarUrl(item.avatar_url)} name={name} colourKey={item.id} size="md" decorative />}
                trailing={
                  <Checkbox
                    checked={!!selected[item.id]}
                    onChange={() => toggle(item)}
                    accessibilityLabel={name}
                    testID={`group-invite-check-${item.id}`}
                  />
                }
                testID={`group-invite-row-${item.id}`}
              />
            );
          }}
        />
        <View style={[styles.footer, { paddingBottom: insets.bottom + space[2] }]}>
          <Button
            label={t('inviteCta', { count: selectedList.length })}
            size="lg"
            fullWidth
            disabled={selectedList.length === 0 || sending}
            loading={sending && !confirming}
            onPress={onSubmit}
            testID="group-invite-submit"
          />
        </View>
      </KeyboardAvoidingView>

      <BottomSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        title={t('inviteBothTitle')}
        testID="group-invite-both-sheet"
      >
        <Text variant="body" tone="muted" style={styles.sheetBody}>
          {t('inviteBothBody', { count: outsiders.length, community: community?.name ?? '' })}
        </Text>
        <Button
          label={t('inviteCta', { count: selectedList.length })}
          fullWidth
          loading={sending}
          onPress={() => void send()}
          style={styles.sheetButton}
          testID="group-invite-both-confirm"
        />
        <Button
          label={t('cancel')}
          variant="ghost"
          fullWidth
          onPress={() => setConfirming(false)}
          style={styles.sheetButton}
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  flex: { flex: 1 },
  list: { paddingBottom: space[4] },
  center: { alignItems: 'center', justifyContent: 'center', padding: space[6] },
  header: { paddingHorizontal: space[4], paddingTop: space[3], gap: space[3] },
  shareRow: { flexDirection: 'row', gap: space[3] },
  shareButton: { flex: 1 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  sectionTitle: { paddingHorizontal: space[4], paddingTop: space[4], paddingBottom: space[1] },
  footer: {
    paddingHorizontal: space[4],
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  sheetBody: { paddingHorizontal: space[2], marginBottom: space[3] },
  sheetButton: { marginTop: space[2] },
});
