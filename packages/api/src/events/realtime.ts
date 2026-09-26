import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDb } from '../client';
import { qk } from '../query-keys';
import { uniqueChannelTopic } from '../realtime-channel';

export const useEventRealtime = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  useEffect(() => {
    const filter = 'event_id=eq.' + eventId;
    const ch = db
      .channel(uniqueChannelTopic('event:' + eventId))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_participants', filter },
        () => {
          qc.invalidateQueries({ queryKey: qk.eventParticipants(eventId) });
          qc.invalidateQueries({ queryKey: qk.event(eventId) });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events', filter: 'id=eq.' + eventId },
        () => {
          qc.invalidateQueries({ queryKey: qk.event(eventId) });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_invitations', filter },
        () => {
          qc.invalidateQueries({ queryKey: qk.eventInvitations(eventId) });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_teams', filter },
        () => {
          qc.invalidateQueries({ queryKey: qk.eventTeams(eventId) });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'partner_requests', filter },
        () => {
          qc.invalidateQueries({ queryKey: qk.partnerRequests(eventId) });
          qc.invalidateQueries({ queryKey: qk.incomingPartnerRequests });
        },
      )
      // Filtered Postgres Changes never deliver DELETEs (the old row carries only its primary key,
      // so the event_id filter cannot match), and a withdrawn request or a leaver's requests are
      // deleted (0111). Listen for DELETEs unfiltered: this fires for a deletion on ANY event, which
      // only costs a refetch of lists that RLS already scopes to the viewer.
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'partner_requests' },
        () => {
          qc.invalidateQueries({ queryKey: qk.partnerRequests(eventId) });
          qc.invalidateQueries({ queryKey: qk.incomingPartnerRequests });
          qc.invalidateQueries({ queryKey: qk.partnerRequestSummary });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_rounds', filter },
        () => {
          qc.invalidateQueries({ queryKey: qk.eventRounds(eventId) });
          qc.invalidateQueries({ queryKey: qk.eventStandings(eventId) });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_matches', filter },
        () => {
          qc.invalidateQueries({ queryKey: qk.eventMatches(eventId) });
          qc.invalidateQueries({ queryKey: qk.eventStandings(eventId) });
        },
      )
      // match_players has no event_id column, so it can't be filtered by event;
      // subscribe unfiltered and refresh the matches/standings for this event.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'match_players' },
        () => {
          qc.invalidateQueries({ queryKey: qk.eventMatches(eventId) });
          qc.invalidateQueries({ queryKey: qk.eventStandings(eventId) });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'event_timer', filter },
        () => {
          qc.invalidateQueries({ queryKey: qk.eventTimer(eventId) });
        },
      )
      .subscribe();
    return () => {
      db.removeChannel(ch);
    };
  }, [db, qc, eventId]);
};
