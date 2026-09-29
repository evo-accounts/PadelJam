/**
 * Manage players (UX-MEVT-10..13, 25) — reached from the event page's "Manage players" row and the
 * dashboard's Confirmed card. Who is coming, never who has paid (that is `payments.tsx`).
 *
 * Header: back, "Manage players", and one action (UX-MEVT-13) — Add manually on a public group
 * event, where every member may already join; Invite otherwise (private group or group-less).
 *
 * Tabs: Confirmed n/capacity · Waiting list n (only once full or while anyone queues, UX-MEVT-12)
 * · Invited n. A mixed event splits Confirmed into Women x/y and Men x/y (UX-MEVT-25), and labels
 * each waiting player's side.
 *
 * Actions, per SwipeRow's rules: a swipe reveals ONE action, and the same actions (plus the
 * profile) are on the row's tap sheet, so nothing is swipe-only.
 *   Confirmed    — Remove → sheet: "Remove from confirmed list" (back to invited) and "Remove from
 *                  event"; a public group event has no invited state, so only the latter (D3).
 *   Invited      — Mark as confirmed (a roster row: organizer_mark_confirmed; an invitee without
 *                  one: organizer_confirm_invitee) and Remove.
 *   Waiting list — Remove only, in queue order (D2: the organizer never confirms a waiting player).
 * Every action needs a scheduled event; after that the lists are read-only.
 *
 * Team events: the Confirmed tab is still the team builder (TeamManage) and Mark as confirmed is
 * hidden — confirming there means picking a team, which is M3's team management (UX-MEVT-14/15).
 */
import {
  useConfirmInvitee,
  useEvent,
  useEventInvitedPlayers,
  useEventParticipants,
  useMarkConfirmed,
  useRemoveParticipant,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddManualSheet } from '@/components/event/manage/AddManualSheet';
import {
  headerAction,
  invitedActions,
  manageRoster,
  removeModes,
  rosterErrorKey,
  rowsOfSide,
  type ManageRow,
  type ManageSide,
} from '@/components/event/manage/manageRoster';
import { TeamManage } from '@/components/event/TeamManage';
import { avatarUrl } from '@/lib/community-images';
import { useGoBack } from '@/lib/useGoBack';
import { colors, space } from '../../../theme';
import {
  Avatar,
  Badge,
  EmptyState,
  emptyIcon,
  ListRow,
  listEmptyContent,
  Segmented,
  SwipeRow,
  TopBar,
  useActionSheet,
  useBanner,
  useConfirm,
  type SheetAction,
} from '../../../components/ui';

type Tab = 'confirmed' | 'waiting' | 'invited';

export default function ManagePlayersScreen() {
  const { t } = useT('event');
  const router = useRouter();
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useSession().session?.user.id;
  const show = useActionSheet();
  const confirm = useConfirm();
  const banner = useBanner();

  const { data: event, isLoading } = useEvent(id);
  const participants = useEventParticipants(id);
  const invitedQuery = useEventInvitedPlayers(id);
  const markConfirmed = useMarkConfirmed(id);
  const confirmInvitee = useConfirmInvitee(id);
  const removeParticipant = useRemoveParticipant(id);

  const [picked, setPicked] = useState<Tab>('confirmed');
  const [side, setSide] = useState<ManageSide>('female');
  const [addingManual, setAddingManual] = useState(false);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }

  if (event == null || uid == null || uid !== event.organizer_id) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TopBar onBack={goBack} backLabel={t('back')} title={t('managePlayersTitle')} />
        <EmptyState fill title={t('forbidden')} testID="manage-players-forbidden" />
      </SafeAreaView>
    );
  }

  const roster = manageRoster(event, participants.data ?? [], invitedQuery.data ?? []);
  const scheduled = event.status === 'scheduled';
  const team = event.specification === 'team';
  const mixed = event.specification === 'mixed';
  const action = headerAction(event);
  // The waiting list can empty while its tab is open (a claim, a removal): fall back to Confirmed.
  const tab: Tab = picked === 'waiting' && !roster.showWaiting ? 'confirmed' : picked;

  const openInvite = () => router.push(`/event/${id}/invite` as Href);
  const openAdd = () => (action === 'invite' ? openInvite() : setAddingManual(true));
  const openProfile = (userId: string) => router.push(`/profile/${userId}` as Href);
  const nameOf = (row: ManageRow) => row.name ?? '—';

  const fail = (e: unknown) => {
    const code = e instanceof Error ? e.message : 'unknown_error';
    banner.show(t(rosterErrorKey(code), { defaultValue: t('unknown_error') }));
  };

  const remove = async (row: ManageRow, mode: 'to_invited' | 'from_event') => {
    if (row.participantId == null) return;
    try {
      await removeParticipant.mutateAsync({ participantId: row.participantId, mode, targetName: row.name ?? undefined });
      banner.show(t(mode === 'to_invited' ? 'mpMovedToInvitedToast' : 'mpRemovedToast', { name: nameOf(row) }), 'success');
    } catch (e) {
      fail(e);
    }
  };

  /** The Confirmed tab's remove sheet: the sheet itself is the confirmation (UX-MEVT-10). */
  const removeOptions = (): SheetAction[] =>
    removeModes(event).map((mode) =>
      mode === 'to_invited'
        ? { key: 'to_invited', label: t('mpRemoveToInvited') }
        : // selfConfirm: choosing it in this sheet IS the confirmation; a second sheet would ask twice.
          { key: 'from_event', label: t('mpRemoveFromEvent'), destructive: true, selfConfirm: true },
    );

  const askRemoveConfirmed = async (row: ManageRow) => {
    const key = await show({ title: t('mpRemoveTitle', { name: nameOf(row) }), actions: removeOptions() });
    if (key === 'to_invited' || key === 'from_event') await remove(row, key);
  };

  /** Waiting list and Invited rows leave the event only — one confirmation, naming the player. */
  const askRemoveFromEvent = async (row: ManageRow) => {
    const ok = await confirm({
      title: t('mpRemoveTitle', { name: nameOf(row) }),
      body: t('mpRemoveFromEventBody'),
      confirmLabel: t('mpRemoveFromEvent'),
      destructive: true,
    });
    if (ok) await remove(row, 'from_event');
  };

  const markAsConfirmed = async (row: ManageRow) => {
    try {
      if (row.participantId != null) {
        await markConfirmed.mutateAsync({ participantId: row.participantId, targetName: row.name ?? undefined });
      } else if (row.userId != null) {
        await confirmInvitee.mutateAsync({ userId: row.userId });
      } else {
        return;
      }
      banner.show(t('mpConfirmedToast', { name: nameOf(row) }), 'success');
    } catch (e) {
      fail(e);
    }
  };

  const openRowSheet = async (row: ManageRow, kind: Tab) => {
    const actions: SheetAction[] = [];
    if (row.userId != null && !row.guest) actions.push({ key: 'profile', label: t('mpSeeProfile') });
    if (scheduled && kind === 'confirmed') actions.push(...removeOptions());
    if (scheduled && kind === 'invited') {
      const can = invitedActions(row, { team });
      if (can.confirm) actions.push({ key: 'confirm', label: t('mpMarkConfirmed') });
      if (can.remove) actions.push({ key: 'remove', label: t('mpRemoveFromEvent'), destructive: true, selfConfirm: true });
    }
    if (scheduled && kind === 'waiting') {
      actions.push({ key: 'remove', label: t('mpRemoveFromEvent'), destructive: true, selfConfirm: true });
    }
    if (actions.length === 0) return;
    if (actions.length === 1 && actions[0]!.key === 'profile' && row.userId) {
      openProfile(row.userId);
      return;
    }
    const key = await show({ title: nameOf(row), actions });
    if (key === 'profile' && row.userId) openProfile(row.userId);
    else if (key === 'to_invited' || key === 'from_event') await remove(row, key);
    else if (key === 'confirm') await markAsConfirmed(row);
    else if (key === 'remove') await askRemoveFromEvent(row);
  };

  /** The one action a swipe reveals, or null for a row with nothing to do. */
  const swipeOf = (row: ManageRow, kind: Tab): { label: string; run: () => void; destructive: boolean } | null => {
    if (!scheduled) return null;
    if (kind === 'confirmed') return { label: t('removeCta'), run: () => void askRemoveConfirmed(row), destructive: true };
    if (kind === 'waiting') return { label: t('removeCta'), run: () => void askRemoveFromEvent(row), destructive: true };
    const can = invitedActions(row, { team });
    if (can.confirm) return { label: t('mpMarkConfirmed'), run: () => void markAsConfirmed(row), destructive: false };
    if (can.remove) return { label: t('removeCta'), run: () => void askRemoveFromEvent(row), destructive: true };
    return null;
  };

  const sideLabel = (s: ManageSide | null) => (s === 'female' ? t('mpSideFemale') : s === 'male' ? t('mpSideMale') : undefined);

  const renderRow = (row: ManageRow, kind: Tab, index: number) => {
    const name = nameOf(row);
    const subtitle =
      kind === 'waiting'
        ? [t('mpQueuePosition', { n: index + 1 }), mixed ? sideLabel(row.side) : undefined].filter(Boolean).join(' · ')
        : row.standby
          ? t('playersListStandby')
          : undefined;
    const swipe = swipeOf(row, kind);
    const hasSheet = scheduled || (row.userId != null && !row.guest);
    const content = (
      <ListRow
        title={name}
        subtitle={subtitle}
        leading={<Avatar uri={avatarUrl(row.avatarPath)} name={name} colourKey={row.userId ?? row.key} size="md" decorative />}
        trailing={row.guest ? <Badge label={t('guestTag')} /> : undefined}
        onPress={hasSheet ? () => void openRowSheet(row, kind) : undefined}
        // Only a pressable row is an accessibility element; a plain View's testID never reaches E2E.
        testID={hasSheet ? `manage-player-${row.key}` : undefined}
      />
    );
    return swipe ? (
      <SwipeRow key={row.key} actionLabel={swipe.label} onAction={swipe.run} destructive={swipe.destructive}>
        {content}
      </SwipeRow>
    ) : (
      <View key={row.key}>{content}</View>
    );
  };

  const tabOptions = [
    { value: 'confirmed' as const, label: t('mpTabConfirmed', { n: roster.confirmed.length, capacity: roster.capacity }) },
    ...(roster.showWaiting ? [{ value: 'waiting' as const, label: t('mpTabWaiting', { n: roster.waiting.length }) }] : []),
    {
      value: 'invited' as const,
      // No count until the list has loaded: "Invited 0" would claim nobody is invited.
      label: invitedQuery.data ? t('mpTabInvited', { n: roster.invited.length }) : t('playersTabInvitedPlain'),
    },
  ];

  const addAction =
    scheduled
      ? { label: action === 'invite' ? t('mpInviteCta') : t('addManuallyCta'), onPress: openAdd, testID: 'manage-players-empty-add' }
      : undefined;

  let rows: ManageRow[] = [];
  let empty: React.ReactNode = null;
  if (tab === 'confirmed') {
    rows = mixed ? rowsOfSide(roster.confirmed, side) : roster.confirmed;
    if (rows.length === 0) {
      empty = (
        <EmptyState
          icon={emptyIcon('person.2')}
          title={mixed ? t(side === 'female' ? 'mpWomenEmpty' : 'mpMenEmpty') : t('mpConfirmedEmpty')}
          body={t('mpConfirmedEmptyBody')}
          action={addAction}
          testID="manage-players-confirmed-empty"
        />
      );
    }
  } else if (tab === 'waiting') {
    rows = roster.waiting;
    if (rows.length === 0) {
      empty = (
        <EmptyState
          icon={emptyIcon('person.badge.clock')}
          title={t('mpWaitingEmpty')}
          body={t('mpWaitingEmptyBody')}
          testID="manage-players-waiting-empty"
        />
      );
    }
  } else {
    rows = roster.invited;
    if (rows.length === 0) {
      empty = (
        <EmptyState
          icon={emptyIcon('person.badge.clock')}
          title={t('playersInvitedEmpty')}
          body={action === 'invite' ? t('mpInvitedEmptyBody') : t('mpInvitedEmptyPublicBody')}
          action={action === 'invite' ? addAction : undefined}
          testID="manage-players-invited-empty"
        />
      );
    }
  }

  const loading = participants.isLoading || (tab === 'invited' && invitedQuery.isLoading);
  const teamBuilder = team && tab === 'confirmed';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar
        onBack={goBack}
        backLabel={t('back')}
        title={t('managePlayersTitle')}
        actions={
          scheduled
            ? [
                {
                  icon: '+',
                  label: action === 'invite' ? t('mpInviteCta') : t('addManuallyCta'),
                  onPress: openAdd,
                  testID: 'manage-players-add',
                },
              ]
            : []
        }
      />
      <View style={styles.head}>
        <Segmented options={tabOptions} value={tab} onChange={setPicked} singleLine testID="manage-players-tabs" />
        {mixed && tab === 'confirmed' && roster.sideCounts && roster.perSide != null ? (
          <Segmented
            options={[
              { value: 'female' as const, label: t('mpSideWomen', { n: roster.sideCounts.female, cap: roster.perSide }) },
              { value: 'male' as const, label: t('mpSideMen', { n: roster.sideCounts.male, cap: roster.perSide }) },
            ]}
            value={side}
            onChange={setSide}
            singleLine
            testID="manage-players-side"
          />
        ) : null}
      </View>
      <ScrollView contentContainerStyle={[styles.content, !teamBuilder && empty != null && listEmptyContent]}>
        {loading ? (
          <ActivityIndicator color={colors.foreground} style={styles.loading} />
        ) : teamBuilder ? (
          <TeamManage eventId={id} numCourts={event.num_courts} participants={participants.data ?? []} />
        ) : (
          (empty ?? rows.map((row, i) => renderRow(row, tab, i)))
        )}
      </ScrollView>

      {addingManual ? (
        <AddManualSheet
          eventId={id}
          mixed={mixed}
          onClose={() => setAddingManual(false)}
          onAdded={(name) => {
            setAddingManual(false);
            setPicked('confirmed');
            banner.show(t('mpManualAddedToast', { name }), 'success');
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  head: { paddingHorizontal: space[4], paddingTop: space[3], gap: space[2] },
  content: { paddingHorizontal: space[4], paddingTop: space[2], paddingBottom: space[8] },
  loading: { paddingVertical: space[6] },
});
