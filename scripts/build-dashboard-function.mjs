#!/usr/bin/env node
/**
 * Build an edge function into ONE self-contained `index.ts` that the Supabase dashboard can deploy.
 *
 *   pnpm edge:dashboard-build send-blast            # → .dashboard-builds/send-blast/index.ts
 *   pnpm edge:dashboard-build send-blast geocode    # several at once
 *   pnpm edge:dashboard-build --all                 # every function
 *   pnpm edge:dashboard-build --all --functions-dir <other checkout>/infra/supabase/functions
 *   pnpm edge:dashboard-build send-blast --out-dir /tmp/builds
 *
 * WHY. Our account cannot run `supabase functions deploy`, so functions reach the hosted project
 * through the dashboard's editor, and the editor deploys a function's folder on its own. Every
 * `import … from '../_shared/x.ts'` then fails to bundle ("Module not found …/_shared/x.ts").
 * Every function but provision-social-profile and send-push imports from `_shared/` today (the
 * browser-called ones at least `_shared/cors.ts`). This writes each one with its shared modules
 * inlined, which is what was being done by hand. The transform and everything it refuses to do
 * are documented in `scripts/edge-dashboard/bundle.mjs`; its tests run in CI as part of
 * `pnpm test:functions`.
 *
 * Output goes to the git-ignored `.dashboard-builds/<fn>/index.ts` at the repo root (`--out-dir`
 * overrides it). A build that fails deletes that function's previous output, so a stale file is
 * never left there to be pasted by mistake. `--functions-dir` builds another checkout's functions
 * — e.g. a worktree whose branch has not merged yet — while the output still lands here; the
 * banner's `built:` line then records it, so the command it shows rebuilds the same file.
 *
 * The script only ever overwrites or deletes a file that opens with its own GENERATED banner, and
 * it refuses an --out-dir inside the functions directory (or any directory with a `_shared/`), so
 * a slip of the flag cannot replace or delete a function's source.
 *
 * DEPLOYING FROM THE DASHBOARD
 *
 *   0. Read the function's header comment in the repo first. Some name a migration that must be
 *      on the hosted database BEFORE the new code goes live ("hosted 0143 must be pasted before
 *      this is deployed"); paste that in the SQL editor first, in the order the header gives.
 *   1. Build from the commit you mean to ship: `pnpm edge:dashboard-build <fn>`. The banner on
 *      the output records the source branch and commit, and flags uncommitted changes.
 *   2. Dashboard → Edge Functions → <fn> → Code. Replace the whole of `index.ts` with the build
 *      and deploy. A function the project does not have yet: "Deploy a new function" → "Via
 *      Editor", named exactly like its folder (the apps call it by that name).
 *   3. Check JWT verification matches `infra/supabase/config.toml`: on for every function except
 *      the ones listed there with `verify_jwt = false` (today only send-push).
 *   4. Check the secrets it reads exist under Edge Functions → Secrets; this script prints them
 *      per function. SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided
 *      by the platform.
 *   5. Invoke it once from the app (or the dashboard's test panel) and read its Logs tab.
 *
 * Never edit a build in the dashboard: the change would exist nowhere in the repo, and the next
 * build would silently undo it.
 *
 * TYPE-CHECKING A BUILD (no local Deno on this Mac): copy it into an otherwise empty directory,
 * so nothing next to it can resolve, and run Deno in Docker:
 *
 *   mkdir -p /tmp/dc/send-blast && cp .dashboard-builds/send-blast/index.ts /tmp/dc/send-blast/
 *   docker run --rm -v /tmp/dc:/w -w /w denoland/deno:2.1.4 deno check --node-modules-dir=none send-blast/index.ts
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DashboardBuildError,
  bundleFunction,
  isDashboardBuild,
  renderBanner,
} from './edge-dashboard/bundle.mjs';

const ROOT = realpathSync(join(dirname(fileURLToPath(import.meta.url)), '..'));
const REPO_FUNCTIONS = join(ROOT, 'infra', 'supabase', 'functions');
const USAGE =
  'usage: pnpm edge:dashboard-build <function>... | --all  [--functions-dir <dir>] [--out-dir <dir>]';

function parseArgs(argv) {
  const opts = { names: [], all: false, functionsDir: null, outDir: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (!v || v.startsWith('--')) die(`${arg} needs a value\n${USAGE}`);
      return v;
    };
    // pnpm passes a separating `--` through (`pnpm edge:dashboard-build -- send-blast`).
    if (arg === '--') continue;
    if (arg === '--all') opts.all = true;
    else if (arg === '--functions-dir') opts.functionsDir = value();
    else if (arg === '--out-dir') opts.outDir = value();
    else if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else if (arg.startsWith('--')) die(`unknown option ${arg}\n${USAGE}`);
    else opts.names.push(arg);
  }
  if (opts.all === opts.names.length > 0) die(USAGE);
  return opts;
}

function die(message) {
  console.error(`[edge:dashboard-build] ${message}`);
  process.exit(1);
}

/** `p` itself if it exists, else its nearest existing ancestor's real path plus the rest. */
function realish(p) {
  if (existsSync(p)) return realpathSync(p);
  const up = dirname(p);
  return up === p ? p : join(realish(up), basename(p));
}

const isWithin = (dir, p) => {
  const rel = relative(dir, p);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
};

/** A path as a shell word: `~/…` under the home directory (no user name in a deployed file). */
function shellPath(p) {
  const home = homedir();
  const [prefix, rest] = home !== sep && isWithin(home, p) ? ['~/', relative(home, p)] : ['', p];
  return prefix + (/^[\w@%+=:,./-]*$/.test(rest) ? rest : `'${rest.replace(/'/g, `'\\''`)}'`);
}

function isOurBuild(path) {
  try {
    return isDashboardBuild(readFileSync(path, 'utf8'));
  } catch {
    return false;
  }
}

/** "fix/edge-authz @ df45e7ef, with uncommitted changes" — or null outside a git checkout. */
function provenance(functionsDir) {
  const git = (...args) => {
    const r = spawnSync('git', ['-C', functionsDir, ...args], { encoding: 'utf8' });
    return r.status === 0 ? r.stdout.trim() : null;
  };
  const top = git('rev-parse', '--show-toplevel');
  if (!top) return { top: null, label: null };
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  const sha = git('rev-parse', '--short', 'HEAD');
  const dirty = git('status', '--porcelain', '--', '.');
  return {
    top,
    label: `${branch} @ ${sha}${dirty ? ', with uncommitted changes under functions/' : ''}`,
  };
}

const opts = parseArgs(process.argv.slice(2));
// `pnpm <script>` runs from the repo root; INIT_CWD is where it was typed, which is what a
// relative --functions-dir / --out-dir means to the person typing it.
const CWD = process.env.INIT_CWD ?? process.cwd();
const givenFunctionsDir = resolve(CWD, opts.functionsDir ?? REPO_FUNCTIONS);
if (!existsSync(givenFunctionsDir)) die(`--functions-dir ${givenFunctionsDir} does not exist`);
const functionsDir = realpathSync(givenFunctionsDir);
if (!existsSync(join(functionsDir, '_shared'))) {
  die(`${functionsDir} has no _shared/ directory; is it a functions directory?`);
}
const outDir = realish(resolve(CWD, opts.outDir ?? join(ROOT, '.dashboard-builds')));
// <out-dir>/<fn>/index.ts inside a functions directory IS a function's source.
for (const dir of [functionsDir, realish(REPO_FUNCTIONS)]) {
  if (isWithin(dir, outDir)) {
    die(
      `--out-dir ${outDir} is inside the functions directory ${dir}; builds would overwrite the ` +
        `function sources there. Use a directory outside it (the default is .dashboard-builds/).`,
    );
  }
}
if (existsSync(join(outDir, '_shared'))) {
  die(`--out-dir ${outDir} has a _shared/ directory, so it looks like a functions directory`);
}
// What the banner records: the command that rebuilds the same file, from any checkout.
const functionsDirFlag =
  functionsDir === realish(REPO_FUNCTIONS) ? '' : ` --functions-dir ${shellPath(functionsDir)}`;

const available = readdirSync(functionsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !/^[_.]/.test(d.name))
  .filter((d) => existsSync(join(functionsDir, d.name, 'index.ts')))
  .map((d) => d.name)
  .sort();
const names = opts.all ? available : opts.names;
const unknown = names.filter((n) => !available.includes(n));
if (unknown.length)
  die(`no such function: ${unknown.join(', ')}\navailable: ${available.join(', ')}`);

const origin = provenance(functionsDir);
const show = (p) => {
  const rel = relative(CWD, p);
  return rel.startsWith('..') ? p : rel || '.';
};
console.log(
  `[edge:dashboard-build] from ${show(functionsDir)}${origin.label ? ` (${origin.label})` : ''}`,
);

let failed = 0;
for (const name of names) {
  const target = join(outDir, name, 'index.ts');
  try {
    if (existsSync(target) && !isOurBuild(target)) {
      throw new DashboardBuildError(
        `${show(target)} exists and is not a dashboard build (no GENERATED banner); refusing to ` +
          `overwrite it`,
      );
    }
    const { code, inlined } = bundleFunction({ functionsDir, name });
    const entry = join(functionsDir, name, 'index.ts');
    const banner = renderBanner({
      source: origin.top ? relative(origin.top, entry) : entry,
      provenance: origin.label,
      inlined,
      command: `pnpm edge:dashboard-build ${name}${functionsDirFlag}`,
    });
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, banner + code);
    const secrets = [
      ...new Set([...code.matchAll(/Deno\.env\.get\(\s*['"]([A-Z0-9_]+)['"]/g)].map((x) => x[1])),
    ]
      .filter((s) => !/^SUPABASE_(URL|ANON_KEY|SERVICE_ROLE_KEY)$/.test(s))
      .sort();
    console.log(`  ✔ ${name} → ${show(target)}`);
    console.log(
      `      inlined: ${inlined.length ? inlined.join(', ') : 'nothing (deployable as is)'}`,
    );
    console.log(
      `      secrets: ${secrets.length ? secrets.join(', ') : 'none beyond the platform defaults'}`,
    );
  } catch (e) {
    failed++;
    // Never leave an older build behind for a function that no longer builds, and never delete
    // anything that is not one.
    if (isOurBuild(target)) rmSync(target);
    const message = e instanceof DashboardBuildError ? e.message : (e?.stack ?? String(e));
    console.error(`  ✘ ${name}: ${message}`);
  }
}

if (failed) {
  console.error(
    `\n[edge:dashboard-build] ${failed} of ${names.length} failed; nothing was written for those, ` +
      `and any earlier build of them was deleted.`,
  );
  process.exit(1);
}
