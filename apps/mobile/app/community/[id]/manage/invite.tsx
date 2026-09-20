/**
 * Invite Members (UX-COMM-22). A rewrite rather than an edit, because most of
 * what was here was a second implementation of something the app already owns:
 * a raw TextInput instead of `Field`, a `db.from('profiles')` query with its own
 * debounce living in the component, a second `db.from('groups')` query beside
 * it, and two hand-rolled checkboxes.
 *
 * Two accessibility faults went with them. The selected-person chips carried
 * their own "✕" inside the label, so VoiceOver announced "João Pereira ✕" as
 * the person's name and nothing said the chip removed them — `Chip`'s
 * `removeLabel` now owns that. And the group picker sat in the list footer,
 * below the results, where pressing the CTA without a choice produced a banner
 * saying one was required: asked, then refused. The choice moved into the
 * confirmation sheet, where the button is simply unavailable until it is
 * answerable.
 */
import { useCommunity, useCommunityGroups, useCommunityMembers, useInviteMembers, useSearchProfiles } from '@padel/api';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { InviteConfirmSheet, type InviteGroup } from '@/components/community/InviteConfirmSheet';
import { avatarUrl } from '@/lib/community-images';
import { copyCommunityLink, shareCommunity } from '@/lib/communityShare';
import { colors, space } from '../../../../theme';
import {
  Avatar,
  Button,
  Checkbox,
  Chip,
  EmptyState,
  emptyIcon,
  Field,
  listEmptyContent,
  ListRow,
  Text,
  TopBar,
  useBanner,
} from '../../../../components/ui';

type Profile = { id: string; full_name: string | null; avatar_url: string | null };

export default function ManageInviteScreen() {
  const { t } = useT('community');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: community } = useCommunity(id);
  const { data: members } = useCommunityMembers(id);
  const { data: groups } = useCommunityGroups(id);
  const invite = useInviteMembers(id);
  const banner = useBanner();

  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<Record<string, Profile>>({});
  const [selectedGroups, setSelectedGroups] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState(false);

  // The hook caches per term, so the debounce is only about not asking for
  // every keystroke — it is not load-bearing for correctness any more.
  useEffect(() => {
    const handle = setTimeout(() => setTerm(query), 300);
    return () => clearTimeout(handle);
  }, [query]);

  const { data: found, isFetching } = useSearchProfiles(term);

  const groupList = useMemo<InviteGroup[]>(
    () => ((groups ?? []) as InviteGroup[]).slice().sort((a, b) => Number(b.is_general) - Number(a.is_general)),
    [groups],
  );

  // Default-select the general group so a single-group community needs no
  // picking. Guarded on "untouched" so it cannot undo a deliberate choice.
  useEffect(() => {
    if (groupList.length === 0) return;
    setSelectedGroups((s) => {
      if (Object.keys(s).length > 0) return s;
      const general: Record<string, boolean> = {};
      for (const g of groupList) if (g.is_general) general[g.id] = true;
      return general;
    });
  }, [groupList]);

  const memberIds = useMemo(() => new Set((members ?? []).map((m) => m.user_id)), [members]);
  const results = useMemo(
    () => ((found ?? []) as Profile[]).filter((p) => !memberIds.has(p.id)),
    [found, memberIds],
  );

  const selectedList = Object.values(selected);
  const dirty = selectedList.length > 0;

  const toggleSelect = (p: Profile) =>
    setSelected((s) => {
      const next = { ...s };
      if (next[p.id]) delete next[p.id];
      else next[p.id] = p;
      return next;
    });

  const doInvite = async () => {
    try {
      await invite.mutateAsync({
        inviteeIds: selectedList.map((p) => p.id),
        groupIds: Object.entries(selectedGroups).filter(([, v]) => v).map(([k]) => k),
      });
      setConfirming(false);
      banner.show(t('inviteSentBody'), 'success');
      router.back();
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      banner.show(t(code, { defaultValue: t('unknown_error') }));
    }
  };

  const header = (
    <View style={styles.header}>
      {/* UX-COMM-22 opens with the two ways to invite someone who is not
          searchable yet — sharing a link reaches people with no account. */}
      <View style={styles.shareRow}>
        <Button
          label={t('shareCommunity')}
          variant="secondary"
          style={styles.shareButton}
          onPress={() => void shareCommunity(id, community?.name ?? '')}
          testID="invite-share"
        />
        <Button
          label={t('copyLink')}
          variant="secondary"
          style={styles.shareButton}
          onPress={async () => {
            await copyCommunityLink(id);
            banner.show(t('linkCopied'), 'success');
          }}
          testID="invite-copy-link"
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
        testID="invite-search"
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
                onPress={() => toggleSelect(p)}
                testID={`invite-chip-${p.id}`}
              />
            );
          })}
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="edit" title={t('manageInvite')} onClose={() => router.back()} dirty={dirty} />
      {/*
        The search field holds focus for the whole task — you type a name, tap a
        result, type the next one — so the keyboard is up at the moment the CTA
        matters. Pinned to the bottom of the SafeAreaView it sat at y=773 with
        the keyboard covering everything from y=583: not merely hidden, but
        ABSENT from the accessibility tree, and with no caption anywhere on this
        screen to tap to dismiss.
      */}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={results}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={listEmptyContent}
          ListHeaderComponent={header}
          ListEmptyComponent={
            isFetching ? (
              <View style={styles.center}>
                <ActivityIndicator color={colors.foreground} />
              </View>
            ) : term.trim().length > 0 ? (
              <EmptyState
                fill
                icon={emptyIcon('magnifyingglass')}
                title={t('inviteNoResults')}
                body={t('manageInviteEmptyBody')}
                testID="empty-invite"
              />
            ) : (
              <EmptyState
                fill
                icon={emptyIcon('magnifyingglass')}
                title={t('inviteSearchHint')}
                testID="empty-invite-hint"
              />
            )
          }
          renderItem={({ item }) => {
            const name = item.full_name ?? '—';
            return (
              <ListRow
                title={name}
                variant="plain"
                onPress={() => toggleSelect(item)}
                leading={
                  <Avatar uri={avatarUrl(item.avatar_url)} name={name} colourKey={item.id} size="md" decorative />
                }
                trailing={
                  // A CHECKBOX, not a radio (UX-COMM-22): several people at once.
                  // The row owns the press, so the box is decorative here.
                  <Checkbox
                    checked={!!selected[item.id]}
                    onChange={() => toggleSelect(item)}
                    accessibilityLabel={name}
                    testID={`invite-check-${item.id}`}
                  />
                }
                testID={`invite-row-${item.id}`}
              />
            );
          }}
        />

        <View style={[styles.footer, { paddingBottom: insets.bottom + space[2] }]}>
          <Button
            label={t('inviteCta', { count: selectedList.length })}
            size="lg"
            fullWidth
            disabled={selectedList.length === 0 || invite.isPending}
            onPress={() => setConfirming(true)}
            testID="invite-submit"
          />
        </View>
      </KeyboardAvoidingView>

      <InviteConfirmSheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        count={selectedList.length}
        groups={groupList}
        selected={selectedGroups}
        onToggle={(gid) => setSelectedGroups((s) => ({ ...s, [gid]: !s[gid] }))}
        onConfirm={() => void doInvite()}
        pending={invite.isPending}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: space[6] },
  header: { paddingHorizontal: space[4], paddingTop: space[3], gap: space[3] },
  shareRow: { flexDirection: 'row', gap: space[3] },
  shareButton: { flex: 1 },
  orRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  footer: {
    paddingHorizontal: space[4],
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
});
