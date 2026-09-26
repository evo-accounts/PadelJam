/**
 * Partner Requests (UX-JEVT-12), from the "Partner Requests" row at the top of Notifications.
 *
 * Only invitations received from other players — this is never an entry point for joining a team
 * event (that is the event's "Join" → Team Event sheet). Grouped by event: the event name, then its
 * date · time · place; each row the requester's photo and name with Decline and Accept.
 *
 *   Accept   a confirmation sheet first: accepting confirms the pair and silently declines every
 *            other partner request the viewer has for that event (accept_partner_request, 0111/0112).
 *   Decline  removes the row; the requester is not told (decline_partner_request).
 *
 * `incoming_partner_requests` (0098) also carries the community join requests an admin answers.
 * They are not partner invitations, so they sit in their own section below the events.
 */
import {
  useIncomingPartnerRequests,
  useRespondToRequest,
  type IncomingPartnerRequest,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { avatarUrl } from '@/lib/community-images';
import { eventSubtitle } from '@/lib/eventFormat';
import { requestSections } from '@padel/utils';
import { useGoBack } from '@/lib/useGoBack';
import { colors, space } from '../../theme';
import {
  Avatar,
  Button,
  EmptyState,
  emptyIcon,
  ListRow,
  listEmptyContent,
  Text,
  TopBar,
  useBanner,
  useConfirm,
} from '../../components/ui';

export default function PartnerRequestsScreen() {
  const { t, i18n } = useT('notifications');
  const goBack = useGoBack();
  const list = useIncomingPartnerRequests();
  const respond = useRespondToRequest();
  const confirm = useConfirm();
  const banner = useBanner();

  const rows = list.data ?? [];
  const sections = requestSections(rows);

  const errorText = (e: unknown) => {
    const code = e instanceof Error ? e.message : 'unknown_error';
    return t(code, { defaultValue: t('respondError') });
  };

  const respondTo = async (item: IncomingPartnerRequest, action: 'accept' | 'decline') => {
    try {
      const result = await respond.mutateAsync({
        kind: item.kind,
        requestId: item.request_id,
        action,
        entityId: item.entity_id,
      });
      if (item.kind === 'event' && action === 'accept') {
        banner.show(
          result === 'waiting_list'
            ? t('partnerAcceptedWaitlist', { entity: item.entity_name })
            : t('partnerAcceptedToast', { entity: item.entity_name }),
          'success',
        );
      }
    } catch (e) {
      banner.show(errorText(e));
    }
  };

  const onAccept = async (item: IncomingPartnerRequest) => {
    if (item.kind === 'event') {
      const ok = await confirm({
        title: t('partnerAcceptTitle'),
        body: t('partnerAcceptBody', { name: item.requester_name ?? '—', entity: item.entity_name }),
        confirmLabel: t('accept'),
      });
      if (!ok) return;
    }
    await respondTo(item, 'accept');
  };

  const onDecline = async (item: IncomingPartnerRequest) => {
    // A community join request keeps its confirmation; a partner request is declined silently.
    if (item.kind === 'community') {
      const ok = await confirm({
        title: t('declineTitle'),
        body: t('declineBody'),
        confirmLabel: t('decline'),
        destructive: true,
      });
      if (!ok) return;
    }
    await respondTo(item, 'decline');
  };

  const renderRow = (item: IncomingPartnerRequest) => {
    const name = item.requester_name ?? '—';
    return (
      <ListRow
        key={item.request_id}
        variant="card"
        title={name}
        subtitle={item.kind === 'community' ? t('joinRequestLabel', { entity: item.entity_name }) : undefined}
        leading={
          <Avatar uri={avatarUrl(item.requester_avatar)} name={name} colourKey={item.requester_id} size="md" decorative />
        }
        trailing={
          <View style={styles.actions}>
            <Button
              label={t('decline')}
              variant="outline"
              size="sm"
              disabled={respond.isPending}
              accessibilityLabel={t('declineFrom', { name })}
              onPress={() => void onDecline(item)}
              testID={`partner-request-decline-${item.request_id}`}
            />
            <Button
              label={t('accept')}
              size="sm"
              disabled={respond.isPending}
              accessibilityLabel={t('acceptFrom', { name })}
              onPress={() => void onAccept(item)}
              testID={`partner-request-accept-${item.request_id}`}
            />
          </View>
        }
      />
    );
  };

  let body: React.ReactNode;
  if (list.isLoading) {
    body = <ActivityIndicator color={colors.foreground} style={styles.loading} />;
  } else if (list.isError) {
    body = (
      <EmptyState
        fill
        tone="error"
        title={t('requestsError')}
        action={{ label: t('retry', { ns: 'common' }), onPress: () => void list.refetch() }}
        testID="empty-partner-requests"
      />
    );
  } else if (sections.length === 0) {
    body = (
      <EmptyState
        fill
        icon={emptyIcon('person.badge.clock')}
        title={t('requestsEmpty')}
        body={t('partnerRequestsEmptyBody')}
        testID="empty-partner-requests"
      />
    );
  } else {
    body = sections.map((s) => {
      if (s.kind === 'community') {
        return (
          <View key="community" style={styles.section}>
            <Text variant="sectionTitle" accessibilityRole="header">
              {t('joinRequestsSection')}
            </Text>
            {s.requests.map(renderRow)}
          </View>
        );
      }
      // incoming_partner_requests carries the event's date and place on every event row (0113).
      const ev = s.requests[0]!;
      const placeName = ev.venue_name ?? ev.manual_location_name ?? ev.manual_location_address;
      return (
        <View key={s.eventId} style={styles.section}>
          <View style={styles.heading}>
            <Text variant="sectionTitle" accessibilityRole="header">
              {s.eventName}
            </Text>
            {ev.starts_at ? (
              <Text variant="caption" tone="muted">
                {eventSubtitle(ev.starts_at, placeName, i18n.language)}
              </Text>
            ) : null}
          </View>
          {s.requests.map(renderRow)}
        </View>
      );
    });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar title={t('partnerRequests')} onBack={goBack} />
      <ScrollView contentContainerStyle={[styles.content, sections.length === 0 && listEmptyContent]}>
        {body}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: space[4], paddingBottom: space[8] },
  loading: { marginTop: space[8] },
  section: { paddingTop: space[4], gap: space[2] },
  heading: { gap: space[1] },
  actions: { flexDirection: 'row', gap: space[2] },
});
