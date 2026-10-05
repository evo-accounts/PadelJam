/**
 * Where an event happens (UX-JEVT-02) — shared by the mobile and web event pages. Opening it in a
 * maps app is platform-specific and stays in each app (`apps/mobile/lib/eventLocation.ts`,
 * `apps/web/src/lib/eventLinks.ts`; web builds its URL with `mapsWebUrl` below).
 *
 * A registry venue wins over the manual location fields; an event with `has_location = false` has
 * no location at all and the Location card is hidden.
 */
export type EventPlace = { name: string; address: string | null };

export function eventPlace(e: {
  has_location: boolean;
  venue: { name: string; address: string | null } | null;
  manual_location_name: string | null;
  manual_location_address: string | null;
  location_text?: string | null;
}): EventPlace | null {
  if (e.venue) return { name: e.venue.name, address: e.venue.address };
  if (!e.has_location) return null;
  const name = e.manual_location_name ?? e.location_text ?? e.manual_location_address;
  if (!name) return null;
  return { name, address: e.manual_location_address && e.manual_location_address !== name ? e.manual_location_address : null };
}

/** The search string handed to the maps app: name and address together find a club best. */
export function mapsQuery(place: EventPlace): string {
  return [place.name, place.address].filter(Boolean).join(', ');
}

/**
 * The web Location card's link, opened in a new tab: Apple Maps on Apple devices (Safari hands it
 * to the Maps app), Google Maps everywhere else.
 */
export function mapsWebUrl(place: EventPlace, apple: boolean): string {
  const q = encodeURIComponent(mapsQuery(place));
  return apple ? `https://maps.apple.com/?q=${q}` : `https://www.google.com/maps/search/?api=1&query=${q}`;
}
