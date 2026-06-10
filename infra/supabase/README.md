# Supabase (local)

The Supabase project lives at `infra/supabase/` (`config.toml`, `migrations/`, `seed.sql`,
`functions/`). The CLI's project root is therefore `infra/` — **run all `supabase` commands
from the `infra/` directory** (the folder that contains `supabase/`). The CLI is not installed
globally; invoke it via `pnpm dlx supabase@latest`.

Docker must be running.

## Local config

- `project_id`: `padeljam`
- Ports are shifted to the **55xxx** range (API 55321, DB 55322, Studio 55323, Inbucket 55324,
  Analytics 55327) so this stack can run alongside another local Supabase project on the default
  54xxx ports.
- This CLI emits the **new key format**: `sb_publishable_*` (client/anon) and `sb_secret_*`
  (server/service_role). They are written to the git-ignored root `.env`.

## Commands (run from `infra/`)

```bash
cd infra

# Start / stop the local stack
pnpm dlx supabase@latest start
pnpm dlx supabase@latest stop
pnpm dlx supabase@latest status      # prints URLs + keys

# Create a new migration
pnpm dlx supabase@latest migration new <name>

# Apply all migrations + run seed.sql (resets local DB)
pnpm dlx supabase@latest db reset

# Regenerate typed DB client into packages/db
pnpm dlx supabase@latest gen types typescript --local > ../packages/db/src/database.types.ts
```

## RLS sanity check

After `db reset`, open Studio (http://127.0.0.1:55323) → SQL editor. To simulate a user, set the
request role + JWT claims and confirm tenant isolation, e.g.:

```sql
-- impersonate a user from tenant A and confirm they cannot read tenant B's private rows,
-- but CAN read communities where privacy = 'public'
set local role authenticated;
set local request.jwt.claims = '{"sub":"<user-uuid>","role":"authenticated"}';
select id, name, privacy from communities;   -- expect: own-tenant + public only
```
