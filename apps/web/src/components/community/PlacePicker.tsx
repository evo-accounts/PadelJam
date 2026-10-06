'use client';
import { useState } from 'react';
import { LocateFixed, MapPin } from 'lucide-react';
import type { LocationPoint } from '@padel/api';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlaceSearchButton, PlaceSearchResults, searchOnEnter, usePlaceSearch } from '@/components/location/PlaceSearch';

export type PickedPlace = { label: string; point: LocationPoint | null };

/**
 * A community's place on web (D2): the label people read, and the point Explore measures distance
 * from. Written together through `set_community_location` (or the create RPC), so a new label
 * never sits on an old place's coordinates.
 *
 * Two ways to a point: "Search" looks the typed label up through the `geocode` edge function
 * (OpenStreetMap Nominatim — an explicit press or Enter, never as you type, per its usage policy)
 * and picking a result sets both the short label and the point; or "Use my current location" takes
 * the browser's Geolocation API (the admin standing at the club) and leaves the label as typed.
 * Without a point the community still saves; it sorts last by distance until one is set.
 */
export function PlacePicker({
  id,
  value,
  onLabelChange,
  onPointChange,
  hint,
}: {
  id: string;
  /** The line under the controls; defaults to the community copy (what members see, Explore order). */
  hint?: string;
  value: PickedPlace;
  onLabelChange: (label: string) => void;
  /** Separate from the label: a position can arrive after the admin has typed on. */
  onPointChange: (point: LocationPoint | null) => void;
}) {
  const { t } = useT('community');
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const search = usePlaceSearch();
  const pinCurrent = () => {
    if (locating) return;
    setError(null);
    // Checked on press, not at render: the server render has no navigator to ask.
    if (!('geolocation' in navigator)) {
      setError(t('locationUnavailable'));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onPointChange({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        setLocating(false);
        setError(t(err.code === err.PERMISSION_DENIED ? 'locationDenied' : 'locationUnavailable'));
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    );
  };

  return (
    <div className="space-y-2" data-testid="place-picker">
      <div className="flex gap-2">
        <Input
          id={id}
          value={value.label}
          placeholder={t('locationPlaceholder')}
          onChange={(e) => onLabelChange(e.target.value)}
          onKeyDown={searchOnEnter(search, value.label)}
          className="flex-1"
          data-testid="place-picker-label"
        />
        <PlaceSearchButton search={search} query={value.label} />
      </div>
      <PlaceSearchResults
        search={search}
        focusAfterPickId={id}
        onPick={(picked) => {
          onLabelChange(picked.label);
          onPointChange(picked.point);
        }}
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground" data-testid="place-picker-status">
          <MapPin className="size-4" aria-hidden />
          {value.point ? t('locationPinned') : t('locationNoPoint')}
        </span>
        <Button type="button" variant="tertiary" size="sm" loading={locating} onClick={pinCurrent} data-testid="place-picker-current">
          <LocateFixed aria-hidden />
          {value.point ? t('locationRepin') : t('locationUseCurrent')}
        </Button>
        {value.point ? (
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            onClick={() => onPointChange(null)}
            data-testid="place-picker-clear"
          >
            {t('locationClearPin')}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">{hint ?? t('locationHint')}</p>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
