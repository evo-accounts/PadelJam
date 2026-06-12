import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDb } from '../client';
import { qk } from '../query-keys';

export const useEventRealtime = (eventId: string) => {
  const db = useDb();
  const qc = useQueryClient();
  useEffect(() => {
    const filter = 'event_id=eq.' + eventId;
    const ch = db
      .channel('event:' + eventId)
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
      .subscribe();
    return () => {
      db.removeChannel(ch);
    };
  }, [db, qc, eventId]);
};
