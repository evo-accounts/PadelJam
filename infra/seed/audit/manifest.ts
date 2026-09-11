// infra/seed/audit/manifest.ts
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OUT_DIR } from './env.ts';

export type Manifest = {
  seededAt: string;
  target: string;
  users: Record<string, string>;
  ids: Record<string, string>;
  skipped: string[];
};

const manifestPath = (target: string) => resolve(OUT_DIR, `manifest.${target}.json`);

export function writeManifest(m: Manifest) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(manifestPath(m.target), JSON.stringify(m, null, 2));
}
export function readManifest(target: string): Manifest {
  return JSON.parse(readFileSync(manifestPath(target), 'utf8')) as Manifest;
}
