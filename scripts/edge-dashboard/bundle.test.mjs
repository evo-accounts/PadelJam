// Tests for the dashboard-deploy transform (scripts/edge-dashboard/bundle.mjs). Runs under plain
// `node --test` as part of `pnpm test:functions`, which CI's "Edge function tests" step runs.
// Everything but the last block works on in-memory files; the last block builds the repo's real
// functions, so a `_shared` change that stops a function from being deployable fails here, at PR
// time, rather than in the dashboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DashboardBuildError, bundleFunction, isDashboardBuild, renderBanner } from './bundle.mjs';

const FNS = '/fns';

/** Builds `fn` from an in-memory functions dir: keys are paths relative to it. */
function build(files, name = 'fn') {
  const readFile = (path) => {
    const key = path.slice(FNS.length + 1);
    if (!(key in files)) throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
    return files[key];
  };
  return bundleFunction({ functionsDir: FNS, name, readFile });
}

const EMAIL = `// Email helper.
const API = 'https://mail.example';

function keyOrThrow(): string {
  return Deno.env.get('KEY') ?? '';
}

export async function sendEmail(to: string): Promise<void> {
  const chunk = to.slice(0, 10); // a LOCAL, which must not count as a top-level name
  await fetch(API, { method: 'POST', body: chunk + keyOrThrow() });
}
`;

test('inlines a shared module, drops `export`, keeps comments and private helpers', () => {
  const { code, inlined } = build({
    'fn/index.ts': `// What the function does.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sendEmail } from '../_shared/email.ts';

const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });

Deno.serve(async () => {
  await sendEmail('a@b.c');
  return json({ ok: !!createClient });
});
`,
    '_shared/email.ts': EMAIL,
  });
  assert.deepEqual(inlined, ['../_shared/email.ts']);
  assert.equal(
    code,
    `// What the function does.
import { createClient } from 'jsr:@supabase/supabase-js@2';

// ---- inlined from ../_shared/email.ts ----
// Email helper.
const API = 'https://mail.example';

function keyOrThrow(): string {
  return Deno.env.get('KEY') ?? '';
}

async function sendEmail(to: string): Promise<void> {
  const chunk = to.slice(0, 10); // a LOCAL, which must not count as a top-level name
  await fetch(API, { method: 'POST', body: chunk + keyOrThrow() });
}
// ---- end of inlined modules ----

const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });

Deno.serve(async () => {
  await sendEmail('a@b.c');
  return json({ ok: !!createClient });
});
`,
  );
});

test('inlines nested shared imports depth-first, each module once', () => {
  const { code, inlined } = build({
    'fn/index.ts': `import { a } from '../_shared/a.ts';
import { b } from '../_shared/b.ts';
Deno.serve(() => new Response(a() + b()));
`,
    '_shared/a.ts': `import { b } from './b.ts';
export const a = () => 'a' + b();
`,
    '_shared/b.ts': `export function b(): string {
  return 'b';
}
`,
  });
  assert.deepEqual(inlined, ['../_shared/b.ts', '../_shared/a.ts']);
  assert.equal(code.match(/function b\(/g).length, 1);
  assert.ok(
    code.indexOf('function b(') < code.indexOf('const a ='),
    'b is declared before a uses it',
  );
  assert.doesNotMatch(code, /from '\.{1,2}\//);
  assert.doesNotMatch(code, /\bexport\b/);
});

test('hoists remote imports from every module into one de-duplicated block', () => {
  const { code, remote } = build({
    'fn/index.ts': `import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import type { Thing } from 'npm:things';
import { roster } from '../_shared/roster.ts';
Deno.serve(() => new Response(String(roster(createClient) as Thing)));
`,
    '_shared/roster.ts': `import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding/base64';
import { Thing } from 'npm:things';

export function roster(make: typeof createClient): string {
  const c: SupabaseClient | null = null;
  return encodeBase64(String(make)) + String(c) + String(Thing);
}
`,
  });
  assert.deepEqual(remote, [
    'jsr:@supabase/functions-js/edge-runtime.d.ts',
    'jsr:@supabase/supabase-js@2',
    'npm:things',
    'jsr:@std/encoding/base64',
  ]);
  // The type-only import of Thing is satisfied by the value import the shared module needs.
  assert.ok(
    code.startsWith(`import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { Thing } from 'npm:things';
import { encodeBase64 } from 'jsr:@std/encoding/base64';

// ---- inlined from ../_shared/roster.ts ----
function roster(`),
    code,
  );
});

test('handles export lists, type-only imports, and leaves string contents alone', () => {
  const { code } = build({
    'fn/index.ts': `import { render, type Row } from '../_shared/view.ts';
const r: Row = { id: 1 };
Deno.serve(() => new Response(render(r)));
`,
    '_shared/view.ts': `interface Row { id: number }
const TEMPLATE = \`<p>


export {}</p>\`;
function render(r: Row): string {
  return TEMPLATE + r.id;
}
export { render };
export type { Row };
`,
  });
  assert.match(
    code,
    /interface Row \{ id: number \}\nconst TEMPLATE = `<p>\n\n\nexport \{\}<\/p>`;/,
  );
  assert.doesNotMatch(code, /export \{ render \}|export type/);
  assert.match(
    code,
    /function render\(r: Row\): string \{\n {2}return TEMPLATE \+ r\.id;\n\}\n\/\/ ---- end/,
  );
});

test('a function without shared imports comes out as it went in', () => {
  const source = `// Header.
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(() => new Response(String(createClient)));
`;
  const { code, inlined } = build({ 'fn/index.ts': source });
  assert.deepEqual(inlined, []);
  assert.equal(code, source);
});

test('property names, object keys and shadowed locals are not mistaken for collisions', () => {
  // `status`, `ok` and `chunk` are top-level names in the shared modules; the function only uses
  // them as property names or as locals of its own, which inlining cannot rebind.
  const { inlined } = build({
    'fn/index.ts': `import { sendEmail } from '../_shared/email.ts';
import { chunk } from '../_shared/chunk.ts';
Deno.serve(async (req) => {
  const ok = req.headers.get('x') !== null;
  const res = await fetch('https://x.example');
  for (const part of chunk([1, 2, 3], 2)) await sendEmail(String(part));
  return new Response(null, { status: res.status, statusText: String(ok) });
});
`,
    '_shared/email.ts': EMAIL,
    '_shared/chunk.ts': `export const status = 1;
export const ok = true;
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
`,
  });
  assert.deepEqual(inlined, ['../_shared/email.ts', '../_shared/chunk.ts']);
});

test('code after the first import on the same line stays code, not part of the end marker', () => {
  // The block ends in a `//` comment. Spliced in mid-line, it used to turn the rest of the line
  // into comment text: the guard below vanished and the build still type-checked.
  const a = { '_shared/a.ts': `export const a = 1;\n` };
  const guarded = build({
    'fn/index.ts': `import { a } from '../_shared/a.ts'; if (!a) throw new Error('auth');\nDeno.serve(() => new Response(String(a)));\n`,
    ...a,
  }).code;
  assert.match(guarded, /^\/\/ ---- end of inlined modules ----$/m);
  assert.match(guarded, /^ ?if \(!a\) throw new Error\('auth'\);$/m);

  const twoImports = build({
    'fn/index.ts': `import { a } from '../_shared/a.ts'; import { b } from 'npm:b'; console.log(a, b);\n`,
    ...a,
  }).code;
  assert.ok(twoImports.startsWith(`import { b } from 'npm:b';\n`), twoImports);
  assert.match(twoImports, /^\/\/ ---- end of inlined modules ----$/m);
  assert.match(twoImports, /^ *console\.log\(a, b\);$/m);

  // A trailing comment moves down with the rest of the line; the block still owns its lines.
  const commented = build({
    'fn/index.ts': `import { a } from '../_shared/a.ts'; // why\nconsole.log(a);\n`,
    ...a,
  }).code;
  assert.match(commented, /end of inlined modules ----\n *\/\/ why\nconsole\.log\(a\);\n$/);
});

test('a statement above the first import is fine when nothing is inlined', () => {
  // The block is then only imports, which the language hoists wherever they sit.
  const source = `const started = Date.now();\nimport { createClient } from 'jsr:@supabase/supabase-js@2';\nDeno.serve(() => new Response(String(createClient) + started));\n`;
  assert.equal(build({ 'fn/index.ts': source }).code, source);
});

test('a module imported only for types may have inert top-level declarations', () => {
  const { code, inlined } = build({
    'fn/index.ts': `import type { Row } from '../_shared/types.ts';\nimport { only } from '../_shared/kinds.ts';\nconst r: Row = { id: only };\nDeno.serve(() => new Response(String(r.id)));\n`,
    '_shared/types.ts': `export interface Row { id: number }\nexport const LIMIT = 5;\nconst esc = (s: string) => s.replace(/&/g, '&amp;');\nexport function show(r: Row): string { return esc(String(r.id)) + new Date().toISOString(); }\nexport class Box { static readonly SIZE = 3; value = Math.random(); go() { return fetch('/'); } }\nexport enum Kind { A = 1, B = A << 1 }\n`,
    // Imported by value, a module may do anything at its top level: ESM runs it before the
    // function's own code, and so does the build.
    '_shared/kinds.ts': `import type { Row } from './types.ts';\nconst seed: Row = { id: 1 };\nif (!Deno.env.get('X')) console.warn('X is unset');\nexport const only = seed.id;\n`,
  });
  assert.deepEqual(inlined, ['../_shared/types.ts', '../_shared/kinds.ts']);
  assert.match(code, /console\.warn\('X is unset'\)/);
});

test('a module that runs because another one imports a value from it may do work', () => {
  // The function wants only a type from b.ts, but a.ts imports a value from it, so ESM runs it.
  const { inlined } = build({
    'fn/index.ts': `import type { B } from '../_shared/b.ts';\nimport { a } from '../_shared/a.ts';\nconst x: B = a;\nconsole.log(x);\n`,
    '_shared/a.ts': `import { b } from './b.ts';\nexport const a = b;\n`,
    '_shared/b.ts': `export type B = number;\nexport const b: B = Number(Deno.env.get('B') ?? 0);\n`,
  });
  assert.deepEqual(inlined, ['../_shared/b.ts', '../_shared/a.ts']);
});

// ---- refusals -------------------------------------------------------------------------------

const withEmail = (entry, extra = {}) => ({
  'fn/index.ts': entry,
  '_shared/email.ts': EMAIL,
  ...extra,
});

const REFUSALS = [
  [
    'a default import of a shared module',
    withEmail(`import email from '../_shared/email.ts';\n`),
    /fn\/index\.ts:1: default import of '\.\.\/_shared\/email\.ts'/,
  ],
  [
    'a namespace import of a shared module',
    withEmail(`import * as email from '../_shared/email.ts';\n`),
    /namespace import/,
  ],
  [
    'an aliased import of a shared module',
    withEmail(`import { sendEmail as send } from '../_shared/email.ts';\n`),
    /aliased import 'sendEmail as send'/,
  ],
  [
    'a side-effect-only import of a shared module',
    withEmail(`import '../_shared/email.ts';\n`),
    /side-effect-only import/,
  ],
  [
    'an empty named import of a shared module',
    withEmail(`import {} from '../_shared/email.ts';\n`),
    /side-effect-only import/,
  ],
  [
    'importing a private helper',
    withEmail(`import { keyOrThrow } from '../_shared/email.ts';\n`),
    /'keyOrThrow' is not exported by _shared\/email\.ts \(it is declared there, but not exported\)/,
  ],
  [
    'importing a name that does not exist',
    withEmail(`import { sendSms } from '../_shared/email.ts';\n`),
    /'sendSms' is not exported by _shared\/email\.ts$/,
  ],
  [
    'a relative import inside the function folder',
    { 'fn/index.ts': `import { x } from './helpers.ts';\n` },
    /relative import '\.\/helpers\.ts' resolves outside _shared\//,
  ],
  [
    'a relative import of another function',
    { 'fn/index.ts': `import { x } from '../other/index.ts';\n` },
    /resolves outside _shared\//,
  ],
  [
    'a shared module importing from outside _shared',
    {
      'fn/index.ts': `import { a } from '../_shared/a.ts';\n`,
      '_shared/a.ts': `import { x } from '../fn/x.ts';\nexport const a = x;\n`,
    },
    /_shared\/a\.ts:1: relative import '\.\.\/fn\/x\.ts' resolves outside _shared\//,
  ],
  [
    'a top-level name declared by the function and a shared module',
    withEmail(
      `import { sendEmail } from '../_shared/email.ts';\nconst API = 'mine';\nsendEmail(API);\n`,
    ),
    /top-level name 'API' is declared in both fn\/index\.ts and _shared\/email\.ts/,
  ],
  [
    'a top-level name declared by two shared modules',
    {
      'fn/index.ts': `import { a } from '../_shared/a.ts';\nimport { b } from '../_shared/b.ts';\n`,
      '_shared/a.ts': `const esc = 1;\nexport const a = esc;\n`,
      '_shared/b.ts': `function esc() {}\nexport const b = esc;\n`,
    },
    /top-level name 'esc' is declared in both _shared\/a\.ts and _shared\/b\.ts/,
  ],
  [
    'a remote import shadowing a shared declaration',
    {
      'fn/index.ts': `import { createClient } from 'jsr:@supabase/supabase-js@2';\nimport { a } from '../_shared/a.ts';\n`,
      '_shared/a.ts': `export function createClient() {}\nexport const a = 1;\n`,
    },
    /'createClient' is imported from 'jsr:@supabase\/supabase-js@2' here but declared at the top level of _shared\/a\.ts/,
  ],
  [
    'one local name imported from two places',
    {
      'fn/index.ts': `import { serve } from 'https://deno.land/std/http/server.ts';\nimport { a } from '../_shared/a.ts';\n`,
      '_shared/a.ts': `import { serve } from 'jsr:@std/http';\nexport const a = serve;\n`,
    },
    /'serve' means 'serve' from 'https:\/\/deno\.land\/std\/http\/server\.ts' in fn\/index\.ts but 'serve' from 'jsr:@std\/http' in _shared\/a\.ts/,
  ],
  [
    'a shared declaration capturing a global the function uses',
    {
      'fn/index.ts': `import { get } from '../_shared/a.ts';\nDeno.serve(async () => { await get(); return await fetch('https://x.example'); });\n`,
      '_shared/a.ts': `const fetch = (u: string) => Promise.resolve(u);\nexport const get = () => fetch('/x');\n`,
    },
    /fn\/index\.ts uses the global 'fetch', but _shared\/a\.ts declares a top-level 'fetch'/,
  ],
  [
    'a function declaration capturing a global a shared module uses',
    {
      'fn/index.ts': `import { link } from '../_shared/a.ts';\nconst URL = 'https://x.example';\nlink(URL);\n`,
      '_shared/a.ts': `export const link = (s: string) => new URL(s).href;\n`,
    },
    /_shared\/a\.ts uses the global 'URL', but fn\/index\.ts declares a top-level 'URL'/,
  ],
  [
    'a shared type capturing a global type',
    {
      'fn/index.ts': `import { a } from '../_shared/a.ts';\nconst r: Response = new Response(String(a));\n`,
      '_shared/a.ts': `type Response = { body: string };\nexport const a: Response = { body: '' };\n`,
    },
    /fn\/index\.ts uses the global 'Response', but _shared\/a\.ts declares a top-level 'Response'/,
  ],
  [
    '`export default` in a shared module',
    {
      'fn/index.ts': `import { a } from '../_shared/a.ts';\n`,
      '_shared/a.ts': `export const a = 1;\nexport default function f() {}\n`,
    },
    /_shared\/a\.ts:2: `export default` cannot be inlined/,
  ],
  [
    'a re-export in a shared module',
    {
      'fn/index.ts': `import { a } from '../_shared/a.ts';\n`,
      '_shared/a.ts': `export * from './b.ts';\nexport const a = 1;\n`,
    },
    /re-export from '\.\/b\.ts' cannot be inlined/,
  ],
  [
    'an aliased export list',
    {
      'fn/index.ts': `import { b } from '../_shared/a.ts';\n`,
      '_shared/a.ts': `const a = 1;\nexport { a as b };\n`,
    },
    /aliased export 'a as b'/,
  ],
  [
    'an import cycle between shared modules',
    {
      'fn/index.ts': `import { a } from '../_shared/a.ts';\n`,
      '_shared/a.ts': `import { b } from './b.ts';\nexport const a = () => b;\n`,
      '_shared/b.ts': `import { a } from './a.ts';\nexport const b = () => a;\n`,
    },
    /import cycle between shared modules: fn\/index\.ts -> _shared\/a\.ts -> _shared\/b\.ts -> _shared\/a\.ts/,
  ],
  [
    'a bare specifier',
    { 'fn/index.ts': `import { z } from 'zod';\n` },
    /unsupported specifier 'zod': a dashboard deploy has no import map/,
  ],
  [
    'a dynamic import of a relative path',
    { 'fn/index.ts': `const m = await import('../_shared/email.ts');\n` },
    /dynamic import\('\.\.\/_shared\/email\.ts'\) cannot be inlined/,
  ],
  [
    '`import.meta` in a shared module',
    {
      'fn/index.ts': `import { here } from '../_shared/a.ts';\n`,
      '_shared/a.ts': `export const here = import.meta.url;\n`,
    },
    /_shared\/a\.ts:1: `import\.meta` would describe the bundle/,
  ],
  [
    'a syntax error',
    {
      'fn/index.ts': `import { a } from '../_shared/a.ts';\n`,
      '_shared/a.ts': `export const a = (;\n`,
    },
    /_shared\/a\.ts:1: syntax error/,
  ],
  [
    'a missing shared module',
    { 'fn/index.ts': `import { a } from '../_shared/nope.ts';\n` },
    /fn\/index\.ts:1: cannot read _shared\/nope\.ts \(no such file\)/,
  ],
  [
    'a shared module that is not .ts',
    {
      'fn/index.ts': `import { a } from '../_shared/a.js';\n`,
      '_shared/a.js': 'export const a = 1;\n',
    },
    /only \.ts modules/,
  ],
  // Evaluation order. In ESM, `make()` runs after a.ts; in the build it would run before BASE
  // is initialised and throw a ReferenceError when the function boots.
  [
    'a statement above the first import when something is inlined',
    {
      'fn/index.ts': `// Header.\nconst x = make();\nimport { make } from '../_shared/a.ts';\nconsole.log(x);\n`,
      '_shared/a.ts': `const BASE = 2;\nexport function make() { return BASE * 2; }\n`,
    },
    /fn\/index\.ts:2: this statement comes before the first import, so in the build it would run BEFORE the inlined modules/,
  ],
  [
    'a top-level statement in a module imported only with `import type`',
    {
      'fn/index.ts': `import type { Row } from '../_shared/a.ts';\nconst r: Row = { id: 1 };\nconsole.log(r);\n`,
      '_shared/a.ts': `if (!Deno.env.get('X')) throw new Error('boom');\nexport interface Row { id: number }\n`,
    },
    /_shared\/a\.ts:1: only types are imported from this module, so ESM never runs it, but inlined, its top level would run: `if \(!Deno\.env\.get\('X'\)\) throw new Error\('boom'\);`/,
  ],
  [
    'a top-level call in an initializer of a module imported only with `{ type X }`',
    {
      'fn/index.ts': `import { type Row } from '../_shared/a.ts';\nconst r: Row = { id: 1 };\nconsole.log(r);\n`,
      '_shared/a.ts': `export interface Row { id: number }\nexport const KEY = Deno.env.get('KEY') ?? fail();\nfunction fail(): never { throw new Error('KEY'); }\n`,
    },
    /_shared\/a\.ts:2: only types are imported .*`Deno\.env\.get\('KEY'\)`/,
  ],
  [
    'top-level work in a module whose imported names are all interfaces or type aliases',
    {
      'fn/index.ts': `import { Row, Id } from '../_shared/a.ts';\nconst r: Row = { id: 1 as Id };\nconsole.log(r);\n`,
      '_shared/a.ts': `export type Id = number;\nexport interface Row { id: Id }\nexport const cache = new Map<Id, Row>();\n`,
    },
    /_shared\/a\.ts:3: only types are imported .*`new Map<Id, Row>\(\)`/,
  ],
  [
    'a static block in a module imported only for its types',
    {
      'fn/index.ts': `import type { C } from '../_shared/a.ts';\nlet c: C | null = null;\nconsole.log(c);\n`,
      '_shared/a.ts': `export class C {\n  static {\n    console.log('defined');\n  }\n}\n`,
    },
    /_shared\/a\.ts:2: only types are imported/,
  ],
  // Pragmas that would be left behind when their import moves.
  [
    'a `@deno-types` comment above a later import',
    withEmail(
      `import { sendEmail } from '../_shared/email.ts';\n// @deno-types="npm:@types/express@4"\nimport express from 'npm:express@4';\nconsole.log(sendEmail, express);\n`,
    ),
    /fn\/index\.ts:3: a `@deno-types` comment above the import of 'npm:express@4' would be left behind/,
  ],
  [
    'a `@ts-ignore` comment above the first import',
    withEmail(
      `// @ts-ignore old types\nimport { sendEmail } from '../_shared/email.ts';\nsendEmail('x');\n`,
    ),
    /fn\/index\.ts:2: a `@ts-ignore` comment above the import of '\.\.\/_shared\/email\.ts'/,
  ],
  [
    'a `@ts-expect-error` comment above an import in a shared module',
    {
      'fn/index.ts': `import { a } from '../_shared/a.ts';\nconsole.log(a);\n`,
      '_shared/a.ts': `/* @ts-expect-error untyped */\nimport x from 'npm:x';\nexport const a = x;\n`,
    },
    /_shared\/a\.ts:2: a `@ts-expect-error` comment above the import of 'npm:x'/,
  ],
];

for (const [what, files, message] of REFUSALS) {
  test(`refuses ${what}`, () => {
    assert.throws(
      () => build(files),
      (e) => e instanceof DashboardBuildError && message.test(e.message),
    );
  });
}

test('a pragma mentioned in prose is not mistaken for one', () => {
  const { inlined } = build(
    withEmail(
      `/**\n * Never add a @ts-ignore here; see // @deno-types in the docs.\n */\nimport { sendEmail } from '../_shared/email.ts';\nsendEmail('x');\n`,
    ),
  );
  assert.deepEqual(inlined, ['../_shared/email.ts']);
});

// ---- banner ---------------------------------------------------------------------------------

test('the banner says the file is generated and names what was inlined', () => {
  const banner = renderBanner({
    source: 'infra/supabase/functions/send-blast/index.ts',
    provenance: 'main @ abc1234',
    inlined: ['../_shared/email.ts', '../_shared/blast.ts'],
    command: 'pnpm edge:dashboard-build send-blast',
  });
  assert.match(banner, /^\/\/ -{93}\n\/\/ GENERATED FILE\. DO NOT EDIT/);
  assert.match(
    banner,
    /source: {2}infra\/supabase\/functions\/send-blast\/index\.ts \(main @ abc1234\)/,
  );
  assert.match(banner, /\/\/ {3}\.\.\/_shared\/email\.ts\n\/\/ {3}\.\.\/_shared\/blast\.ts\n/);
  assert.ok(banner.endsWith(`// ${'-'.repeat(93)}\n`));
  assert.match(
    renderBanner({ source: 'x/index.ts', provenance: null, inlined: [], command: 'c' }),
    /Nothing to inline/,
  );
  // The CLI overwrites or deletes only files this recognises.
  assert.ok(isDashboardBuild(`${banner}Deno.serve(() => new Response());\n`));
  assert.ok(
    !isDashboardBuild(`// GENERATED FILE. DO NOT EDIT\nDeno.serve(() => new Response());\n`),
  );
  assert.ok(!isDashboardBuild(`import { a } from '../_shared/a.ts';\n`));
});

// ---- the repo's own functions ---------------------------------------------------------------

const REPO_FNS = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'infra',
  'supabase',
  'functions',
);
const realFunctions = readdirSync(REPO_FNS, { withFileTypes: true })
  .filter(
    (d) =>
      d.isDirectory() && !/^[_.]/.test(d.name) && existsSync(join(REPO_FNS, d.name, 'index.ts')),
  )
  .map((d) => d.name);

test('the repo has functions to build', () => {
  assert.ok(realFunctions.length > 0);
});

for (const name of realFunctions) {
  test(`builds the repo's ${name} with no relative imports left`, () => {
    const source = readFileSync(join(REPO_FNS, name, 'index.ts'), 'utf8');
    const { code, inlined } = bundleFunction({ functionsDir: REPO_FNS, name });
    assert.doesNotMatch(code, /\bfrom\s+['"]\.{1,2}\//);
    assert.equal(inlined.length > 0, /from\s+['"]\.\.\/_shared\//.test(source));
  });
}
