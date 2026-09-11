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

export function writeManifest(m: Manifest) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, 'manifest.json'), JSON.stringify(m, null, 2));
}
export function readManifest(): Manifest {
  return JSON.parse(readFileSync(resolve(OUT_DIR, 'manifest.json'), 'utf8')) as Manifest;
}
