import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    include: ['suites/**/*.e2e.ts'],
    // 99-* are scratch/repro tests (e.g. bug investigations) — never part of the suite.
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
