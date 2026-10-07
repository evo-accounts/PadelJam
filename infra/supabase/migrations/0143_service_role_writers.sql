-- Two things only the server may do from now on: read the email addresses a blast goes to, and
-- delete an account. Both were SECURITY DEFINER functions that an edge function ran AS THE SIGNED-IN
-- USER (it forwarded the caller's JWT), so `authenticated` had to hold EXECUTE on them, and any
-- signed-in user could call them directly at /rest/v1/rpc/... without the edge function's other
-- steps. Found while triaging Supabase's SECURITY DEFINER warnings (the triage behind 0136); each
-- exploit was reproduced in a throwaway copy of the schema (begin … rollback).
--
-- STEP 1 OF 2. This file only ADDS service-role entry points and makes the old deletion entry point
-- harmless. It is safe to paste BEFORE the two edge functions are redeployed: the deployed send-blast
-- and delete-account keep calling the old functions as the user, and those keep their grants here.
-- 0144 takes `authenticated` off the old functions once the new edge code is live.
--
-- 1. blast_email_recipients — organizers could read their invitees' email addresses (HIGH).
--    send-blast resolved a blast's recipients by calling blast_email_recipients(uuid) as the
--    organizer. Called directly, it returns the raw auth.users email of every opted-in participant
--    and pending invitee — addresses no client may otherwise read (0119 took SELECT on
--    profiles.email from anon and authenticated). And the audience is the organizer's choice: on a
--    group-less event invite_to_event accepts any profile that has not blocked them, and
--    send_event_blast(…, p_send_to => 'invited') only inserts the event_blasts row. So: invite a
--    stranger, record an email blast, never call send-blast, read the stranger's address.
--    Product decision: organizers must not read participants' or invitees' raw emails.
--
--    Now "who may ask" and "who may read" are split:
--      * send-blast verifies the caller itself (auth.getUser() on the forwarded JWT), loads the
--        blast as the caller (RLS: organizer only), and checks events.organizer_id = that user;
--      * it then calls blast_email_recipients_for(blast, organizer) with its SERVICE-ROLE client,
--        passing the verified user id;
--      * this function trusts nobody: only service_role may execute it, it refuses any call made
--        as the anon or authenticated database role (so a grant that ever came back would still
--        read nothing), and it re-runs the organizer check against the id passed.
--    The body is blast_email_recipients' (live: 0124 + 0136 grants) with exactly those changes. The
--    recipient query is untouched on purpose: send_event_blast's sent_to_count counts "exactly who
--    blast_email_recipients will return" with the same joins.
--
--    Errors, same codes as before (send-blast maps 'forbidden' to 403, the rest to 400; no screen
--    reads them — both apps' send-blast calls are best-effort):
--      'forbidden'          the caller runs as anon or authenticated, or p_organizer_id does not
--                           organize the blast's event;
--      'not authenticated'  p_organizer_id is null;
--      'blast_not_found'    no such blast.
--
-- 2. soft_delete_account — a user could delete their own account halfway, and take the blocks
--    OTHER people had placed on them with it (HIGH).
--    delete-account ran soft_delete_account() with the caller's JWT, then banned the auth user
--    through GoTrue's admin API: two steps, two transactions, and the first was an ordinary RPC.
--    Called directly it ran `delete from blocks where blocker_id = uid or blocked_id = uid` and
--    stopped there. The caller was never banned, so their refresh token kept minting sessions
--    (GoTrue refuses a refresh only for a banned user), on an account that no block stood against
--    any more: free to rename the anonymized profile (full_name is self-updatable since 0120),
--    follow, and see the people who had blocked it. The edge function reached the same state on its
--    own whenever its second step failed. Product decision: account deletion runs only through the
--    delete-account edge function, and users cannot clear blocks others placed on them.
--
--    a. Blocks the account PLACED go; blocks others placed ON it stay. A block belongs to the
--       blocker: only the blocker reads it ("blocks: read", 0140) or removes it (unblock_user). The profile it points at
--       outlives this function (anonymized, never deleted: owned communities and events hold
--       NOT NULL / RESTRICT foreign keys to it), and so does the auth user, banned. So the block
--       keeps doing its job: "profiles: read" keeps the "Deleted user" hidden from the blocker, the
--       blocker still sees the row in Blocked users (list_my_blocks) and can remove it, and if the
--       account is ever restored the block is still in force. `reports` already worked this way two
--       lines further down: reports the account filed go, reports filed about it stay.
--    b. The ban moves INTO the transaction. The body sets auth.users.banned_until — the column
--       GoTrue's own ban writes (ban_duration '876000h' = now() + 100 years) and checks on every
--       sign-in and every refresh. The function already wrote auth.users (0087), so this adds no new
--       coupling. A deleted-but-unbanned account can no longer exist, whoever started the deletion;
--       the edge function's GoTrue ban becomes a belt-and-braces repeat.
--    c. One entry point, soft_delete_account(p_user uuid), for service_role only. delete-account
--       verifies the caller with GoTrue (auth.getUser) and calls it with the service key for THAT
--       id. A call made as the anon or authenticated database role is refused unless it names the
--       caller's own account (the transitional wrapper below), so a grant that ever came back could
--       still never delete someone else.
--    d. auth.uid() is pinned to the deletee for the length of the call. Under the service role
--       auth.uid() is NULL, and 0122's activity trigger on event_participants
--       (_activity_on_participant) logs nothing without an actor — so the organizer's Activity feed
--       (UX-MEVT-17) would silently stop getting the "left" row it gets today for every upcoming
--       event the deleted player was in. The function sets request.jwt.claim.sub (what auth.uid()
--       reads first) to the deletee, transaction-locally, and puts the previous value back at the
--       end; on an error the setting rolls back with everything else. auth.role() and auth.jwt()
--       are untouched. No other trigger on the rows this function deletes reads auth.uid()
--       (trg_last_admin, _drop_guest_teammate, _unpair_waiting_partner, track_group_departure,
--       notify_push, sync_profile_contact, _log_activity), so every trigger now sees exactly what it
--       saw when the user ran the deletion themselves.
--
-- 3. TRANSITION: the zero-argument soft_delete_account() stays for now, as a thin wrapper around
--    soft_delete_account(auth.uid()), and `authenticated` keeps EXECUTE on it until 0144 — the
--    delete-account function deployed on hosted calls it, and only the project owner can redeploy
--    that from the dashboard. Revoking it here would break account deletion (App Store guideline
--    5.1.1(v)) until then. 2a and 2b already make a direct call harmless: it deletes AND bans the
--    caller, exactly what the button does, and leaves others' blocks alone. CREATE OR REPLACE keeps
--    its ACL (0136: authenticated, plus the default service_role). The grant to authenticated is
--    restated, never widened, and ONLY while 0144 has not run. The marker is the other grant 0144
--    removes: blast_email_recipients(uuid) still executable by authenticated. So this file can be
--    re-pasted at any time, in any psql mode, including plain autocommit `psql -f`, where a self-check
--    cannot undo the statements above it: after 0144 it never re-grants the wrapper, and its
--    self-check fails if the wrapper is open to authenticated again.
--
-- 4. BACKFILL: a deleted account that is not banned was either deleted by a direct call or hit a
--    failed ban step. Either way it can still refresh its session, so it is banned here the same way
--    the body bans. The blocks those direct calls erased cannot be brought back — the rows are gone.
--    Before pasting on hosted, see how many there are:
--      select count(*) filter (where u.banned_until is null or u.banned_until <= now()) as unbanned,
--             count(*) as deleted
--        from auth.users u join public.profiles p on p.id = u.id where p.deleted_at is not null;
--
-- GUARDS. Besides the grants, both new functions refuse the anon and authenticated roles in their
-- body (blast_email_recipients_for always; soft_delete_account(p_user) unless the session names its
-- own account). They key on current_setting('role') — the database role PostgREST switched to for
-- the request, which a SECURITY DEFINER call does not change — not on JWT claims: it is the role the
-- grants are about, it reads the same whether or not a service key carries a `sub`, and it does not
-- depend on how this database defines auth.role(). psql, and the dashboard editor in its default
-- postgres mode, run as role 'none', so an operator can still call either function by hand.
--
-- GRANTS. 0142 closes new functions by default (no EXECUTE for PUBLIC, anon or authenticated), but
-- this file does not lean on that: both new functions are revoked from public, anon and
-- authenticated by name and granted to service_role explicitly, so the result is the same on a
-- database where 0142's default privileges do not apply (another owner, or an out-of-order paste).
--
-- DEPLOY ORDER (hosted, project wispuppglipffcsqowlq):
--   1. paste this file;
--   2. the owner redeploys send-blast AND delete-account from the dashboard (index.ts only; no new
--      secret — both already read SUPABASE_SERVICE_ROLE_KEY);
--   3. paste 0144 — only once the dashboard's deployed source shows the new calls (0144's header
--      has the exact gate).
--   A new edge function deployed BEFORE this file gets PGRST202 (function not found): a blast is
--   logged 'failed' and can be retried; a deletion answers "couldn't delete" and can be retried.
--   Number order: 0137–0142 (fix/authz-followups) go first. Neither set needs the other's SQL; the
--   order only keeps migration versions ascending on a database that records them.
--   Locally, apply with `psql -v ON_ERROR_STOP=1 --single-transaction -f …` (the dashboard editor
--   already runs a paste as one transaction): plain `psql -f` autocommits statement by statement,
--   so a failing self-check would leave the statements above it applied.
--
-- NOT HERE: an access token issued BEFORE a deletion stays valid at PostgREST until it expires
-- (jwt_expiry, 3600 s) — PostgREST checks signature and expiry, not banned_until; that was equally
-- true before. send-blast still lets an organizer re-send a blast that already went out (it never
-- applies retry_blast's "latest attempt failed" rule). The old blast_email_recipients(uuid) and the
-- wrapper are dropped in a later clean-up, once no deployed code can call them.

-- 1. blast_email_recipients_for --------------------------------------------------------------------
create or replace function public.blast_email_recipients_for(p_blast_id uuid, p_organizer_id uuid)
returns table(email text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_event uuid; v_send_to text; v_channels text[];
begin
  -- Service role only, whatever the grants say: never as the anon or authenticated database role
  -- (the role PostgREST set for the request; SECURITY DEFINER does not change it).
  if current_setting('role', true) in ('anon', 'authenticated') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_organizer_id is null then raise exception 'not authenticated' using errcode = 'P0001'; end if;

  select event_id, send_to, channels into v_event, v_send_to, v_channels from event_blasts where id = p_blast_id;
  if v_event is null then raise exception 'blast_not_found' using errcode = 'P0001'; end if;
  -- send-blast checked this with the same verified id; checked again so the function is safe alone.
  if not is_event_organizer(v_event, p_organizer_id) then raise exception 'forbidden' using errcode = 'P0001'; end if;
  -- A WhatsApp-only blast has no email recipients, whoever asks.
  if not ('email' = any(v_channels)) then return; end if;

  return query
  select distinct au.email::text
  from _blast_audience(v_event, v_send_to) a(uid)
  join user_settings us on us.user_id = a.uid and us.notifications_email
  join auth.users au on au.id = a.uid
  where au.email is not null;
end; $$;

comment on function public.blast_email_recipients_for(uuid, uuid) is
  'Opted-in recipient emails of a blast. service_role only (send-blast, after verifying the caller organizes the event); re-checks p_organizer_id.';

revoke execute on function public.blast_email_recipients_for(uuid, uuid) from public, anon, authenticated;
grant execute on function public.blast_email_recipients_for(uuid, uuid) to service_role;

-- 2. soft_delete_account(p_user) -------------------------------------------------------------------
-- The live body of soft_delete_account() (0087, as pg_get_functiondef prints it today) with these
-- changes only: the user is p_user instead of auth.uid(); anon/authenticated may only name themselves;
-- auth.uid() is pinned to the deletee for the call (2d); only the blocks the account placed are
-- deleted (2a); auth.users gets banned_until (2b). search_path gains pg_temp, as for any new function.
create or replace function public.soft_delete_account(p_user uuid)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare uid uuid := p_user; v_prev_sub text;
begin
  if uid is null then return; end if;
  -- service_role (delete-account) may name any verified id. The anon and authenticated roles — which
  -- have no grant, but see the header — may only ever reach the caller's own account (the wrapper).
  if current_setting('role', true) in ('anon', 'authenticated') and auth.uid() is distinct from uid then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  -- Triggers on the rows deleted below read auth.uid(): 0122's _activity_on_participant logs the
  -- player's own 'left' only when auth.uid() is that player, and under the service role it is null.
  -- Pinned to the deletee for this call (transaction-local; restored at the end, rolled back on error).
  v_prev_sub := current_setting('request.jwt.claim.sub', true);
  perform set_config('request.jwt.claim.sub', uid::text, true);

  delete from follows  where follower_id = uid or followee_id = uid;
  delete from reports  where reporter_id = uid;
  delete from user_settings     where user_id = uid;
  -- 0098's trg_last_admin raises 'last_admin_must_promote_first' here for the sole admin of a
  -- community that still has members. The apps map that code, and the whole call rolls back, the
  -- ban below included.
  delete from community_members where user_id = uid;
  delete from group_members     where user_id = uid;
  delete from push_tokens       where user_id = uid;
  delete from notifications     where user_id = uid;

  -- Only upcoming/cancelled events: completed & in-progress history is preserved.
  delete from event_participants ep
   using events e
   where ep.user_id = uid
     and e.id = ep.event_id
     and e.status in ('scheduled','cancelled');

  -- Only the blocks this account PLACED. Blocks others placed on it are theirs and stay: the profile
  -- they point at survives, anonymized, and so does the auth user (see the file header).
  -- AFTER the event_participants delete on purpose: that delete fires 0122's activity trigger, which
  -- since 0140 leaves out the player's name when they and the organizer are blocked either way.
  -- Removing this account's blocks first would make the organizer's 'left' entry name someone who
  -- had blocked them.
  delete from blocks   where blocker_id = uid;

  update profiles
     set full_name = 'Deleted user',
         email = 'deleted+' || uid::text || '@deleted.invalid',
         phone = 'deleted-' || uid::text,
         avatar_url = null,
         description = null,
         location_text = null,
         location_point = null,
         dominant_hand = null,
         court_side = null,
         preferred_time = null,
         gender = null,
         date_of_birth = null,
         deleted_at = now()
   where id = uid;

  -- Free the auth-level identifiers so the real owner can register again, and ban the user in the
  -- SAME transaction: banned_until is what GoTrue's ban_duration '876000h' writes and what it checks
  -- on every sign-in and refresh, so an existing refresh token stops working from this commit on.
  update auth.users
     set email = 'deleted+' || uid::text || '@deleted.invalid',
         phone = null,
         raw_user_meta_data = '{}'::jsonb,
         banned_until = now() + interval '876000 hours'
   where id = uid;
  delete from auth.identities where user_id = uid;

  perform set_config('request.jwt.claim.sub', coalesce(v_prev_sub, ''), true);
end;
$$;

comment on function public.soft_delete_account(uuid) is
  'Deletes (anonymizes + bans) one account. service_role only: the delete-account edge function, for the id GoTrue verified.';

revoke execute on function public.soft_delete_account(uuid) from public, anon, authenticated;
grant execute on function public.soft_delete_account(uuid) to service_role;

-- 3. The transitional zero-argument entry point ----------------------------------------------------
-- The deployed delete-account calls this with the user's JWT. One body for both, so they cannot
-- drift. auth.uid() is null for a session-less caller, and the body returns at once for null, as it
-- always did. 0144 takes authenticated off it.
create or replace function public.soft_delete_account()
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.soft_delete_account(auth.uid());
end;
$$;

-- Restated, not widened: 0136 left it to authenticated (and the default service_role). The grant to
-- authenticated is restated only while 0144 has not run, i.e. while authenticated can still execute
-- blast_email_recipients(uuid) (header, section 3). After 0144 a re-paste leaves the wrapper closed.
-- to_regprocedure + coalesce: once a later clean-up drops the old blast RPC, this reads "0144 ran".
revoke execute on function public.soft_delete_account() from public, anon;
do $g$
begin
  if coalesce(has_function_privilege('authenticated',
                to_regprocedure('public.blast_email_recipients(uuid)'), 'execute'), false) then
    grant execute on function public.soft_delete_account() to authenticated;
  end if;
end $g$;

-- 4. Backfill: already-deleted accounts that are not banned ----------------------------------------
update auth.users u
   set banned_until = now() + interval '876000 hours'
  from public.profiles p
 where p.id = u.id
   and p.deleted_at is not null
   and (u.banned_until is null or u.banned_until <= now());

-- Self-check, in the spirit of 0094/0097/0101/0132–0136: catalog state plus one data invariant.
-- Proving the exploits fail needs several users, which is what the REST tests do on a scratch stack
-- (blast-recipients-privacy.test.mjs, account-deletion-lockdown.test.mjs); a hosted paste must not
-- create or delete accounts. The editor runs the whole paste as one transaction, so if this raises,
-- nothing above it lands.
do $$
declare
  v_blast   constant regprocedure := 'public.blast_email_recipients_for(uuid,uuid)'::regprocedure;
  v_delete  constant regprocedure := 'public.soft_delete_account(uuid)'::regprocedure;
  v_wrapper constant regprocedure := 'public.soft_delete_account()'::regprocedure;
  v_old_blast constant regprocedure := to_regprocedure('public.blast_email_recipients(uuid)');
  -- The same "0144 has not run" marker section 3's grant reads.
  v_before_0144 constant boolean :=
    coalesce(has_function_privilege('authenticated', v_old_blast, 'execute'), false);
  v_src text;
  v_probe constant uuid := '00000000-0000-0000-0000-0000000001a3';
begin
  -- 1. blast_email_recipients_for: service_role only, definer, pinned path, the guards in place.
  if has_function_privilege('anon', v_blast, 'execute')
     or has_function_privilege('authenticated', v_blast, 'execute') then
    raise exception 'an API role can execute blast_email_recipients_for — any organizer could read emails';
  end if;
  if not has_function_privilege('service_role', v_blast, 'execute') then
    raise exception 'service_role cannot execute blast_email_recipients_for — send-blast would fail';
  end if;
  if not exists (select 1 from pg_proc where oid = v_blast and prosecdef
                   and proconfig = array['search_path=public, pg_temp']) then
    raise exception 'blast_email_recipients_for is not SECURITY DEFINER with search_path public, pg_temp';
  end if;
  select prosrc into v_src from pg_proc where oid = v_blast;
  if v_src !~ 'current_setting\(''role'', true\) in \(''anon'', ''authenticated''\)'
     or v_src !~ 'is_event_organizer\(v_event, p_organizer_id\)' then
    raise exception 'blast_email_recipients_for lost its role guard or its organizer re-check';
  end if;

  -- 2. soft_delete_account(uuid): service_role only, definer, pinned path, and the body's four fixes.
  if has_function_privilege('anon', v_delete, 'execute')
     or has_function_privilege('authenticated', v_delete, 'execute') then
    raise exception 'an API role can execute soft_delete_account(uuid), so anyone could delete anyone';
  end if;
  if not has_function_privilege('service_role', v_delete, 'execute') then
    raise exception 'service_role cannot execute soft_delete_account(uuid), so delete-account would fail';
  end if;
  if not exists (select 1 from pg_proc where oid = v_delete and prosecdef
                   and proconfig = array['search_path=public, pg_temp']) then
    raise exception 'soft_delete_account(uuid) is not SECURITY DEFINER with search_path public, pg_temp';
  end if;
  select prosrc into v_src from pg_proc where oid = v_delete;
  if v_src ~* 'blocked_id' then
    raise exception 'soft_delete_account(uuid) still deletes blocks other users placed on the account';
  end if;
  if v_src !~ 'delete from blocks\s+where blocker_id = uid;' then
    raise exception 'soft_delete_account(uuid) no longer deletes the blocks the account placed';
  end if;
  if v_src !~ 'banned_until = now\(\) \+ interval ''876000 hours''' then
    raise exception 'soft_delete_account(uuid) does not ban the auth user in its own transaction';
  end if;
  if v_src !~ 'set_config\(''request\.jwt\.claim\.sub'', uid::text, true\)' then
    raise exception 'soft_delete_account(uuid) no longer pins auth.uid(), so account deletion stops logging "left"';
  end if;
  if v_src !~ 'current_setting\(''role'', true\) in \(''anon'', ''authenticated''\) and auth\.uid\(\) is distinct from uid' then
    raise exception 'soft_delete_account(uuid) lost the guard that keeps anon/authenticated to the caller''s own account';
  end if;
  -- The pin only works if this database's auth.uid() reads request.jwt.claim.sub first.
  perform set_config('request.jwt.claim.sub', v_probe::text, true);
  if auth.uid() is distinct from v_probe then
    raise exception 'auth.uid() does not read request.jwt.claim.sub here, so the pin in soft_delete_account(uuid) would not reach 0122''s activity trigger';
  end if;
  perform set_config('request.jwt.claim.sub', '', true);

  -- 3. The wrapper: never anon's. Before 0144 it is still the shipped edge function's entry point,
  --    so authenticated must have it; after 0144 a re-paste of this file must not have handed it back.
  if has_function_privilege('anon', v_wrapper, 'execute') then
    raise exception 'anon can execute soft_delete_account()';
  end if;
  if v_before_0144 and not has_function_privilege('authenticated', v_wrapper, 'execute') then
    raise exception 'authenticated lost soft_delete_account() before delete-account was redeployed';
  end if;
  if not v_before_0144 and has_function_privilege('authenticated', v_wrapper, 'execute') then
    raise exception '0144 already closed blast_email_recipients, yet soft_delete_account() is open to authenticated again — 0143 must not re-grant it after 0144; re-run 0144';
  end if;
  if (select prosrc from pg_proc where oid = v_wrapper) !~ 'perform public\.soft_delete_account\(auth\.uid\(\)\);' then
    raise exception 'soft_delete_account() is not the thin wrapper, so two bodies could drift apart';
  end if;

  -- The old blast RPC is untouched until 0144 (the deployed send-blast still calls it as the user),
  -- and closed to anon either way.
  if coalesce(has_function_privilege('anon', v_old_blast, 'execute'), false) then
    raise exception 'anon can execute blast_email_recipients(uuid)';
  end if;

  -- 4. The backfill held: no deleted account is left able to refresh its session.
  if exists (select 1 from auth.users u join public.profiles p on p.id = u.id
              where p.deleted_at is not null and (u.banned_until is null or u.banned_until <= now())) then
    raise exception 'a deleted account is still not banned';
  end if;
end $$;
