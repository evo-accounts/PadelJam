create table push_tokens (
  user_id    uuid not null references profiles(id) on delete cascade,
  expo_token text not null,
  platform   text not null check (platform in ('ios','android')),
  updated_at timestamptz not null default now(),
  primary key (user_id, expo_token)
);
alter table push_tokens enable row level security;
create policy "push_tokens: read own"   on push_tokens for select using (user_id = auth.uid());
create policy "push_tokens: delete own" on push_tokens for delete using (user_id = auth.uid());
-- inserts/updates only via register_push_token (SECURITY DEFINER)

create or replace function register_push_token(p_expo_token text, p_platform text) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_platform not in ('ios','android') then raise exception 'invalid_platform' using errcode='P0001'; end if;
  if coalesce(btrim(p_expo_token),'') = '' then raise exception 'invalid_token' using errcode='P0001'; end if;
  insert into push_tokens (user_id, expo_token, platform, updated_at)
  values (v_user, p_expo_token, p_platform, now())
  on conflict (user_id, expo_token) do update set platform = excluded.platform, updated_at = now();
end; $$;
grant execute on function register_push_token(text, text) to authenticated;

-- Fan-out: every notification INSERT pings the send-push edge function (async, fire-and-forget).
-- No-ops locally (settings unset) so db reset + producers stay clean. pg_net is enabled on Supabase.
create or replace function notify_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_url text := current_setting('app.send_push_url', true);
        v_secret text := current_setting('app.send_push_secret', true);
begin
  if v_url is null or v_url = '' then return NEW; end if;  -- unconfigured (local) -> no-op
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type','application/json','x-push-secret', coalesce(v_secret,'')),
    body := jsonb_build_object('notification_id', NEW.id)
  );
  return NEW;
end; $$;
create trigger trg_notify_push after insert on notifications
  for each row execute function notify_push();
