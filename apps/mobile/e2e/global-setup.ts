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
    problems.push(`Supabase API not responding at ${CONFIG.supabaseUrl} — start it: export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=local_test_token && pnpm dlx supabase@latest --workdir infra start`);
  }
  if (!(await mailpitHealthy())) {
    problems.push(`Mailpit not responding at ${CONFIG.mailpitUrl} (part of the supabase stack).`);
  }
  if (!(await dbHealthy())) {
    problems.push(`Postgres container ${CONFIG.dbContainer} not reachable via docker exec.`);
  }

  const sim = await run('xcrun', ['simctl', 'list', 'devices', '-j']);
  if (sim.code !== 0 || !sim.stdout.includes(CONFIG.udid)) {
    problems.push(`Simulator ${CONFIG.udid} not found (set E2E_UDID or create the device).`);
  } else if (!new RegExp(`"${CONFIG.udid}"[\\s\\S]{0,200}?"state"\\s*:\\s*"Booted"`).test(sim.stdout)) {
    problems.push(`Simulator ${CONFIG.udid} is not booted — the orchestrator (scripts/e2e/run.mjs) boots it.`);
  }

  if (!existsSync(APP_PATH)) {
    problems.push(`Built app missing at ${APP_PATH} — run via the orchestrator (pnpm --filter mobile e2e) or set E2E_APP_PATH.`);
  }

  if (problems.length) {
    throw new Error(`E2E preflight failed:\n- ${problems.join('\n- ')}`);
  }
}
