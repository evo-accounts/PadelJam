import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORS_HEADERS, withCors, withCorsHeaders } from './cors.ts';

const assertCors = (res: Response) => {
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.equal(
    res.headers.get('access-control-allow-headers'),
    'authorization, x-client-info, apikey, content-type',
  );
  assert.equal(res.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
};

const post = (body = '{}') =>
  new Request('https://fn.test/functions/v1/x', {
    method: 'POST',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body,
  });

test('the preflight is answered 200 with the CORS headers, without running the handler', async () => {
  let ran = false;
  const handler = withCors(() => {
    ran = true;
    return new Response('Method Not Allowed', { status: 405 });
  });
  const res = await handler(
    new Request('https://fn.test/functions/v1/x', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://padeljam.app',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type,apikey,x-client-info',
      },
    }),
  );
  assert.equal(res.status, 200);
  assertCors(res);
  assert.equal(ran, false);
});

test('a success keeps its status, body and content type, and gains the CORS headers', async () => {
  const res = await withCors(async (req) => {
    const { n } = await req.json();
    return new Response(JSON.stringify({ ok: true, n }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  })(post('{"n":3}'));
  assert.equal(res.status, 201);
  assert.equal(res.headers.get('content-type'), 'application/json');
  assert.deepEqual(await res.json(), { ok: true, n: 3 });
  assertCors(res);
});

test('every error status the functions return carries the CORS headers too', async () => {
  for (const [status, body] of [
    [400, '{"error":"bad_request"}'],
    [401, 'Unauthorized'],
    [403, '{"error":"forbidden"}'],
    [404, '{"error":"blast_not_found"}'],
    [405, 'Method Not Allowed'],
    [409, '{"error":"no_chat"}'],
    [500, '{"error":"stream_failed"}'],
    [502, '{"error":"upstream"}'],
  ] as const) {
    const res = await withCors(() => new Response(body, { status }))(post());
    assert.equal(res.status, status);
    assert.equal(await res.text(), body);
    assertCors(res);
  }
});

test('a non-POST, non-OPTIONS method still reaches the handler (its own 405), with the headers', async () => {
  const res = await withCors((req) =>
    req.method === 'POST'
      ? new Response('ok')
      : new Response('Method Not Allowed', { status: 405 }),
  )(new Request('https://fn.test/functions/v1/x', { method: 'GET' }));
  assert.equal(res.status, 405);
  assertCors(res);
});

test('a throw becomes a logged 500 the browser can read', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const boom = new Error('supabaseKey is required.');
  const res = await withCors(() => {
    throw boom;
  })(post());
  assert.equal(res.status, 500);
  assert.equal(await res.text(), 'Internal Server Error');
  assertCors(res);
  assert.equal(logged.mock.callCount(), 1);
  assert.equal(logged.mock.calls[0].arguments[0], boom);
});

test('withCorsHeaders copies a response whose headers are immutable', async () => {
  // Response.redirect's headers are immutable, like a fetch() response's: setting them in place throws.
  const redirect = Response.redirect('https://padeljam.app/', 302);
  assert.throws(() => redirect.headers.set('x', 'y'), TypeError);
  const res = withCorsHeaders(redirect);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), 'https://padeljam.app/');
  assertCors(res);
});

test('the allowed headers cover everything supabase-js and apps/web send to a function', () => {
  const allowed = CORS_HEADERS['Access-Control-Allow-Headers']
    .split(',')
    .map((h) => h.trim().toLowerCase());
  // functions.invoke: Authorization + apikey (fetchWithAuth), X-Client-Info (DEFAULT_HEADERS),
  // Content-Type (a JSON body). apps/web's fetch calls: Authorization + Content-Type.
  for (const h of ['authorization', 'apikey', 'x-client-info', 'content-type'])
    assert.ok(allowed.includes(h), h);
});

// The guard against the bug this module fixes coming back: every function that code which runs in
// the browser calls must wrap its handler. The callers are found, not listed, so a new web caller
// (or a new invoke in the shared packages/api) is covered the day it lands.
const FUNCTIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(FUNCTIONS_DIR, '..', '..', '..');
const BROWSER_SOURCES = [
  join(REPO, 'apps', 'web', 'src'),
  ...readdirSync(join(REPO, 'packages')).map((p) => join(REPO, 'packages', p, 'src')),
];

function sourceFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    if (name === 'node_modules') return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

function browserCalledFunctions(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of BROWSER_SOURCES.flatMap(sourceFiles)) {
    const text = readFileSync(file, 'utf8');
    const calls = [
      ...text.matchAll(/functions\.invoke\b[^(]*\(\s*['"`]([\w-]+)['"`]/g),
      ...text.matchAll(/\/functions\/v1\/([\w-]+)/g),
    ];
    for (const m of calls) if (!found.has(m[1])) found.set(m[1], file.slice(REPO.length + 1));
  }
  return found;
}

test('every function the web app can call answers the preflight (wraps its handler in withCors)', () => {
  const called = browserCalledFunctions();
  // The scan must keep finding the callers known today; an empty or shrunken result means the
  // patterns stopped matching, not that the browser stopped calling.
  for (const fn of [
    'complete-account',
    'delete-account',
    'ensure-channel',
    'geocode',
    'send-blast',
    'send-roster-csv',
    'stream-token',
  ]) {
    assert.ok(called.has(fn), `expected the scan to find a browser caller of ${fn}`);
  }
  for (const [fn, caller] of called) {
    const source = readFileSync(join(FUNCTIONS_DIR, fn, 'index.ts'), 'utf8');
    assert.match(
      source,
      /Deno\.serve\(withCors\(/,
      `${fn} is called from ${caller} but does not wrap its handler in withCors`,
    );
  }
});
