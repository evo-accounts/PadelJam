/**
 * "I need a partner" (UX-JEVT-11), from the Team Event sheet or an interested player's
 * "Edit response → I need a partner".
 *
 * Lists the other players who are also looking (candidates marked interested). "Invite" sends a
 * partner request at once (`request_partner`, 0112) and turns into "Invited"; tapping "Invited"
 * withdraws it (`withdraw_partner_request`). Whoever accepts first becomes the partner and every
 * other request is closed by the server. "Confirm" and "Let others invite me" end in the same
 * state — the viewer is interested, holding no spot — and return to the event.
 *
 * A private-event invitee who has not answered yet accepts the invitation first: on a team event
 * `accept_event_invitation` only marks them interested (it never confirms anyone), and doing it
 * here keeps their invitation from lingering as pending while they look.
 */
import {
  useAcceptEventInvitation,
  useEvent,
  useEventInvitations,
  useEventPartnerCandidates,
  usePartnerRequests,
  useRequestPartner,
  useWithdrawPartnerRequest,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { avatarUrl } from '@/lib/community-images';
import { filterByName, lookingForPartner, sentRequestTo } from '@/lib/eventPartners';
import { useGoBack } from '@/lib/useGoBack';
import { colors, space } from '../../../theme';
import {
  Avatar,
  Button,
  EmptyState,
  emptyIcon,
  ListRow,
  listEmptyContent,
  SearchInput,
  Text,
  TopBar,
  useBanner,
} from '../../../components/ui';

export default function NeedPartnerScreen() {
  const { t } = useT('event');
  const goBack = useGoBack();
  const banner = useBanner();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useSession().session?.user.id;

  const { data: event } = useEvent(id);
  const { data: invitations } = useEventInvitations(id);
  const candidates = useEventPartnerCandidates(id);
  const { data: requests } = usePartnerRequests(id);

  const accept = useAcceptEventInvitation();
  const request = useRequestPartner(id);
  const withdraw = useWithdrawPartnerRequest(id);

  const [query, setQuery] = useState('');
  // The row being sent / withdrawn, so only its button spins.
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [finishing, setFinishing] = useState<'confirm' | 'others' | null>(null);

  const looking = lookingForPartner(candidates.data ?? []);
  const rows = filterByName(looking, query);
  const pendingInvite = (invitations ?? []).some((i) => i.invitee_id === uid && i.status === 'pending');

  const fail = (e: unknown) => banner.show(t(e instanceof Error ? e.message : 'unknown_error'));

  const ensureAccepted = async () => {
    if (!pendingInvite) return;
    await accept.mutateAsync({ eventId: id, groupId: event?.group_id ?? null });
  };

  const onToggle = async (targetId: string) => {
    if (rowBusy != null) return;
    setRowBusy(targetId);
    try {
      const sent = sentRequestTo(requests ?? [], uid, targetId);
      if (sent) {
        await withdraw.mutateAsync(sent.id);
      } else {
        await ensureAccepted();
        await request.mutateAsync([targetId]);
      }
    } catch (e) {
      fail(e);
    } finally {
      setRowBusy(null);
    }
  };

  const onFinish = async (kind: 'confirm' | 'others') => {
    setFinishing(kind);
    try {
      await ensureAccepted();
      // An empty list lists the viewer as looking without asking anyone (idempotent when they
      // already are).
      await request.mutateAsync([]);
      goBack();
    } catch (e) {
      fail(e);
    } finally {
      setFinishing(null);
    }
  };

  let body: React.ReactNode;
  if (candidates.isLoading) {
    body = <ActivityIndicator color={colors.foreground} style={styles.loading} />;
  } else if (candidates.isError) {
    body = (
      <EmptyState
        tone="error"
        title={t('loadError')}
        action={{ label: t('retry', { ns: 'common' }), onPress: () => void candidates.refetch() }}
        testID="need-partner-error"
      />
    );
  } else if (looking.length === 0) {
    body = (
      <EmptyState
        icon={emptyIcon('person.2')}
        title={t('needPartnerEmpty')}
        body={t('needPartnerEmptyBody')}
        testID="need-partner-empty"
      />
    );
  } else if (rows.length === 0) {
    body = <EmptyState icon={emptyIcon('magnifyingglass')} title={t('partnerSearchEmpty')} testID="need-partner-no-match" />;
  } else {
    body = rows.map((c) => {
      const name = c.full_name ?? '—';
      const invited = sentRequestTo(requests ?? [], uid, c.id) != null;
      return (
        <ListRow
          key={c.id}
          title={name}
          leading={<Avatar uri={avatarUrl(c.avatar_url)} name={name} colourKey={c.id} size="md" decorative />}
          trailingInteractive
          trailing={
            <Button
              label={invited ? t('partnerInvitedCta') : t('partnerInviteCta')}
              variant={invited ? 'outline' : 'primary'}
              size="sm"
              loading={rowBusy === c.id}
              disabled={rowBusy != null && rowBusy !== c.id}
              accessibilityLabel={invited ? t('partnerWithdrawLabel', { name }) : t('partnerInviteLabel', { name })}
              onPress={() => void onToggle(c.id)}
              testID={`need-partner-invite-${c.id}`}
            />
          }
        />
      );
    });
  }

  const busy = finishing != null || rowBusy != null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar onBack={goBack} backLabel={t('back')} title={t('needPartnerTitle')} />
      <View style={styles.head}>
        <Text variant="body" tone="muted">
          {t('needPartnerSubtitle')}
        </Text>
        <SearchInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('partnerSearchPlaceholder')}
          autoCorrect={false}
          testID="need-partner-search"
        />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, rows.length === 0 && listEmptyContent]}
        keyboardShouldPersistTaps="handled"
      >
        {body}
      </ScrollView>

      <View style={styles.bottomBar}>
        <Button
          label={t('confirmCta')}
          fullWidth
          loading={finishing === 'confirm'}
          disabled={busy}
          onPress={() => void onFinish('confirm')}
          testID="need-partner-confirm"
        />
        <Button
          label={t('letOthersInviteCta')}
          variant="outline"
          fullWidth
          loading={finishing === 'others'}
          disabled={busy}
          onPress={() => void onFinish('others')}
          testID="need-partner-let-others"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  head: { paddingHorizontal: space[4], paddingTop: space[2], gap: space[3] },
  content: { paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[6] },
  loading: { paddingVertical: space[6] },
  bottomBar: {
    paddingHorizontal: space[4],
    paddingTop: space[3],
    paddingBottom: space[6],
    gap: space[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
});
