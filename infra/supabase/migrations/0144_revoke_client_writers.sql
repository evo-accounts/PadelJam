-- Step 2 of 2 of 0143: signed-in users lose the two functions the edge functions used to run as
-- them. After this file an organizer cannot read their participants' or invitees' email addresses,
-- and no signed-in user can run account deletion over PostgREST, for themselves or anyone else.
--
--   blast_email_recipients(uuid)  — returned the raw auth.users email of every opted-in participant
--                                   and pending invitee of the caller's event (0143, section 1);
--   soft_delete_account()         — 0143 already made a direct call harmless (it deletes AND bans
--                                   the caller and keeps others' blocks); this takes it off the API.
--
-- HOSTED — PASTE ONLY AFTER BOTH EDGE FUNCTIONS ARE REDEPLOYED, AND CHECK THE SOURCE, NOT A RESULT.
-- The deploy gate is the deployed code in the dashboard:
--   Edge Functions → send-blast     → Code must contain  blast_email_recipients_for
--   Edge Functions → delete-account → Code must contain  soft_delete_account', { p_user
-- Do not take a 'sent' delivery_log row or a working deletion as proof: until this file lands the
-- OLD functions still work too (their grants are what this file removes), so a deploy that silently
-- did not take — wrong function, unsaved edit — looks exactly like one that did. Against this file
-- the old send-blast gets "permission denied for function blast_email_recipients" (every email
-- blast logged 'failed'; retry_blast lets the organizer resend once fixed) and the old
-- delete-account gets "permission denied for function soft_delete_account" (the app shows
-- "couldn't delete your account"; nothing is half-deleted).
-- STOP, and do not paste, if after the deploy a new email delivery_log row says 'failed' with
-- "Could not find the function public.blast_email_recipients_for" (0143 is missing — paste it) or
-- with 'forbidden' (the edge function reached the RPC with an id that does not organize the event,
-- or with a session that is not the service role's — investigate the deployed code and its
-- SUPABASE_SERVICE_ROLE_KEY before going further).
--
-- REVOKED, NOT DROPPED. Both functions stay, closed to the API roles, so this file is a pure grant
-- change and a rollback is one GRANT: nothing calls them any more (service_role still may — the
-- wrapper is then a no-op, auth.uid() being null; the old blast RPC refuses with
-- 'not authenticated'). A drop would also turn anon's "permission denied" in definer-grants.test.mjs
-- into PGRST202. Dropping both is left to a later clean-up, together with database.types.ts.
--
-- Rolling back the edge functions after this file means re-granting first:
--   grant execute on function public.blast_email_recipients(uuid) to authenticated;
--   grant execute on function public.soft_delete_account() to authenticated;
-- Grant the two as a pair. 0143 reads "blast_email_recipients closed to authenticated" as "0144 has
-- run", so with only the second grant its self-check takes the open wrapper for a bad re-grant and
-- refuses a re-paste.
--
-- Do not re-paste 0136 after this file. It grants both functions back to authenticated, and nothing
-- stops it: its self-check asserts that authenticated CAN execute them, which its own grants just
-- made true. If it happens, re-run this file. 0143, by contrast, can be re-pasted at any time: it
-- re-grants soft_delete_account() to authenticated only while blast_email_recipients is still open
-- to authenticated (before this file), and its self-check fails if the wrapper is open after it.
--
-- Locally: apply only once the checkout the local edge runtime serves has the new send-blast and
-- delete-account (it serves the MAIN checkout's infra/supabase/functions), with
-- `psql -v ON_ERROR_STOP=1 --single-transaction -f …`, and never during an E2E run.

revoke execute on function public.blast_email_recipients(uuid) from public, anon, authenticated;
revoke execute on function public.soft_delete_account() from public, anon, authenticated;

-- Self-check. The editor runs the whole paste as one transaction, so if this raises, nothing lands.
do $$
begin
  -- The two old entry points are closed to every API role but the service role.
  if has_function_privilege('anon', 'public.blast_email_recipients(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.blast_email_recipients(uuid)', 'execute') then
    raise exception 'an API role can still execute blast_email_recipients(uuid) — organizers can read invitee emails';
  end if;
  if exists (select 1 from pg_proc p
              where p.pronamespace = 'public'::regnamespace and p.proname = 'soft_delete_account'
                and (has_function_privilege('anon', p.oid, 'execute')
                     or has_function_privilege('authenticated', p.oid, 'execute'))) then
    raise exception 'an API role can still execute a soft_delete_account overload — users could run account deletion directly';
  end if;

  -- Their replacements are in place, service_role only (0143). Without them the new edge functions
  -- have nothing to call.
  if to_regprocedure('public.blast_email_recipients_for(uuid,uuid)') is null
     or to_regprocedure('public.soft_delete_account(uuid)') is null then
    raise exception 'blast_email_recipients_for(uuid,uuid) or soft_delete_account(uuid) is missing — paste 0143 and redeploy both edge functions first';
  end if;
  if not has_function_privilege('service_role', 'public.blast_email_recipients_for(uuid,uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.soft_delete_account(uuid)', 'execute') then
    raise exception 'service_role cannot execute a 0143 entry point — send-blast or delete-account would fail';
  end if;

  -- The general rule this file finishes: no function an API role may execute hands back a raw email
  -- address or phone number. Checked on everything a function returns:
  --   * a result column (RETURNS TABLE / OUT) named email or phone, or ending in _email / _phone;
  --   * a row type that has such a column — the function's own return type (profiles, auth.users,
  --     event_invitations with its invitee_email/invitee_phone, SETOF or not, or an array of them)
  --     or the type of one of its result columns.
  -- has_email / has_phone booleans and *_masked values are fine (auth_methods_for, my_auth_providers).
  -- What a signature cannot show — an address built into json/jsonb or text — is out of its reach.
  if exists (
    with api_fn as (
      select p.oid, p.prorettype, p.proargnames, p.proargmodes, p.proallargtypes
        from pg_proc p
       where p.pronamespace = 'public'::regnamespace
         and (has_function_privilege('anon', p.oid, 'execute')
              or has_function_privilege('authenticated', p.oid, 'execute'))
    ),
    result_cols as (
      select f.oid, a.name, a.typ
        from api_fn f,
             unnest(f.proargnames, f.proargmodes, f.proallargtypes) as a(name, mode, typ)
       where a.mode in ('o', 'b', 't')
    ),
    result_types as (
      select oid, prorettype as typ from api_fn
      union all
      select oid, typ from result_cols
    )
    select 1 from result_cols c
     where c.name ~* '(^|_)(email|phone)$' and c.name !~* '^has_'
    union all
    select 1
      from result_types r
      join pg_type t on t.oid = r.typ
      join pg_type ct on ct.oid = case when t.typtype = 'c' then t.oid else t.typelem end
      join pg_attribute at on at.attrelid = ct.typrelid
     where ct.typtype = 'c' and at.attnum > 0 and not at.attisdropped
       and at.attname ~* '(^|_)(email|phone)$' and at.attname !~* '^has_'
  ) then
    raise exception 'a function executable by anon/authenticated returns a raw email or phone (a column, or a row type that carries one)';
  end if;

  -- What must NOT change: the organizer RPCs that stay signed-in (0136).
  if not has_function_privilege('authenticated', 'public.event_roster_csv(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.send_event_blast(uuid,uuid,text,text,text,text[],text,boolean)', 'execute')
     or not has_function_privilege('authenticated', 'public.retry_blast(uuid)', 'execute') then
    raise exception 'an organizer RPC lost its authenticated grant';
  end if;
end $$;
