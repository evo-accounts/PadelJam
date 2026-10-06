'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { qk, useDb, useSetMyLocation, type LocationPoint } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { PlacePicker } from '@/components/community/PlacePicker';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toaster';
import { parseEwkbPoint, samePoint } from '@/lib/geo-point';

/**
 * The viewer's own place on web (UX-SET-02's location field): the label the profile shows and the
 * point Explore measures distance from. Mobile resolves it with the OS geocoder; web looks the
 * label up through the `geocode` edge function (OpenStreetMap) or takes the browser's position,
 * both inside `PlacePicker`.
 *
 * Saved apart from the page's main Save, because `set_my_location(lat, lng, text)` — the column's
 * only sanctioned writer — writes the point and the label as a pair. Passing no point CLEARS the
 * stored one, so the form starts from the stored point (parsed from its EWKB) rather than from none;
 * a label edited without a new pin keeps that point, as on community settings.
 */
export function ProfileLocationCard({ initialLabel }: { initialLabel: string }) {
  const { t } = useT('profile');
  const db = useDb();
  const uid = useSession().session?.user.id;
  // Under the profile's own key, so useSetMyLocation's invalidation refreshes it.
  const stored = useQuery({
    queryKey: [...qk.profile(uid ?? ''), 'location-point'],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await db.from('profiles').select('location_point').eq('id', uid!).maybeSingle();
      if (error) throw error;
      return parseEwkbPoint(data?.location_point);
    },
  });
  const save = useSetMyLocation();
  const [label, setLabel] = useState(initialLabel);
  // undefined = untouched: follow the stored point until the user pins, repins or clears.
  const [point, setPoint] = useState<LocationPoint | null | undefined>(undefined);
  const [error, setError] = useState(false);

  const storedPoint = stored.data ?? null;
  const current = point === undefined ? storedPoint : point;
  const trimmed = label.trim();
  const dirty = trimmed !== initialLabel.trim() || !samePoint(current, storedPoint);

  const onSave = async () => {
    setError(false);
    try {
      await save.mutateAsync({ lat: current?.lat ?? null, lng: current?.lng ?? null, text: trimmed || null });
      setPoint(undefined);
      toast(t('myLocationSaved'));
    } catch {
      setError(true);
    }
  };

  return (
    <section className="space-y-3 rounded-md border p-4" aria-labelledby="profile-location-title" data-testid="profile-location">
      <h2 id="profile-location-title" className="text-sm font-medium">
        <label htmlFor="profile-location">{t('myLocationTitle')}</label>
      </h2>
      <PlacePicker
        id="profile-location"
        value={{ label, point: current }}
        onLabelChange={setLabel}
        onPointChange={setPoint}
        hint={t('myLocationHint')}
      />
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={onSave}
          loading={save.isPending}
          disabled={!dirty || stored.isLoading}
          data-testid="profile-location-save"
        >
          {t('myLocationSave')}
        </Button>
        {error ? (
          <span role="alert" className="text-sm text-destructive">
            {t('saveError')}
          </span>
        ) : null}
      </div>
    </section>
  );
}
