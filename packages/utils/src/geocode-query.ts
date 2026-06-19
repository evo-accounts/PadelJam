/** Compose the address string to geocode from location fields; null if nothing usable. */
export function geocodeQuery(parts: { name?: string | null; address?: string | null }): string | null {
  const q = [parts.name, parts.address].map((s) => (s ?? '').trim()).filter(Boolean).join(', ');
  return q.length > 0 ? q : null;
}
