import { existsSync } from 'node:fs';
import { CONFIG } from './driver/config';
import { run } from './driver/proc';
import { APP_PATH } from './driver/app';
import { dbHealthy } from './fixtures/db';
import { mailpitHealthy } from './fixtures/mailpit';

async function stackHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${CONFIG.supabaseUrl}/auth/v1/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export default async function globalSetup(): Promise<void> {
  const problems: string[] = [];

  if (!(await stackHealthy())) {
    problems.push(`Supabase API not responding at ${CONFIG.supabaseUrl} — start it: export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token && pnpm dlx supabase@2.117.0 --workdir infra start`);
  }
  if (!(await mailpitHealthy())) {
    problems.push(`Mailpit not responding at ${CONFIG.mailpitUrl} (part of the supabase stack).`);
  }
  if (!(await dbHealthy())) {
    problems.push(`Postgres container ${CONFIG.dbContainer} not reachable via docker exec.`);
  }

  // PARSE the listing, do not pattern-match it. This was a regex allowing 200
  // characters between the udid and its "state" key, and Xcode 27 added
  // `lastUsedAt` and `logPathSize` to every device entry — pushing the real gap
  // to 245 and making a booted simulator report as not booted. The whole suite
  // then failed in global setup, a long way from the cause. scripts/e2e/run.mjs
  // has always parsed this properly; this is the copy that did not.
  const sim = await run('xcrun', ['simctl', 'list', 'devices', '-j']);
  let device: { udid: string; state?: string } | undefined;
  if (sim.code === 0) {
    try {
      const listing = JSON.parse(sim.stdout) as { devices: Record<string, { udid: string; state?: string }[]> };
      device = Object.values(listing.devices).flat().find((d) => d.udid === CONFIG.udid);
    } catch {
      problems.push('xcrun simctl list devices -j did not return JSON.');
    }
  }
  if (sim.code !== 0 || (!device && !problems.some((p) => p.startsWith('xcrun')))) {
    problems.push(`Simulator ${CONFIG.udid} not found (set E2E_UDID or create the device).`);
  } else if (device && device.state !== 'Booted') {
    problems.push(
      `Simulator ${CONFIG.udid} is ${device.state ?? 'in an unknown state'}, not Booted — ` +
        'the orchestrator (scripts/e2e/run.mjs) boots it.',
    );
  }

  if (!existsSync(APP_PATH)) {
    problems.push(`Built app missing at ${APP_PATH} — run via the orchestrator (pnpm --filter mobile e2e) or set E2E_APP_PATH.`);
  }

  if (problems.length) {
    throw new Error(`E2E preflight failed:\n- ${problems.join('\n- ')}`);
  }
}
