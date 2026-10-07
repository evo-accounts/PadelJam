// Tests for the CLI around the transform (scripts/build-dashboard-function.mjs): the guards that
// keep a mistyped flag from overwriting or deleting function sources, and the banner's record of
// how the file was built. Runs under plain `node --test` as part of `pnpm test:functions`. Every
// run works on a throwaway functions directory under the OS temp dir and passes --out-dir, so
// nothing in the repo (including .dashboard-builds/) is touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'build-dashboard-function.mjs');

const SOURCES = {
  '_shared/a.ts': `const helper = 0;\nexport const a = helper + 1;\n`,
  'good/index.ts': `import { a } from '../_shared/a.ts';\nDeno.serve(() => new Response(String(a)));\n`,
  'plain/index.ts': `Deno.serve(() => new Response('ok'));\n`,
  // Refused by the transform: a top-level name collision with the inlined a.ts.
  'bad/index.ts': `import { a } from '../_shared/a.ts';\nconst helper = 2;\nconsole.log(a, helper);\n`,
};

/** A fresh functions dir (and a sibling out dir) for one test; removed when the test ends. */
function scratch(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'edge-dashboard-cli-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const fns = join(root, 'functions');
  for (const [path, text] of Object.entries(SOURCES)) {
    mkdirSync(dirname(join(fns, path)), { recursive: true });
    writeFileSync(join(fns, path), text);
  }
  return { root, fns, out: join(root, 'out') };
}

function run(...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, INIT_CWD: tmpdir() },
  });
  return { status: r.status, out: r.stdout + r.stderr };
}

test('builds into --out-dir and records --functions-dir in the banner', (t) => {
  const { fns, out } = scratch(t);
  const r = run('good', '--functions-dir', fns, '--out-dir', out);
  assert.equal(r.status, 0, r.out);
  const built = readFileSync(join(out, 'good', 'index.ts'), 'utf8');
  // Copying the banner's command must rebuild this file, so it names the functions dir (as
  // `~/…` when it is under the home directory).
  const command = 'pnpm edge:dashboard-build good --functions-dir';
  const home = homedir();
  const spelled = fns.startsWith(`${home}/`) ? `~/${relative(home, fns)}` : fns;
  assert.ok(built.includes(`//   built:   ${command} ${spelled}\n`), built);
  assert.match(built, /^const a = helper \+ 1;$/m);
});

test('accepts the `--` pnpm passes through', (t) => {
  const { fns, out } = scratch(t);
  const r = run('--', 'plain', '--functions-dir', fns, '--out-dir', out);
  assert.equal(r.status, 0, r.out);
  assert.ok(existsSync(join(out, 'plain', 'index.ts')));
});

test('refuses an --out-dir that is, or is inside, the functions directory', (t) => {
  const { fns } = scratch(t);
  for (const out of [fns, join(fns, '_shared'), join(fns, 'nested', 'deeper')]) {
    const r = run('good', 'bad', '--functions-dir', fns, '--out-dir', out);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /is inside the functions directory/);
  }
  // Nothing was overwritten, deleted or added.
  for (const [path, text] of Object.entries(SOURCES)) {
    assert.equal(readFileSync(join(fns, path), 'utf8'), text, path);
  }
  assert.ok(!existsSync(join(fns, 'nested')));
});

test('refuses an --out-dir that looks like another functions directory', (t) => {
  const { root, fns } = scratch(t);
  const other = join(root, 'other-checkout');
  mkdirSync(join(other, '_shared'), { recursive: true });
  const r = run('good', '--functions-dir', fns, '--out-dir', other);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /has a _shared\/ directory/);
});

test('never overwrites or deletes a file it did not write', (t) => {
  const { fns, out } = scratch(t);
  const mine = `// someone's own file\n`;
  for (const name of ['good', 'bad']) {
    mkdirSync(join(out, name), { recursive: true });
    writeFileSync(join(out, name, 'index.ts'), mine);
  }
  const r = run('good', 'bad', '--functions-dir', fns, '--out-dir', out);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /✘ good: .*good\/index\.ts exists and is not a dashboard build/);
  assert.match(r.out, /✘ bad: .*bad\/index\.ts exists and is not a dashboard build/);
  for (const name of ['good', 'bad']) {
    assert.equal(readFileSync(join(out, name, 'index.ts'), 'utf8'), mine, name);
  }
});

test('replaces its own earlier build, and deletes it once the function stops building', (t) => {
  const { fns, out } = scratch(t);
  assert.equal(run('good', '--functions-dir', fns, '--out-dir', out).status, 0);
  const first = readFileSync(join(out, 'good', 'index.ts'), 'utf8');
  assert.equal(run('good', '--functions-dir', fns, '--out-dir', out).status, 0);
  assert.equal(readFileSync(join(out, 'good', 'index.ts'), 'utf8'), first, 'one banner, not two');

  writeFileSync(join(fns, 'good', 'index.ts'), SOURCES['bad/index.ts']);
  const r = run('good', '--functions-dir', fns, '--out-dir', out);
  assert.equal(r.status, 1, r.out);
  assert.match(
    r.out,
    /top-level name 'helper' is declared in both good\/index\.ts and _shared\/a\.ts/,
  );
  assert.ok(!existsSync(join(out, 'good', 'index.ts')), 'the stale build is gone');
});

test('a missing --functions-dir is a clear error, not a stack trace', (t) => {
  const { root, out } = scratch(t);
  const r = run('good', '--functions-dir', join(root, 'nope'), '--out-dir', out);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /--functions-dir .*nope does not exist/);
  assert.doesNotMatch(r.out, /\n\s+at /);
});
