// infra/seed/audit/context.ts
import type { Client } from './client.ts';
import type { Person } from './cast.ts';

export type Session = { id: string; jwt: string; person: Person };

/** Everything a domain module needs: the client, the signed-in cast, and ids created so far. */
export type Ctx = {
  c: Client;
  users: Record<string, Session>;          // by cast key
  ids: Record<string, string>;             // manifest ids, e.g. ids.C1, ids.G1, ids.E1
  log: (msg: string) => void;
};

export const u = (ctx: Ctx, key: string): Session => {
  const s = ctx.users[key];
  if (!s) throw new Error(`user ${key} not seeded`);
  return s;
};

export const NOW = new Date();
export const daysFromNow = (days: number, hour = 19) => {
  const d = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate(), hour, 0, 0));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
};
export const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
