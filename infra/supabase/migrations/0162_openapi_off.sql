-- PAD-164: anon can GET /rest/v1/ and read the whole API schema. Nothing in the apps reads it.
-- The guard means a refusal on hosted (the role may not be ours to alter) warns instead of
-- jamming the migration queue; if it warns, the founder sets pgrst.openapi_mode = 'disabled'.
do $$ begin
  alter role authenticator set pgrst.openapi_mode = 'disabled';
exception when insufficient_privilege then
  raise warning 'openapi_mode not set: needs the founder';
end $$;

notify pgrst, 'reload config';
