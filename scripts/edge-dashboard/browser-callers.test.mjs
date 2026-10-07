// Tests for scripts/edge-dashboard/browser-callers.mjs: the scan that finds which edge functions
// the browser calls, and the judgement schema:check passes on a deployed function's answer to the
// CORS preflight. Runs under plain `node --test` as part of `pnpm test:functions`. The scan runs
// on throwaway trees under the OS temp dir and, read-only, on this repo; the classifier on plain
// Headers, no network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BROWSER_REQUEST_HEADERS,
  browserCalledFunctions,
  classifyPreflight,
} from './browser-callers.mjs';

const ORIGIN = 'https://padeljam.app';

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'browser-callers-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

test('finds invoke and fetch callers in apps/web and every package, nowhere else', (t) => {
  const root = tree({
    'apps/web/src/lib/geo.ts': `await supabase.functions.invoke<{ results?: R[] }>('geocode', { body });`,
    'apps/web/src/app/delete/page.tsx':
      'await fetch(`${url}/functions/v1/delete-account`, { method: "POST" });',
    'packages/api/src/chat/queries.ts': `const { data } = await db.functions.invoke('stream-token');`,
    'packages/api/src/events/mutations.ts': `db.functions.invoke(\n  "send-blast",\n  { body },\n);`,
    // Not browser code: mobile, tests, node_modules, and files that are not TS.
    'apps/mobile/lib/provision.ts': 'fetch(`${u}/functions/v1/provision-social-profile`)',
    'packages/api/src/events/mutations.test.ts': `db.functions.invoke('only-in-a-test')`,
    'packages/api/src/node_modules/x/index.ts': `db.functions.invoke('vendored')`,
    'packages/api/src/notes.md': `functions.invoke('in-a-doc')`,
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.deepEqual(Object.fromEntries(browserCalledFunctions(root)), {
    'delete-account': 'apps/web/src/app/delete/page.tsx',
    geocode: 'apps/web/src/lib/geo.ts',
    'send-blast': 'packages/api/src/events/mutations.ts',
    'stream-token': 'packages/api/src/chat/queries.ts',
  });
});

test("on this repo it finds today's seven browser-called functions, as cors.test.ts's copy does", () => {
  // The same list cors.test.ts requires its own copy of the scan to find (see the module header),
  // so the copy schema:check uses cannot quietly drift to a smaller set.
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const called = [...browserCalledFunctions(root).keys()];
  for (const fn of [
    'complete-account',
    'delete-account',
    'ensure-channel',
    'geocode',
    'send-blast',
    'send-roster-csv',
    'stream-token',
  ]) {
    assert.ok(called.includes(fn), `expected the scan to find a browser caller of ${fn}`);
  }
  // Every name found is a real function folder: a typo'd invoke would 404 on hosted too.
  for (const fn of called) {
    assert.ok(existsSync(join(root, 'infra', 'supabase', 'functions', fn, 'index.ts')), fn);
  }
});

const preflight = (status, headers = {}) => ({ status, headers: new Headers(headers) });
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

test('a function wrapped in withCors passes', () => {
  assert.deepEqual(classifyPreflight(preflight(200, CORS), ORIGIN), { result: 'ok', reason: '' });
  // Echoing the caller's origin, header names in any case, and wildcards are all valid answers.
  assert.equal(
    classifyPreflight(
      preflight(204, {
        'Access-Control-Allow-Origin': ORIGIN,
        'Access-Control-Allow-Headers':
          'Authorization,X-Client-Info,APIKEY,Content-Type,x-retry-count',
        'Access-Control-Allow-Methods': '*',
      }),
      ORIGIN,
    ).result,
    'ok',
  );
  assert.equal(
    classifyPreflight(preflight(200, { ...CORS, 'Access-Control-Allow-Headers': '*' }), ORIGIN)
      .result,
    'ok',
  );
});

test('the pre-#285 answer fails: 405 and no CORS headers', () => {
  assert.deepEqual(classifyPreflight(preflight(405), ORIGIN), {
    result: 'fail',
    reason: 'the preflight gets HTTP 405',
  });
});

test('a 2xx without the right headers fails, naming what is missing', () => {
  assert.equal(classifyPreflight(preflight(200), ORIGIN).reason, 'no Access-Control-Allow-Origin');
  assert.match(
    classifyPreflight(
      preflight(200, { ...CORS, 'Access-Control-Allow-Origin': 'https://other.app' }),
      ORIGIN,
    ).reason,
    /is https:\/\/other\.app, not \* or https:\/\/padeljam\.app/,
  );
  assert.equal(
    classifyPreflight(
      preflight(200, { ...CORS, 'Access-Control-Allow-Headers': 'authorization, content-type' }),
      ORIGIN,
    ).reason,
    'Access-Control-Allow-Headers lacks x-client-info, apikey',
  );
  assert.equal(
    classifyPreflight(
      preflight(200, { ...CORS, 'Access-Control-Allow-Methods': 'GET, OPTIONS' }),
      ORIGIN,
    ).reason,
    'Access-Control-Allow-Methods lacks POST',
  );
});

test('a function missing from the project fails; a 5xx is left unverified', () => {
  assert.deepEqual(classifyPreflight(preflight(404), ORIGIN), {
    result: 'fail',
    reason: 'not deployed (404)',
  });
  assert.deepEqual(classifyPreflight(preflight(503), ORIGIN), {
    result: 'skip',
    reason: 'HTTP 503',
  });
  assert.equal(classifyPreflight(preflight(401), ORIGIN).result, 'fail');
});

test('the requested headers are what supabase-js and apps/web send', () => {
  assert.deepEqual([...BROWSER_REQUEST_HEADERS].sort(), [
    'apikey',
    'authorization',
    'content-type',
    'x-client-info',
  ]);
});
