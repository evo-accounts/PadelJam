/**
 * Invite players (UX-MEVT-13), from the "+" in Manage players on a private group event or a
 * group-less one. A public group event has no invite action — every member may already join —
 * and a deep link to it lands on a "nobody to invite" state.
 *
 * Who is listed comes from `event_invite_candidates` (0122, plan D12), already sectioned:
 *   group event      Group members not yet invited or playing
 *   group-less event My connections (mutual follows), Following, then — only once a name is
 *                    typed — Others
 * Several can be picked; "Send invite" is fixed at the bottom. Someone who is not on the app is
 * added as a guest instead: "Add manually" sits under the search, and is the empty state's CTA.
 */
import { useEvent, useEventInviteCandidates, useInviteToEvent, type InviteCandidate, type InviteCandidateSection } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddManualSheet } from '@/components/event/manage/AddManualSheet';
import { isPublicGroupEvent, rosterErrorKey } from '@/components/event/manage/manageRoster';
import { avatarUrl } from '@/lib/community-images';
import { useGoBack } from '@/lib/useGoBack';
import { colors, space } from '../../../theme';
import {
  Avatar,
  Button,
  Checkbox,
  EmptyState,
  emptyIcon,
  ListRow,
  listEmptyContent,
  SearchInput,
  Text,
  TopBar,
  useBanner,
} from '../../../components/ui';

const SECTION_ORDER: InviteCandidateSection[] = ['members', 'connections', 'following', 'others'];
const SECTION_TITLE: Record<InviteCandidateSection, string> = {
  members: 'mpSectionMembers',
  connections: 'mpSectionConnections',
  following: 'mpSectionFollowing',
  others: 'mpSectionOthers',
};

export default function EventInviteScreen() {
  const { t } = useT('event');
  const router = useRouter();
  const goBack = useGoBack();
  const insets = useSafeAreaInsets();
  const banner = useBanner();
  const uid = useSession().session?.user.id;
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: event, isLoading } = useEvent(id);
  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<Record<string, InviteCandidate>>({});
  const [addingManual, setAddingManual] = useState(false);
  const invite = useInviteToEvent(id);

  useEffect(() => {
    const handle = setTimeout(() => setTerm(query), 300);
    return () => clearTimeout(handle);
  }, [query]);

  const allowed = event != null && uid === event.organizer_id && !isPublicGroupEvent(event);
  const candidates = useEventInviteCandidates(allowed ? id : '', term);

  const sections = useMemo(() => {
    const rows = candidates.data ?? [];
    return SECTION_ORDER.map((key) => ({ key, title: t(SECTION_TITLE[key]), data: rows.filter((r) => r.section === key) })).filter(
      (s) => s.data.length > 0,
    );
  }, [candidates.data, t]);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }

  if (!allowed || event.status !== 'scheduled') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TopBar onBack={goBack} backLabel={t('back')} title={t('mpInviteTitle')} />
        <EmptyState
          fill
          title={event != null && uid === event.organizer_id ? t('mpInviteNotAvailable') : t('forbidden')}
          body={event != null && isPublicGroupEvent(event) ? t('invites_not_allowed') : undefined}
          testID="event-invite-unavailable"
        />
      </SafeAreaView>
    );
  }

  const mixed = event.specification === 'mixed';
  const selectedList = Object.values(selected);
  const toggle = (p: InviteCandidate) =>
    setSelected((s) => {
      const next = { ...s };
      if (next[p.id]) delete next[p.id];
      else next[p.id] = p;
      return next;
    });

  const send = async () => {
    try {
      await invite.mutateAsync(selectedList.map((p) => ({ invitee_id: p.id })));
      banner.show(t('mpInviteSentToast', { count: selectedList.length }), 'success');
      goBack();
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      banner.show(t(rosterErrorKey(code), { defaultValue: t('unknown_error') }));
    }
  };

  const header = (
    <View style={styles.header}>
      <SearchInput
        value={query}
        onChangeText={setQuery}
        placeholder={t('mpInviteSearch')}
        accessibilityLabel={t('mpInviteSearch')}
        autoCorrect={false}
        testID="event-invite-search"
      />
      <Pressable
        style={styles.addManual}
        accessibilityRole="button"
        onPress={() => setAddingManual(true)}
        testID="event-invite-add-manually"
      >
        <Text variant="label" tone="primary">
          {t('addManuallyShort')}
        </Text>
      </Pressable>
    </View>
  );

  const searching = candidates.isFetching && (candidates.data ?? []).length === 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar onBack={goBack} backLabel={t('back')} title={t('mpInviteTitle')} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SectionList
          sections={sections}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.list, sections.length === 0 && listEmptyContent]}
          renderSectionHeader={({ section }) => (
            <Text variant="caption" tone="muted" style={styles.sectionTitle} accessibilityRole="header">
              {section.title}
            </Text>
          )}
          ListEmptyComponent={
            searching ? (
              <View style={styles.center}>
                <ActivityIndicator color={colors.foreground} />
              </View>
            ) : (
              <EmptyState
                fill
                icon={emptyIcon('magnifyingglass')}
                title={term.trim() ? t('mpInviteNoResults') : t('mpInviteNobody')}
                body={term.trim() ? t('mpInviteNoResultsBody') : t(event.group_id ? 'mpInviteNobodyGroupBody' : 'mpInviteNobodyBody')}
                action={{ label: t('addManuallyCta'), onPress: () => setAddingManual(true), testID: 'event-invite-empty-add' }}
                testID="event-invite-empty"
              />
            )
          }
          renderItem={({ item }) => {
            const name = item.full_name ?? '—';
            return (
              <ListRow
                title={name}
                onPress={() => toggle(item)}
                selected={!!selected[item.id]}
                leading={<Avatar uri={avatarUrl(item.avatar_url)} name={name} colourKey={item.id} size="md" decorative />}
                trailing={
                  <Checkbox
                    checked={!!selected[item.id]}
                    onChange={() => toggle(item)}
                    accessibilityLabel={name}
                    testID={`event-invite-check-${item.id}`}
                  />
                }
                testID={`event-invite-row-${item.id}`}
              />
            );
          }}
        />
        <View style={[styles.footer, { paddingBottom: insets.bottom + space[2] }]}>
          <Button
            label={selectedList.length > 1 ? t('mpSendInvites', { n: selectedList.length }) : t('mpSendInvite')}
            size="lg"
            fullWidth
            disabled={selectedList.length === 0}
            loading={invite.isPending}
            onPress={() => void send()}
            testID="event-invite-send"
          />
        </View>
      </KeyboardAvoidingView>

      {addingManual ? (
        <AddManualSheet
          eventId={id}
          mixed={mixed}
          onClose={() => setAddingManual(false)}
          onAdded={(name) => {
            setAddingManual(false);
            banner.show(t('mpManualAddedToast', { name }), 'success');
            // Back to Manage players, where the guest is on the Confirmed tab.
            router.back();
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', padding: space[6] },
  list: { paddingBottom: space[4] },
  header: { paddingHorizontal: space[4], paddingTop: space[3], gap: space[2] },
  addManual: { paddingVertical: space[3] },
  sectionTitle: { paddingHorizontal: space[4], paddingTop: space[4], paddingBottom: space[1] },
  footer: {
    paddingHorizontal: space[4],
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
});
