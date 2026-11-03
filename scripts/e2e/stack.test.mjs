// Tests for scripts/e2e/stack.mjs: which Supabase stack the mobile e2e uses. Plain `node --test`,
// no stack is started.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STACKS, resolveStack, urlMismatches, heldByForeignStack } from './stack.mjs';

test('defaults to dev: 55321, supabase_db_padeljam, empty cliEnv', () => {
  const prev = process.env.E2E_STACK;
  delete process.env.E2E_STACK;
  try {
    const s = resolveStack();
    assert.equal(s.name, 'dev');
    assert.equal(s.apiUrl, 'http://127.0.0.1:55321');
    assert.equal(s.dbContainer, 'supabase_db_padeljam');
    assert.deepEqual(s.cliEnv, {});
  } finally {
    if (prev !== undefined) process.env.E2E_STACK = prev;
  }
});

test('ci: 56321, supabase_db_padeljam_ci and all nine CLI variables', () => {
  const s = resolveStack('ci');
  assert.equal(s.apiUrl, 'http://127.0.0.1:56321');
  assert.equal(s.mailpitUrl, 'http://127.0.0.1:56324');
  assert.equal(s.dbContainer, 'supabase_db_padeljam_ci');
  assert.equal(s.edgeContainer, 'supabase_edge_runtime_padeljam_ci');
  assert.deepEqual(s.cliEnv, {
    SUPABASE_PROJECT_ID: 'padeljam_ci',
    SUPABASE_API_PORT: '56321',
    SUPABASE_DB_PORT: '56322',
    SUPABASE_DB_SHADOW_PORT: '56320',
    SUPABASE_STUDIO_PORT: '56323',
    SUPABASE_LOCAL_SMTP_PORT: '56324',
    SUPABASE_ANALYTICS_PORT: '56327',
    SUPABASE_DB_POOLER_PORT: '56329',
    SUPABASE_EDGE_RUNTIME_INSPECTOR_PORT: '8183',
  });
});

test('the two stacks share no port and no projectId', () => {
  const { projectId: a, ...dev } = STACKS.dev;
  const { projectId: b, ...ci } = STACKS.ci;
  assert.notEqual(a, b);
  const devPorts = new Set(Object.values(dev));
  for (const p of Object.values(ci)) assert.ok(!devPorts.has(p), `port ${p} is in both`);
});

test('an unknown stack name throws', () => {
  assert.throws(() => resolveStack('prod'), /Unknown E2E_STACK "prod"/);
});

test('urlMismatches names every URL that is not the stack\'s', () => {
  const ci = resolveStack('ci');
  const bad = urlMismatches(ci, [
    { file: '.env', key: 'SUPABASE_URL', value: 'http://127.0.0.1:56321' },
    { file: 'apps/mobile/.env', key: 'EXPO_PUBLIC_SUPABASE_URL', value: 'http://127.0.0.1:55321' },
  ]);
  assert.deepEqual(bad, [
    { file: 'apps/mobile/.env', key: 'EXPO_PUBLIC_SUPABASE_URL', value: 'http://127.0.0.1:55321', expected: 'http://127.0.0.1:56321' },
  ]);
});

test('urlMismatches: a missing URL is a mismatch under ci, not under dev', () => {
  const files = [{ file: '.env', key: 'SUPABASE_URL', value: undefined }];
  assert.equal(urlMismatches(resolveStack('ci'), files).length, 1);
  assert.deepEqual(urlMismatches(resolveStack('dev'), files), []);
});

test('heldByForeignStack: open ci port with no own container is refused', () => {
  const ci = resolveStack('ci');
  assert.equal(heldByForeignStack(ci, { apiOpen: true, dbOpen: false, containers: [] }), true);
  assert.equal(heldByForeignStack(ci, { apiOpen: false, dbOpen: true, containers: ['supabase_db_padeljam'] }), true);
});

test('heldByForeignStack: our own container, or nothing listening, or the dev stack, is fine', () => {
  const ci = resolveStack('ci');
  assert.equal(heldByForeignStack(ci, { apiOpen: true, dbOpen: true, containers: ['supabase_db_padeljam_ci'] }), false);
  assert.equal(heldByForeignStack(ci, { apiOpen: false, dbOpen: false, containers: [] }), false);
  assert.equal(heldByForeignStack(resolveStack('dev'), { apiOpen: true, dbOpen: true, containers: [] }), false);
});

test('resolveStack returns numeric api and db ports for dev and ci', () => {
  for (const name of ['dev', 'ci']) {
    const s = resolveStack(name);
    assert.equal(Number.isInteger(s.apiPort), true);
    assert.equal(Number.isInteger(s.dbPort), true);
  }
  assert.equal(resolveStack('ci').apiPort, 56321);
  assert.equal(resolveStack('ci').dbPort, 56322);
});
