-- JM-24: organizer edits a scheduled event's mutable fields. event_type/specification/num_courts/location/
-- group_id/series are NOT touched here. The client sends the full editable snapshot (one Save).
create or replace function update_event(p_event_id uuid, p_payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_ev events%rowtype;
        v_allow_standby boolean; v_standby int; v_private boolean; v_standby_have int;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_ev from events where id = p_event_id and deleted_at is null;
  if v_ev.id is null then raise exception 'event_not_found' using errcode='P0001'; end if;
  if v_ev.organizer_id <> v_user then raise exception 'forbidden' using errcode='P0001'; end if;
  if v_ev.status <> 'scheduled' then raise exception 'not_editable' using errcode='P0001'; end if;
  if coalesce(btrim(p_payload->>'name'),'') = '' then raise exception 'name_required' using errcode='P0001'; end if;

  v_allow_standby := coalesce((p_payload->>'allow_standby')::boolean, false);
  v_standby := nullif(p_payload->>'standby_spots','')::int;
  -- standalone events must stay private (events_standalone_private)
  v_private := case when v_ev.group_id is null then true
                    else coalesce((p_payload->>'is_private')::boolean, false) end;

  -- Capacity guard: don't strand current standby players by lowering/disabling standby.
  select count(*) into v_standby_have from event_participants where event_id=p_event_id and is_standby;
  if v_standby_have > 0 and (not v_allow_standby or coalesce(v_standby,0) < v_standby_have) then
    raise exception 'standby_below_roster' using errcode='P0001';
  end if;

  update events set
    name                    = btrim(p_payload->>'name'),
    description             = p_payload->>'description',
    thumbnail_path          = p_payload->>'thumbnail_path',
    starts_at              = (p_payload->>'starts_at')::timestamptz,
    duration_minutes       = (p_payload->>'duration_minutes')::int,
    scoring_mode           = p_payload->>'scoring_mode',
    scoring_value          = nullif(p_payload->>'scoring_value','')::int,
    allow_standby          = v_allow_standby,
    standby_spots          = case when v_allow_standby then v_standby else null end,
    is_private             = v_private,
    -- Recompute ranking eligibility ONLY when privacy actually changes (private events never count);
    -- an unchanged-privacy edit preserves any explicit set_event_ranking override.
    counts_for_ranking     = case when v_private is distinct from v_ev.is_private
                                  then (v_ev.group_id is not null and not v_private)
                                  else v_ev.counts_for_ranking end,
    entrance_fee_enabled   = coalesce((p_payload->>'entrance_fee_enabled')::boolean, false),
    entrance_fee_amount    = nullif(p_payload->>'entrance_fee_amount','')::numeric,
    entrance_fee_method    = nullif(p_payload->>'entrance_fee_method',''),
    entrance_fee_mba_number = p_payload->>'entrance_fee_mba_number',
    players_submit_results = coalesce((p_payload->>'players_submit_results')::boolean, false),
    organizer_role         = p_payload->>'organizer_role'
  where id = p_event_id;
end; $$;

grant execute on function update_event(uuid, jsonb) to authenticated;
