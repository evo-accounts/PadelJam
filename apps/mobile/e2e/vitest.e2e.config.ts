import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    include: ['suites/**/*.e2e.ts'],
    // 99-* are scratch/repro tests (e.g. bug investigations) — never part of the suite.
    //
    // This exclusion is applied to the FOUND FILES, so it also beats a positional
    // filter: `--suite 99` through run.mjs (which pushes `suites/99` as exactly
    // that), `e2e:test -- suites/99-…`, and a CLI `--exclude` override all collect
    // ZERO files, not the one you named. There is no flag that runs a 99-* spec.
    // Rename it to a free non-99 prefix for the run and rename it back after —
    // see "Scratch specs" in README.md.
    exclude: ['suites/99-*'],
    environment: 'node',
    // One simulator, one app: strictly sequential.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 180_000,
    hookTimeout: 600_000,
    globalSetup: resolve(__dirname, 'global-setup.ts'),
    setupFiles: [resolve(__dirname, 'setup.ts')],
    root: __dirname,
  },
});
