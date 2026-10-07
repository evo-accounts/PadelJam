/**
 * The pure half of `scripts/build-dashboard-function.mjs`: turns one edge function plus the
 * `_shared/` modules it imports into a single self-contained `index.ts`. No filesystem writes and
 * no git here (reads go through an injectable `readFile`), so `bundle.test.mjs` can drive it with
 * in-memory files under plain `node --test`.
 *
 * WHAT IT DOES. Each `import { a, b } from '../_shared/x.ts'` is replaced by x.ts's source, inlined
 * once, after the modules x.ts itself imports from `_shared/` (depth-first, so a dependency is
 * always declared before the code that uses it). `export` is dropped from the inlined declarations
 * and every other byte of them is kept, comments included. Remote imports (`jsr:`, `npm:`, `node:`,
 * `https://`) from the function and from every inlined module are hoisted into one import block
 * and de-duplicated, so two modules importing `createClient` from the same specifier end up with
 * one import of it.
 *
 * WHAT IT REFUSES, and why it refuses rather than guesses. Inlining puts every module's top level
 * into ONE scope, so anything that relied on module boundaries either has to be proved harmless or
 * stopped. Each refusal throws a DashboardBuildError naming the file and line:
 *
 *   - default, namespace, aliased (`a as b`) or side-effect-only imports of a `_shared` module —
 *     inlining makes the module's names the importer's names, so only a plain named import maps
 *     onto that without renaming anything;
 *   - importing a name the module does not export (a private helper would inline fine and then
 *     work by accident, hiding a bug the real bundler would report);
 *   - relative imports that resolve outside `_shared/`, dynamic or type-level `import()` of a
 *     relative path, and bare specifiers (they need an import map, which a dashboard deploy lacks);
 *   - `export default`, `export =`, re-exports and aliased export lists in a `_shared` module,
 *     plus `import.meta` and triple-slash directives there (both change meaning once inlined);
 *   - a top-level name declared by two of the inlined files (the function counts as one), or
 *     imported from two different places under one local name;
 *   - CAPTURE: a file that uses a global (`fetch`, `Response`, `URL`, …) while another inlined file
 *     declares a top-level binding of the same name. That one compiles cleanly and silently
 *     rebinds the global, so it is the refusal most worth having. "Uses a global" means an
 *     identifier the TypeScript checker cannot resolve inside its own file;
 *   - a `// @deno-types`, `// @ts-ignore` or `// @ts-expect-error` comment above any import. The
 *     import moves into the block (or merges with another), the comment stays behind, and it then
 *     applies to whatever line follows it.
 *
 * EVALUATION ORDER, the other thing inlining could change without a compile error. ESM runs every
 * imported module, depth-first, before the importer's own code. The bundle keeps that order by
 * putting the inlined modules in the same depth-first order at the position of the function's
 * first import, which is only "before everything" when nothing but comments comes above that
 * import. So two more refusals:
 *
 *   - a statement above the function's first import, when anything is inlined (it would run
 *     before the inlined modules instead of after them);
 *   - a `_shared` module that ESM would never run but that does work at its top level. A module
 *     runs only if a module that runs imports a VALUE from it; one imported only for its types
 *     (`import type`, `{ type X }`, or names it declares only as interfaces or type aliases,
 *     which TypeScript erases too) is never evaluated, yet inlined, its top level runs. "Does
 *     work" means a top-level statement that is not a declaration, or a call, `new`, assignment,
 *     `await`, decorator or static class initializer evaluated outside any function body (a
 *     getter run by a plain property read is the one effect this does not see).
 *
 * Remote imports are hoisted above all inlined code. ESM interleaves them instead (the function's
 * `npm:x` imported after `../_shared/a.ts` evaluates after a.ts); for that to matter, a shared
 * module would need a top-level side effect a remote package observes while it loads.
 */
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

export class DashboardBuildError extends Error {
  name = 'DashboardBuildError';
}

/** Specifiers that resolve on the hosted edge runtime without an import map. */
const REMOTE_SPECIFIER = /^(?:jsr:|npm:|node:|https:\/\/)/;
const isRelative = (spec) => spec.startsWith('./') || spec.startsWith('../');

const END_MARKER = '// ---- end of inlined modules ----';
const BANNER_RULE = `// ${'-'.repeat(93)}`;
const BANNER_MARK = '// GENERATED FILE. DO NOT EDIT';
const MAX_IMPORT_LINE = 100;

/**
 * @param {object} options
 * @param {string} options.functionsDir  the `functions/` directory (holds `<name>/` and `_shared/`)
 * @param {string} options.name          the function to build, e.g. `send-blast`
 * @param {(path: string) => string} [options.readFile]
 * @returns {{ code: string, inlined: string[], remote: string[] }} `inlined` holds the inlined
 *   modules' paths as the function would spell them (`../_shared/email.ts`), in inlining order.
 */
export function bundleFunction({ functionsDir, name, readFile = (p) => readFileSync(p, 'utf8') }) {
  const root = resolve(functionsDir);
  const sharedDir = resolve(root, '_shared');
  const entryPath = resolve(root, name, 'index.ts');
  const entryDir = dirname(entryPath);
  const label = (p) => relative(root, p).split(sep).join('/');
  const fromEntry = (p) => relative(entryDir, p).split(sep).join('/');

  /** @type {Map<string, ReturnType<typeof analyzeModule>>} */
  const modules = new Map();
  const load = (path, role, requestedBy) => {
    const cached = modules.get(path);
    if (cached) return cached;
    let text;
    try {
      text = readFile(path);
    } catch (e) {
      const why = e?.code === 'ENOENT' ? 'no such file' : (e?.message ?? String(e));
      throw new DashboardBuildError(`${requestedBy}: cannot read ${label(path)} (${why})`);
    }
    const module = analyzeModule({ path, text, role, label: label(path), sharedDir });
    modules.set(path, module);
    return module;
  };

  const entry = load(entryPath, 'entry', `function '${name}'`);

  // Depth-first, post-order: a module lands after everything it imports from _shared/. The entry
  // cannot be part of a cycle (shared modules may only import shared modules), so only the
  // shared graph needs the "visiting" guard.
  const order = [];
  const state = new Map();
  const visit = (module, chain) => {
    for (const imp of module.sharedImports) {
      const dep = load(imp.resolved, 'shared', `${module.label}:${imp.line}`);
      for (const b of imp.names) {
        if (!dep.exported.has(b.imported)) {
          throw new DashboardBuildError(
            `${module.label}:${imp.line}: '${b.imported}' is not exported by ${dep.label}` +
              (dep.declared.has(b.imported) ? ' (it is declared there, but not exported)' : ''),
          );
        }
      }
      const seen = state.get(dep.path);
      if (seen === 'done') continue;
      if (seen === 'visiting') {
        throw new DashboardBuildError(
          `import cycle between shared modules: ${[...chain, dep.label].join(' -> ')}`,
        );
      }
      state.set(dep.path, 'visiting');
      visit(dep, [...chain, dep.label]);
      state.set(dep.path, 'done');
      order.push(dep);
    }
  };
  visit(entry, [entry.label]);

  const all = [entry, ...order];

  // The block lands where the first import was; anything above it would run before the inlined
  // modules, while ESM runs every import before the importer's first statement. With nothing to
  // inline, the block holds only imports, which the language hoists wherever they sit.
  const firstStatement = entry.sf.statements[0];
  if (order.length && firstStatement !== entry.importNodes[0]) {
    throw new DashboardBuildError(
      `${entry.label}:${line(entry.sf, firstStatement.getStart(entry.sf))}: this statement comes ` +
        `before the first import, so in the build it would run BEFORE the inlined modules (ESM ` +
        `runs every import first). Move the imports to the top of the file.`,
    );
  }

  // Which inlined modules ESM would run at all: those that a running module imports at least one
  // value from. Importers come before what they import in reverse post-order, so one pass settles
  // it. A module reached only for its types is erased from the original, but its inlined top
  // level runs in the build, so that top level must not do anything.
  const runs = new Set([entry]);
  for (const m of [entry, ...[...order].reverse()]) {
    if (!runs.has(m)) continue;
    for (const imp of m.sharedImports) {
      const dep = modules.get(imp.resolved);
      if (imp.names.some((b) => !b.typeOnly && !dep.typeNames.has(b.imported))) runs.add(dep);
    }
  }
  for (const m of order) {
    if (runs.has(m) || !m.work) continue;
    const snippet = m.work.getText(m.sf).split('\n')[0].trim();
    throw new DashboardBuildError(
      `${m.label}:${line(m.sf, m.work.getStart(m.sf))}: only types are imported from this module, ` +
        `so ESM never runs it, but inlined, its top level would run: \`${snippet.slice(0, 60)}` +
        `${snippet.length > 60 ? '…' : ''}\`. Move that into a function (or import a value from ` +
        `the module, so the original runs it too).`,
    );
  }

  // Top-level declarations: one owner per name across the whole bundle.
  const owners = new Map();
  for (const m of all) {
    for (const n of m.declared) {
      const prev = owners.get(n);
      if (prev && prev !== m.label) {
        throw new DashboardBuildError(
          `top-level name '${n}' is declared in both ${prev} and ${m.label}; inlined, they would ` +
            `share one scope. Rename one of them.`,
        );
      }
      owners.set(n, m.label);
    }
  }

  // Remote imports: grouped by specifier (insertion order = the function's own imports first,
  // then each inlined module's), de-duplicated by (imported name, local name).
  const groups = new Map();
  const remoteLocals = new Map();
  for (const m of all) {
    for (const imp of m.remoteImports) {
      if (!groups.has(imp.specifier)) groups.set(imp.specifier, new Map());
      const group = groups.get(imp.specifier);
      for (const b of imp.bindings) {
        const owner = owners.get(b.local);
        if (owner) {
          throw new DashboardBuildError(
            `${m.label}:${imp.line}: '${b.local}' is imported from '${imp.specifier}' here but ` +
              `declared at the top level of ${owner}; inlined, they would share one scope.`,
          );
        }
        const prev = remoteLocals.get(b.local);
        if (prev && (prev.specifier !== imp.specifier || prev.imported !== b.imported)) {
          throw new DashboardBuildError(
            `'${b.local}' means ${describe(prev)} in ${prev.label} but ${describe({ ...b, specifier: imp.specifier })} ` +
              `in ${m.label}; inlined, one import would have to serve both.`,
          );
        }
        if (!prev) remoteLocals.set(b.local, { ...b, specifier: imp.specifier, label: m.label });
        const key = `${b.imported}\0${b.local}`;
        const same = group.get(key);
        // A value import satisfies a type-only use of the same binding, not the other way round.
        group.set(key, same ? { ...same, typeOnly: same.typeOnly && b.typeOnly } : { ...b });
      }
    }
  }

  // Capture: a global used in one file, declared at the top level of another.
  for (const m of all) {
    for (const n of m.free) {
      const owner = owners.get(n) ?? (remoteLocals.has(n) ? remoteLocals.get(n).label : null);
      if (owner && owner !== m.label) {
        throw new DashboardBuildError(
          `${m.label} uses the global '${n}', but ${owner} declares a top-level '${n}' ` +
            `(${owners.has(n) ? 'declaration' : 'import'}); inlined, it would silently replace the ` +
            `global. Rename the declaration.`,
        );
      }
    }
  }

  const sections = order.map(
    (m) => `// ---- inlined from ${fromEntry(m.path)} ----\n${inlinedBody(m)}`,
  );
  const block = [
    renderImports(groups),
    sections.length ? `${sections.join('\n\n')}\n${END_MARKER}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  // The function's first import becomes the whole block, so its header comment stays on top and
  // anything between imports keeps its place after the inlined code (imports run first anyway).
  // The block ends in a line comment (END_MARKER), so it always ends its line: whatever followed
  // the import on the same line — code, another import — starts the next line instead of
  // silently becoming part of that comment.
  const edits = entry.importNodes.map((node, i) => {
    const start = node.getStart(entry.sf);
    if (i > 0) return { ...lineRange(entry.text, start, node.getEnd()), text: '' };
    if (ownsLine(entry.text, start, node.getEnd())) {
      return { ...lineRange(entry.text, start, node.getEnd()), text: `${block}\n` };
    }
    const end = skipBlanks(entry.text, node.getEnd());
    return { start, end, text: atLineBreak(entry.text, end) ? block : `${block}\n` };
  });
  const code = applyEdits(entry.text, edits);

  return { code, inlined: order.map((m) => fromEntry(m.path)), remote: [...groups.keys()] };
}

/**
 * The banner that heads every build. `source` is the function's path as the repo spells it
 * (`infra/supabase/functions/send-blast/index.ts`); `provenance` is e.g. `main @ f789b794`.
 */
export function renderBanner({ source, provenance, inlined, command }) {
  const lines = [
    BANNER_RULE,
    `${BANNER_MARK}: change the repo sources and rebuild. Edits made here are lost on`,
    '// the next build and never reach the repo.',
    `//   source:  ${source}${provenance ? ` (${provenance})` : ''}`,
    `//   built:   ${command}`,
  ];
  if (inlined.length) {
    lines.push(
      '// The Supabase dashboard editor deploys a function on its own, so its `../_shared/*` imports',
      '// cannot resolve there. These modules are inlined below, verbatim apart from `export` (their',
      '// own imports, if any, join the import block):',
      ...inlined.map((p) => `//   ${p}`),
    );
  } else {
    lines.push('// Nothing to inline: this function imports no `_shared` module.');
  }
  lines.push(
    '// How to deploy it: the header of scripts/build-dashboard-function.mjs.',
    BANNER_RULE,
  );
  return `${lines.join('\n')}\n`;
}

/**
 * Whether `text` is a build this script wrote (it opens with the banner). The CLI overwrites or
 * deletes only such files, so a mistyped --out-dir can never cost a source file.
 */
export function isDashboardBuild(text) {
  return text.startsWith(`${BANNER_RULE}\n${BANNER_MARK}`);
}

// --------------------------------------------------------------------------------------------
// Per-file analysis
// --------------------------------------------------------------------------------------------

function analyzeModule({ path, text, role, label, sharedDir }) {
  const fail = (node, message) => {
    const at = node ? `:${line(sf, node.getStart(sf))}` : '';
    throw new DashboardBuildError(`${label}${at}: ${message}`);
  };
  if (role === 'shared' && !path.endsWith('.ts')) {
    throw new DashboardBuildError(`${label}: only .ts modules in _shared/ can be inlined`);
  }

  const { sf, checker, syntaxErrors } = parse(path, text);
  if (syntaxErrors.length) {
    const d = syntaxErrors[0];
    throw new DashboardBuildError(
      `${label}:${line(sf, d.start ?? 0)}: syntax error: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`,
    );
  }
  if (
    role === 'shared' &&
    (sf.referencedFiles.length ||
      sf.typeReferenceDirectives.length ||
      sf.libReferenceDirectives.length)
  ) {
    fail(null, 'triple-slash directives only work at the top of a file, and this one is inlined');
  }

  const m = {
    path,
    text,
    sf,
    label,
    role,
    importNodes: [],
    sharedImports: [],
    remoteImports: [],
    declared: new Set(),
    exported: new Set(),
    /** Names declared only as interfaces or type aliases: importing just these is erased. */
    typeNames: new Set(),
    /** The first top-level node that does work when the module runs (see topLevelWork). */
    work: role === 'shared' ? topLevelWork(sf) : null,
    free: new Set(),
    edits: [],
  };
  const valueNames = new Set();

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st)) {
      readImport(st, m, { sharedDir, fail });
      continue;
    }
    if (ts.isImportEqualsDeclaration(st)) fail(st, '`import x = …` is not supported');
    if (ts.isExportDeclaration(st)) {
      const spec =
        st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)
          ? st.moduleSpecifier.text
          : null;
      if (spec !== null && (role === 'shared' || !REMOTE_SPECIFIER.test(spec))) {
        fail(st, `re-export from '${spec}' cannot be inlined`);
      }
      if (role === 'shared') {
        for (const el of st.exportClause?.elements ?? []) {
          if (el.propertyName && el.propertyName.text !== el.name.text) {
            fail(
              el,
              `aliased export '${el.propertyName.text} as ${el.name.text}' cannot be inlined`,
            );
          }
          m.exported.add(el.name.text);
        }
        m.edits.push({ ...lineRange(text, st.getStart(sf), st.getEnd()), text: '' });
      }
      continue;
    }
    if (ts.isExportAssignment(st)) {
      if (role === 'shared') fail(st, '`export default` / `export =` cannot be inlined');
      continue;
    }

    const names = declaredNames(st);
    for (const n of names) m.declared.add(n);
    const typeLevel = ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st);
    for (const n of names) (typeLevel ? m.typeNames : valueNames).add(n);
    if (role !== 'shared') continue;
    const modifiers = ts.canHaveModifiers(st) ? (ts.getModifiers(st) ?? []) : [];
    const exp = modifiers.find((k) => k.kind === ts.SyntaxKind.ExportKeyword);
    if (!exp) continue;
    if (modifiers.some((k) => k.kind === ts.SyntaxKind.DefaultKeyword)) {
      fail(st, '`export default` cannot be inlined');
    }
    for (const n of names) m.exported.add(n);
    m.edits.push({ start: exp.getStart(sf), end: skipBlanks(text, exp.getEnd()), text: '' });
  }
  // `interface X` merged with `const X` / `class X` is a value too.
  for (const n of valueNames) m.typeNames.delete(n);

  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (!arg || !ts.isStringLiteralLike(arg)) {
        fail(node, 'dynamic import() with a computed specifier cannot be checked');
      }
      if (!REMOTE_SPECIFIER.test(arg.text))
        fail(node, `dynamic import('${arg.text}') cannot be inlined`);
    }
    if (ts.isImportTypeNode(node)) {
      const lit = ts.isLiteralTypeNode(node.argument) ? node.argument.literal : null;
      if (!lit || !ts.isStringLiteral(lit) || !REMOTE_SPECIFIER.test(lit.text)) {
        fail(
          node,
          `type-level import(${lit && ts.isStringLiteral(lit) ? `'${lit.text}'` : '…'}) cannot be inlined`,
        );
      }
    }
    if (
      role === 'shared' &&
      ts.isMetaProperty(node) &&
      node.keywordToken === ts.SyntaxKind.ImportKeyword
    ) {
      fail(node, '`import.meta` would describe the bundle, not this module, once inlined');
    }
    if (ts.isIdentifier(node) && !isNameOnly(node)) {
      const p = node.parent;
      const symbol =
        ts.isShorthandPropertyAssignment(p) && p.name === node
          ? checker.getShorthandAssignmentValueSymbol(p)
          : checker.getSymbolAtLocation(node);
      // Unresolved, or the checker's placeholder for an unresolved type: a global (or a typo,
      // which deno check reports separately).
      if (!symbol || !symbol.declarations?.length) m.free.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  return m;
}

function readImport(st, m, { sharedDir, fail }) {
  const spec = st.moduleSpecifier.text;
  const lineNo = line(m.sf, st.getStart(m.sf));
  if (st.attributes) fail(st, `import attributes on '${spec}' are not supported`);
  // Every import is moved or removed (the entry's first one becomes the block, whose first line
  // is not necessarily this import any more), while its leading comments stay where they are.
  // These three apply to the next line or import, which would then be some other code.
  for (const c of ts.getLeadingCommentRanges(m.text, st.getFullStart()) ?? []) {
    const pragma = /^(?:\/\/|\/\*+)\s*(@deno-types|@ts-ignore|@ts-expect-error)\b/.exec(
      m.text.slice(c.pos, c.end),
    );
    if (pragma) {
      fail(
        st,
        `a \`${pragma[1]}\` comment above the import of '${spec}' would be left behind when the ` +
          `import moves into the hoisted import block, and would then apply to other code`,
      );
    }
  }
  const clause = st.importClause;
  m.importNodes.push(st);

  if (isRelative(spec)) {
    const resolved = resolve(dirname(m.path), spec);
    const inShared = relative(sharedDir, resolved);
    if (!inShared || inShared.startsWith('..') || isAbsolute(inShared)) {
      fail(
        st,
        `relative import '${spec}' resolves outside _shared/; only _shared modules are inlined`,
      );
    }
    const elements =
      clause?.namedBindings && ts.isNamedImports(clause.namedBindings)
        ? clause.namedBindings.elements
        : [];
    if (clause?.name) fail(st, `default import of '${spec}': import its named exports instead`);
    if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      fail(st, `namespace import of '${spec}': import its named exports instead`);
    }
    if (elements.length === 0) {
      fail(st, `side-effect-only import of '${spec}': import the names it provides instead`);
    }
    const names = elements.map((el) => {
      if (el.propertyName && el.propertyName.text !== el.name.text) {
        fail(
          el,
          `aliased import '${el.propertyName.text} as ${el.name.text}' from '${spec}' cannot be inlined`,
        );
      }
      return {
        imported: el.name.text,
        local: el.name.text,
        typeOnly: clause.isTypeOnly || el.isTypeOnly,
      };
    });
    m.sharedImports.push({ specifier: spec, resolved, names, line: lineNo });
    return;
  }

  if (!REMOTE_SPECIFIER.test(spec)) {
    fail(
      st,
      `unsupported specifier '${spec}': a dashboard deploy has no import map, so only jsr:, npm:, ` +
        `node:, https:// and ../_shared/*.ts imports work`,
    );
  }
  const bindings = [];
  if (clause?.name)
    bindings.push({ imported: 'default', local: clause.name.text, typeOnly: clause.isTypeOnly });
  const nb = clause?.namedBindings;
  if (nb && ts.isNamespaceImport(nb))
    bindings.push({ imported: '*', local: nb.name.text, typeOnly: clause.isTypeOnly });
  if (nb && ts.isNamedImports(nb)) {
    for (const el of nb.elements) {
      if (el.propertyName && !ts.isIdentifier(el.propertyName)) {
        fail(el, 'string-literal import names are not supported');
      }
      bindings.push({
        imported: (el.propertyName ?? el.name).text,
        local: el.name.text,
        typeOnly: clause.isTypeOnly || el.isTypeOnly,
      });
    }
  }
  m.remoteImports.push({ specifier: spec, bindings, line: lineNo });
}

function parse(path, text) {
  // A one-file program: no lib, no resolution. The checker can still bind every name declared in
  // the file, which is all the capture check needs; anything it cannot resolve is a global.
  const host = {
    getSourceFile: (f, version) =>
      f === path ? ts.createSourceFile(f, text, version, true, ts.ScriptKind.TS) : undefined,
    writeFile() {},
    getDefaultLibFileName: () => '/lib.d.ts',
    useCaseSensitiveFileNames: () => true,
    getCanonicalFileName: (f) => f,
    getCurrentDirectory: () => dirname(path),
    getNewLine: () => '\n',
    fileExists: (f) => f === path,
    readFile: (f) => (f === path ? text : undefined),
  };
  const program = ts.createProgram(
    [path],
    {
      noLib: true,
      noResolve: true,
      types: [],
      noEmit: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      allowImportingTsExtensions: true,
    },
    host,
  );
  const sf = program.getSourceFile(path);
  return {
    sf,
    checker: program.getTypeChecker(),
    syntaxErrors: program.getSyntacticDiagnostics(sf),
  };
}

/**
 * The first thing at a module's top level that does work when the module is evaluated, or null.
 * Declarations are inert except for what they evaluate on the spot: variable initializers, enum
 * members, and a class's `extends` clause, decorators, computed names and static members. A
 * function body, or a class's methods and instance fields, run only when called, so they are
 * skipped. Anything else at the top level (an `if`, a bare call, a non-ambient namespace) is work.
 */
function topLevelWork(sf) {
  const isStatic = (n) => ts.getModifiers(n)?.some((k) => k.kind === ts.SyntaxKind.StaticKeyword);
  let found = null;
  const walk = (n) => {
    if (found) return;
    if (
      ts.isCallExpression(n) ||
      ts.isNewExpression(n) ||
      ts.isTaggedTemplateExpression(n) ||
      ts.isDecorator(n) ||
      ts.isAwaitExpression(n) ||
      ts.isYieldExpression(n) ||
      ts.isDeleteExpression(n) ||
      ts.isClassStaticBlockDeclaration(n) ||
      ((ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) &&
        (n.operator === ts.SyntaxKind.PlusPlusToken ||
          n.operator === ts.SyntaxKind.MinusMinusToken)) ||
      (ts.isBinaryExpression(n) &&
        n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        n.operatorToken.kind <= ts.SyntaxKind.LastAssignment)
    ) {
      found = n;
      return;
    }
    const deferred =
      ts.isFunctionDeclaration(n) ||
      ts.isFunctionExpression(n) ||
      ts.isArrowFunction(n) ||
      ts.isMethodDeclaration(n) ||
      ts.isGetAccessorDeclaration(n) ||
      ts.isSetAccessorDeclaration(n) ||
      ts.isConstructorDeclaration(n) ||
      (ts.isPropertyDeclaration(n) && !isStatic(n));
    if (deferred) {
      // The body waits for a call, but a member's decorators and computed name do not.
      for (const d of (ts.canHaveDecorators(n) && ts.getDecorators(n)) || []) walk(d);
      if (n.name && ts.isComputedPropertyName(n.name)) walk(n.name);
      return;
    }
    ts.forEachChild(n, walk);
  };
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) || ts.isExportDeclaration(st)) continue;
    if (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) continue;
    const modifiers = ts.canHaveModifiers(st) ? (ts.getModifiers(st) ?? []) : [];
    if (modifiers.some((k) => k.kind === ts.SyntaxKind.DeclareKeyword)) continue;
    if (
      ts.isFunctionDeclaration(st) ||
      ts.isVariableStatement(st) ||
      ts.isClassDeclaration(st) ||
      ts.isEnumDeclaration(st)
    ) {
      // walk skips a function declaration's body and searches the others.
      walk(st);
      if (found) return found;
      continue;
    }
    return st;
  }
  return null;
}

function declaredNames(st) {
  if (
    ts.isFunctionDeclaration(st) ||
    ts.isClassDeclaration(st) ||
    ts.isInterfaceDeclaration(st) ||
    ts.isTypeAliasDeclaration(st) ||
    ts.isEnumDeclaration(st)
  ) {
    return st.name ? [st.name.text] : [];
  }
  if (ts.isModuleDeclaration(st)) {
    // `namespace N` declares N; `declare global` and `declare module 'x'` declare nothing here.
    const global = (st.flags & ts.NodeFlags.GlobalAugmentation) !== 0;
    return ts.isIdentifier(st.name) && !global ? [st.name.text] : [];
  }
  if (ts.isVariableStatement(st)) {
    return st.declarationList.declarations.flatMap((d) => bindingNames(d.name));
  }
  return [];
}

function bindingNames(name) {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((el) => (ts.isOmittedExpression(el) ? [] : bindingNames(el.name)));
}

/** Identifiers that name a property or a label rather than refer to a binding. */
function isNameOnly(node) {
  const p = node.parent;
  if (!p) return false;
  if (ts.isPropertyAccessExpression(p) && p.name === node) return true;
  if (ts.isQualifiedName(p) && p.right === node) return true;
  if (
    (ts.isPropertyAssignment(p) ||
      ts.isPropertyDeclaration(p) ||
      ts.isPropertySignature(p) ||
      ts.isMethodDeclaration(p) ||
      ts.isMethodSignature(p) ||
      ts.isGetAccessorDeclaration(p) ||
      ts.isSetAccessorDeclaration(p) ||
      ts.isEnumMember(p) ||
      ts.isNamedTupleMember(p) ||
      ts.isJsxAttribute(p)) &&
    p.name === node
  ) {
    return true;
  }
  if (ts.isBindingElement(p) && p.propertyName === node) return true;
  if (
    ts.isImportSpecifier(p) ||
    ts.isExportSpecifier(p) ||
    ts.isImportClause(p) ||
    ts.isNamespaceImport(p)
  ) {
    return true;
  }
  if (ts.isLabeledStatement(p) || ts.isBreakOrContinueStatement(p) || ts.isMetaProperty(p))
    return true;
  return false;
}

// --------------------------------------------------------------------------------------------
// Text helpers
// --------------------------------------------------------------------------------------------

function inlinedBody(m) {
  const removals = m.importNodes.map((node) => ({
    ...lineRange(m.text, node.getStart(m.sf), node.getEnd()),
    text: '',
  }));
  return applyEdits(m.text, [...m.edits, ...removals])
    .replace(/^(?:[ \t]*\r?\n)+/, '')
    .replace(/\s+$/, '');
}

function renderImports(groups) {
  const quote = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const lines = [];
  for (const [spec, group] of groups) {
    const bindings = [...group.values()];
    if (bindings.length === 0) {
      lines.push(`import ${quote(spec)};`);
      continue;
    }
    for (const b of bindings.filter((x) => x.imported === 'default')) {
      lines.push(`import ${b.typeOnly ? 'type ' : ''}${b.local} from ${quote(spec)};`);
    }
    for (const b of bindings.filter((x) => x.imported === '*')) {
      lines.push(`import ${b.typeOnly ? 'type ' : ''}* as ${b.local} from ${quote(spec)};`);
    }
    const named = bindings.filter((x) => x.imported !== 'default' && x.imported !== '*');
    if (named.length === 0) continue;
    const allTypes = named.every((b) => b.typeOnly);
    const parts = named.map(
      (b) =>
        `${b.typeOnly && !allTypes ? 'type ' : ''}${b.imported === b.local ? b.local : `${b.imported} as ${b.local}`}`,
    );
    const head = `import ${allTypes ? 'type ' : ''}`;
    const tail = ` from ${quote(spec)};`;
    const oneLine = `${head}{ ${parts.join(', ')} }${tail}`;
    lines.push(
      oneLine.length <= MAX_IMPORT_LINE
        ? oneLine
        : `${head}{\n${parts.map((p) => `  ${p},`).join('\n')}\n}${tail}`,
    );
  }
  return lines.join('\n');
}

function describe(b) {
  if (b.imported === 'default') return `the default export of '${b.specifier}'`;
  if (b.imported === '*') return `the namespace of '${b.specifier}'`;
  return `'${b.imported}' from '${b.specifier}'`;
}

/** The statement's whole line(s), line break included, when nothing else shares them; else just the statement. */
function lineRange(text, start, end) {
  if (!ownsLine(text, start, end)) return { start, end };
  const e = skipBlanks(text, end);
  return {
    start: backOverBlanks(text, start),
    end: e + (text.startsWith('\r\n', e) ? 2 : e < text.length ? 1 : 0),
  };
}

/** Whether only blanks share the line(s) of the text between `start` and `end`. */
function ownsLine(text, start, end) {
  const s = backOverBlanks(text, start);
  return (s === 0 || text[s - 1] === '\n') && atLineBreak(text, skipBlanks(text, end));
}

function atLineBreak(text, pos) {
  return pos === text.length || text[pos] === '\n' || text.startsWith('\r\n', pos);
}

function skipBlanks(text, pos) {
  let p = pos;
  while (p < text.length && (text[p] === ' ' || text[p] === '\t')) p++;
  return p;
}

function backOverBlanks(text, pos) {
  let p = pos;
  while (p > 0 && (text[p - 1] === ' ' || text[p - 1] === '\t')) p--;
  return p;
}

function applyEdits(text, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let out = text;
  let floor = Infinity;
  for (const e of sorted) {
    if (e.end > floor) throw new Error(`overlapping edits at ${e.start}-${e.end}`); // a bug here, not in the input
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    floor = e.start;
  }
  return out;
}

function line(sf, pos) {
  return sf.getLineAndCharacterOfPosition(pos).line + 1;
}
