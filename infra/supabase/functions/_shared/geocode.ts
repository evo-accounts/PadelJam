// The pure half of the `geocode` edge function: query normalisation, the Nominatim URL, the row
// mapping, the short label, and the two pieces that keep us inside Nominatim's usage policy (one
// request a second, cache repeats). Pure TS with no Deno/npm imports so `pnpm test:functions` can
// run it under plain `node --test`; there is no local Deno on this Mac.
//
// Nominatim usage policy (https://operations.osmfoundation.org/policies/nominatim/): an identifying
// User-Agent, at most 1 request/second, cache results, no autocomplete (the web UI searches on an
// explicit button press), and attribution ("© OpenStreetMap contributors") wherever results show.

export const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';
export const NOMINATIM_USER_AGENT = 'PadelJam/1.0 (support@padeljam.app)';
export const QUERY_MIN = 3;
export const QUERY_MAX = 200;
export const RESULT_LIMIT = 5;
/** Comfortably above Nominatim's 1 request/second. */
export const MIN_GAP_MS = 1100;
export const CACHE_MAX = 500;

export interface Place {
  label: string;
  lat: number;
  lng: number;
}

/** Trims and collapses whitespace; null when the query is too short or too long to send. */
export function normalizeQuery(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const q = raw.replace(/\s+/g, ' ').trim();
  if (q.length < QUERY_MIN || q.length > QUERY_MAX) return null;
  return q;
}

/** A BCP-47-ish tag (`en`, `pt-PT`, `pt-BR`) for `accept-language`; anything else is `en`. */
export function normalizeLang(raw: unknown): string {
  if (typeof raw !== 'string') return 'en';
  const lang = raw.trim();
  return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(lang) ? lang : 'en';
}

export function buildSearchUrl(q: string, lang: string): string {
  const params = new URLSearchParams({
    format: 'jsonv2',
    limit: String(RESULT_LIMIT),
    q,
    'accept-language': lang,
  });
  return `${NOMINATIM_SEARCH}?${params.toString()}`;
}

/** Nominatim's jsonv2 rows → places; rows without a name or finite coordinates are dropped. */
export function mapRows(rows: unknown): Place[] {
  if (!Array.isArray(rows)) return [];
  const out: Place[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as { display_name?: unknown; lat?: unknown; lon?: unknown };
    const label = typeof r.display_name === 'string' ? r.display_name.trim() : '';
    const lat = typeof r.lat === 'number' ? r.lat : parseFloat(String(r.lat));
    const lng = typeof r.lon === 'number' ? r.lon : parseFloat(String(r.lon));
    if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    out.push({ label, lat, lng });
    if (out.length >= RESULT_LIMIT) break;
  }
  return out;
}

/**
 * The label a place keeps once picked: the first three comma-separated parts of Nominatim's long
 * `display_name` ("Clube X, Rua Y, Lisboa, …, Portugal" → "Clube X, Rua Y, Lisboa").
 */
export function shortLabel(displayName: string): string {
  return displayName
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');
}

export const cacheKey = (q: string, lang: string) => `${lang}|${q.toLowerCase()}`;

/** A Map capped at `max` entries; the oldest insertion goes first. */
export class BoundedCache<V> {
  private readonly map = new Map<string, V>();
  private readonly max: number;
  constructor(max: number) {
    this.max = max;
  }
  get(key: string): V | undefined {
    return this.map.get(key);
  }
  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
  get size(): number {
    return this.map.size;
  }
}

/**
 * Serialises calls so each one STARTS at least `gapMs` after the previous one started — the
 * in-isolate half of the 1 request/second limit. A failed call does not break the chain.
 */
export function createThrottle(
  gapMs: number,
  now: () => number = () => Date.now(),
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
) {
  let chain: Promise<unknown> = Promise.resolve();
  let last = -Infinity;
  return function throttled<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(async () => {
      const wait = last + gapMs - now();
      if (wait > 0) await sleep(wait);
      last = now();
      return fn();
    });
    chain = run.catch(() => undefined);
    return run;
  };
}
