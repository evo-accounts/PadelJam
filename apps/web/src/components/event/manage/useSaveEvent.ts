'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@padel/auth';
import {
  buildUpdateEventPayload,
  mapPgError,
  qk,
  updateEventSchema,
  useDb,
  type EventDetail,
  type UpdateEventScope,
} from '@padel/api';
import { uploadCommunityImage } from '@/lib/upload';

import { updateValues, type ManageDraft } from './eventDraft';

// Mirrors the generated `Json` scalar from @padel/db (not re-exported there), as @padel/api does.
type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

/**
 * `event_courts` as the key mobile's `useEventCourts` will use, so both share one cache entry once
 * that hook lands in `@padel/api` (PR #241). Kept here so a web-only PR does not touch packages.
 */
const eventCourtsKey = (id: string) => ['event', id, 'courts'] as const;

/**
 * The registry courts an event uses, as ids — what Edit Location & Courts (and Duplicate) start
 * from when the organizer picked courts at a venue (UX-MEVT-07).
 */
export function useEventCourts(eventId: string) {
  const db = useDb();
  return useQuery({
    queryKey: eventCourtsKey(eventId),
    enabled: !!eventId,
    queryFn: async () => {
      const { data, error } = await db.from('event_courts').select('court_id').eq('event_id', eventId);
      if (error) throw error;
      return (data ?? []).map((r) => r.court_id);
    },
  });
}

/**
 * Saves a Manage Event dialog's draft through `update_event`. The draft is the WHOLE event
 * (`draftFromEvent`), because update_event replaces every editable column. Throws an i18n error
 * code (`name_required`, `courts_below_roster`, …) for the dialog to show.
 *
 * `thumbnail`: a newly picked file (uploaded first), or `null` when the image was removed.
 * `courts`: Edit Location & Courts only — also sends the courts (see `updateValues`).
 * `scope`: a recurring event's answer to "this occurrence only / this and upcoming" (UX-MEVT-08/22,
 * update_event's p_scope, 0123); omitted = only this one.
 *
 * The RPC is called here rather than through `useUpdateEvent` because `updateEventSchema` does not
 * carry `manual_court_names` yet (added with PR #241); the payload is otherwise the shared builder's.
 */
export function useSaveEvent(event: EventDetail) {
  const uid = useSession().session?.user.id;
  const db = useDb();
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({ payload, scope }: { payload: Record<string, unknown>; scope: UpdateEventScope }) => {
      const { error } = await db.rpc('update_event', {
        p_event_id: event.id,
        p_payload: payload as Json,
        p_scope: scope,
      });
      if (error) throw new Error(mapPgError(error) ?? 'unknown_error');
    },
    onSuccess: (_d, { scope }) => {
      // 'this_and_upcoming' also rewrites the later occurrences (other event ids): refresh them all.
      if (scope === 'this_and_upcoming') qc.invalidateQueries({ queryKey: ['event'] });
      qc.invalidateQueries({ queryKey: qk.event(event.id) });
      qc.invalidateQueries({ queryKey: qk.myEventsAll });
      if (event.group_id) qc.invalidateQueries({ queryKey: qk.events(event.group_id) });
      qc.invalidateQueries({ queryKey: qk.eventActivity(event.id) });
      qc.invalidateQueries({ queryKey: eventCourtsKey(event.id) });
    },
  });

  return async (
    d: ManageDraft,
    opts: { thumbnail?: File | null; courts?: { courtName: (n: number) => string }; scope?: UpdateEventScope } = {},
  ): Promise<void> => {
    let thumbnailPath: string | null | undefined;
    if (opts.thumbnail === null) thumbnailPath = null;
    else if (opts.thumbnail && uid) thumbnailPath = await uploadCommunityImage(opts.thumbnail, uid, 'event-thumbnails');
    const { values, extra } = updateValues(d, { thumbnailPath, courts: opts.courts });
    const parsed = updateEventSchema.safeParse(values);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'unknown_error');
    await mutation.mutateAsync({
      payload: { ...buildUpdateEventPayload(parsed.data), ...extra },
      scope: opts.scope ?? 'only_this',
    });
  };
}
