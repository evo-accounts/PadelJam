// The Supabase stacks the mobile e2e can run against: the one place their names and ports are defined.
//
// `dev` is what infra/supabase/config.toml already says (project `padeljam`, 5532x). It is the
// agents' stack, a developer's stack and the one `pnpm test:db` uses. Its `cliEnv` is empty on
// purpose, so nothing here can change it.
//
// `ci` is the e2e runner's own stack (project `padeljam_ci`, 5632x), chosen with CLI environment
// variables only, so it never shares ports, containers or data with a `dev` stack on the same Mac.
// Variable names are the ones Supabase CLI 2.117.0 reads (SUPABASE_LOCAL_SMTP_PORT, not
// SUPABASE_INBUCKET_PORT, which it ignores).
export const STACKS = {
  dev: { projectId: 'padeljam', api: 55321, db: 55322, shadow: 55320, studio: 55323, mail: 55324, analytics: 55327, pooler: 55329, inspector: 8083 },
  ci: { projectId: 'padeljam_ci', api: 56321, db: 56322, shadow: 56320, studio: 56323, mail: 56324, analytics: 56327, pooler: 56329, inspector: 8183 },
};

export function resolveStack(name = process.env.E2E_STACK ?? 'dev') {
  const s = STACKS[name];
  if (!s) throw new Error(`Unknown E2E_STACK "${name}" (expected one of: ${Object.keys(STACKS).join(', ')}).`);
  const cliEnv = name === 'dev' ? {} : {
    SUPABASE_PROJECT_ID: s.projectId,
    SUPABASE_API_PORT: String(s.api),
    SUPABASE_DB_PORT: String(s.db),
    SUPABASE_DB_SHADOW_PORT: String(s.shadow),
    SUPABASE_STUDIO_PORT: String(s.studio),
    SUPABASE_LOCAL_SMTP_PORT: String(s.mail),
    SUPABASE_ANALYTICS_PORT: String(s.analytics),
    SUPABASE_DB_POOLER_PORT: String(s.pooler),
    SUPABASE_EDGE_RUNTIME_INSPECTOR_PORT: String(s.inspector),
  };
  return {
    name,
    projectId: s.projectId,
    apiPort: s.api,
    dbPort: s.db,
    apiUrl: `http://127.0.0.1:${s.api}`,
    mailpitUrl: `http://127.0.0.1:${s.mail}`,
    dbContainer: `supabase_db_${s.projectId}`,
    edgeContainer: `supabase_edge_runtime_${s.projectId}`,
    cliEnv,
  };
}

/**
 * Wipe, seed and app must talk to the same stack. Returns one entry per URL that is not the stack's
 * `apiUrl`. A missing URL is a mismatch for every stack but `dev`: the readers fall back to the dev
 * stack's URL, which is only right for `dev`.
 */
export function urlMismatches(stack, files) {
  const out = [];
  for (const { file, key, value } of files) {
    if (value ? value !== stack.apiUrl : stack.name !== 'dev') out.push({ file, key, value, expected: stack.apiUrl });
  }
  return out;
}

/**
 * True when a port of the stack answers but our own Docker has no `dbContainer`: someone else's
 * stack (the runner's, in its own VM) holds it, and `supabase start` would start containers whose
 * migrations then connect to that other database. Only the `ci` stack is guarded.
 */
export function heldByForeignStack(stack, { apiOpen, dbOpen, containers }) {
  if (stack.name === 'dev') return false;
  return (apiOpen || dbOpen) && !containers.includes(stack.dbContainer);
}
