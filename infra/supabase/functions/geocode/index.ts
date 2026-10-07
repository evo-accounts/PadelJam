// Address lookup for the web app, which — unlike mobile (expo-location / the OS geocoder) — has no
// geocoder of its own. Proxies OpenStreetMap Nominatim so the policy obligations live in one place:
// an identifying User-Agent, at most one upstream request a second, and cached repeats.
//
// POST { q: string, lang?: string } → 200 { results: { label, lat, lng }[] } (at most 5)
//   400 { error: 'bad_query' } — q shorter than 3 or longer than 200 characters after trimming
//   401 — no signed-in caller (verify_jwt stays on, and the user is checked here too)
//   405 — anything but POST (OPTIONS answers the CORS preflight)
//   502 { error: 'upstream' } — Nominatim failed or answered non-OK
//
// The throttle and cache are per isolate: good enough for the web's explicit-search traffic, not a
// global guarantee. Results must be shown with "© OpenStreetMap contributors" (ODbL).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  BoundedCache,
  buildSearchUrl,
  cacheKey,
  CACHE_MAX,
  createThrottle,
  mapRows,
  MIN_GAP_MS,
  NOMINATIM_USER_AGENT,
  normalizeLang,
  normalizeQuery,
  type Place,
} from '../_shared/geocode.ts';
import { withCors } from '../_shared/cors.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const cache = new BoundedCache<Place[]>(CACHE_MAX);
const throttled = createThrottle(MIN_GAP_MS);

// The web app calls this straight from the browser (supabase.functions.invoke): withCors answers the
// preflight and tags every response, which the gateway does not do for us.
Deno.serve(withCors(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();
  if (error || !user) return new Response('Unauthorized', { status: 401 });

  let body: { q?: unknown; lang?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_query' }, 400);
  }
  const q = normalizeQuery(body?.q);
  if (!q) return json({ error: 'bad_query' }, 400);
  const lang = normalizeLang(body?.lang);

  const key = cacheKey(q, lang);
  const hit = cache.get(key);
  if (hit) return json({ results: hit });

  try {
    const results = await throttled(async () => {
      // A request queued behind an identical one finds its answer cached by now.
      const queued = cache.get(key);
      if (queued) return queued;
      const res = await fetch(buildSearchUrl(q, lang), {
        headers: { 'User-Agent': NOMINATIM_USER_AGENT, Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`nominatim ${res.status}`);
      const places = mapRows(await res.json());
      cache.set(key, places);
      return places;
    });
    return json({ results });
  } catch (e) {
    console.error('geocode upstream failed', e instanceof Error ? e.message : e);
    return json({ error: 'upstream' }, 502);
  }
}));
