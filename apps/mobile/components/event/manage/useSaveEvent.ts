import { updateEventSchema, useUpdateEvent, type EventDetail } from '@padel/api';
import { useSession } from '@padel/auth';
import { geocodeQuery } from '@padel/utils';

import { geocodeAddress } from '@/lib/geocode';
import { uploadCommunityImage } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

import type { EventDraft } from '../wizard/draft';
import { locationChanged, updateValues } from './eventDraft';

/**
 * Saves a Manage Event sheet's draft through `update_event`. The draft is the WHOLE event
 * (`draftFromEvent`), because update_event replaces every editable column. Throws an i18n error
 * code (`name_required`, `courts_below_roster`, …) for the sheet to show.
 *
 * A newly picked thumbnail is uploaded first; a changed location is geocoded again so the event's
 * point follows it (a failed lookup keeps the stored point — update_event leaves it when no
 * coordinates are sent).
 */
export function useSaveEvent(event: EventDetail) {
  const uid = useSession().session?.user.id;
  const update = useUpdateEvent(event.id);

  return async (d: EventDraft, opts: { courts?: { courtName: (n: number) => string } } = {}): Promise<void> => {
    let thumbnailPath: string | undefined;
    if (d.thumbnail && uid) {
      thumbnailPath = await uploadCommunityImage(supabase, 'event-thumbnails', uid, d.thumbnail.uri, d.thumbnail.mimeType);
    }
    let coords: { lat: number; lng: number } | null = null;
    if (d.hasLocation && locationChanged(d, event)) {
      const q = geocodeQuery({ name: d.manualLocationName, address: d.manualLocationAddress });
      if (q) coords = await geocodeAddress(q).catch(() => null);
    }
    const parsed = updateEventSchema.safeParse(updateValues(d, { thumbnailPath, coords, courts: opts.courts }));
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'unknown_error');
    await update.mutateAsync({ values: parsed.data, groupId: event.group_id });
  };
}
