/**
 * The event's date · time · place line (UX-JEVT-02 subtitle, UX-JEVT-03 "You are in").
 * Formatted in the app's language rather than the hard-coded 'en' the old detail used.
 */
export function eventWhen(iso: string, lang: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date} · ${time}`;
}

export function eventSubtitle(iso: string, placeName: string | null | undefined, lang: string): string {
  return [eventWhen(iso, lang), placeName].filter(Boolean).join(' · ');
}
