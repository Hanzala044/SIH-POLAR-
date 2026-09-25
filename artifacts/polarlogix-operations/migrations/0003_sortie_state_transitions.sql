begin;

create or replace function mark_overdue_field_sorties()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_count integer;
begin
  with changed as (
    update field_sorties
      set sortie_status = 'OVERDUE',
          overdue_escalated_at = now()
      where sortie_status = 'ACTIVE'
        and expected_return_time <= now()
      returning sortie_id, destination_name
  )
  insert into operation_events (module, action, tone, user_name, event_time)
    select 'SORTIE',
           'Overdue escalation · ' || destination_name || ' / ' || sortie_id,
           'red',
           'SYSTEM',
           now()
    from changed;

  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;

create or replace function dispatch_field_sortie(
  p_sortie_id uuid,
  p_station_id uuid,
  p_destination_name text,
  p_lead_personnel_id uuid,
  p_expected_return_time timestamptz,
  p_vehicle_identifier text,
  p_comm_frequency_vhf text,
  p_sat_phone_callsign text,
  p_personnel_ids uuid[],
  p_actor_id text,
  p_actor_name text,
  p_actor_role text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  created_sortie field_sorties%rowtype;
  assigned_count integer;
  existing_body jsonb;
begin
  perform pg_advisory_xact_lock(918240771);
  if p_actor_role not in ('COMMAND', 'SAFETY') then
    raise exception 'Only COMMAND or SAFETY may dispatch field sorties' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_destination_name, ''))) < 2
     or length(trim(coalesce(p_comm_frequency_vhf, ''))) < 2
     or p_expected_return_time <= now()
     or coalesce(cardinality(p_personnel_ids), 0) = 0
     or not (p_lead_personnel_id = any(p_personnel_ids)) then
    raise exception 'A destination, VHF frequency, future return window, lead, and assigned personnel are required' using errcode = '22023';
  end if;

  select response_body into existing_body
    from operation_idempotency
    where actor_id = p_actor_id
      and idempotency_key = p_idempotency_key
      and command_status = 'COMPLETED';
  if found then
    return existing_body;
  end if;
  select * into created_sortie
    from field_sorties
    where sortie_id = p_sortie_id;
  if found then
    return jsonb_build_object(
      'sortieId', created_sortie.sortie_id,
      'status', created_sortie.sortie_status,
      'departureTime', created_sortie.departure_time
    );
  end if;

  perform 1
    from expedition_personnel
    where personnel_id = any(p_personnel_ids)
    order by personnel_id
    for update;
  perform 1
    from emergency_incidents
    where is_resolved = false
      and lockdown_active = true
    order by created_at desc
    limit 1
    for update;
  if found then
    raise exception 'Condition 1 is active; field-sortie dispatch is blocked' using errcode = '55000';
  end if;

  select count(*) into assigned_count
    from expedition_personnel
    where personnel_id = any(p_personnel_ids)
      and assigned_station_id = p_station_id
      and current_safety_status = 'INDOORS_STATION';
  if assigned_count <> cardinality(p_personnel_ids) then
    raise exception 'Every assigned person must be at this station, indoors, and not already on an open sortie' using errcode = '23514';
  end if;

  if exists (
    select 1
      from field_sortie_personnel assignment
      join field_sorties sortie using (sortie_id)
      where assignment.personnel_id = any(p_personnel_ids)
        and sortie.sortie_status <> 'COMPLETED'
        and assignment.assignment_status <> 'RETURNED'
  ) then
    raise exception 'An assigned person is already linked to an open sortie' using errcode = '23514';
  end if;

  insert into field_sorties (
    sortie_id, station_id, lead_personnel_id, destination_name, departure_time,
    expected_return_time, vehicle_identifier, comm_frequency_vhf,
    sat_phone_callsign, sortie_status
  ) values (
    p_sortie_id, p_station_id, p_lead_personnel_id, trim(p_destination_name), now(),
    p_expected_return_time, nullif(trim(coalesce(p_vehicle_identifier, '')), ''),
    trim(p_comm_frequency_vhf), nullif(trim(coalesce(p_sat_phone_callsign, '')), ''),
    'ACTIVE'
  ) returning * into created_sortie;

  insert into field_sortie_personnel (sortie_id, personnel_id, assignment_status)
    select created_sortie.sortie_id, person_id, 'FIELD'
    from unnest(p_personnel_ids) as person_id;

  update expedition_personnel
    set current_safety_status = 'FIELD_SORTIE',
        updated_at = now()
    where personnel_id = any(p_personnel_ids);

  insert into operation_events (
    module, action, tone, user_name, actor_id, actor_role, event_time
  ) values (
    'SORTIE',
    'Field sortie dispatched · ' || created_sortie.destination_name || ' / ' || created_sortie.sortie_id,
    'amber',
    p_actor_name,
    p_actor_id,
    p_actor_role,
    now()
  );

  return jsonb_build_object(
    'sortieId', created_sortie.sortie_id,
    'status', created_sortie.sortie_status,
    'departureTime', created_sortie.departure_time
  );
end;
$$;

create or replace function transition_field_sortie(
  p_sortie_id uuid,
  p_action text,
  p_personnel_id uuid,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sortie_row field_sorties%rowtype;
  transition_time timestamptz := now();
begin
  perform pg_advisory_xact_lock(918240771);
  if p_actor_role not in ('COMMAND', 'SAFETY') then
    raise exception 'Only COMMAND or SAFETY may update field sorties' using errcode = '42501';
  end if;

  select * into sortie_row
    from field_sorties
    where sortie_id = p_sortie_id
    for update;
  if not found then
    raise exception 'Field sortie not found' using errcode = 'P0002';
  end if;

  if p_action = 'BEACON' then
    update field_sortie_personnel
      set beacon_confirmed_at = transition_time
      where sortie_id = p_sortie_id
        and personnel_id = p_personnel_id
        and assignment_status in ('FIELD', 'SOS', 'RECALLED');
    if not found then
      raise exception 'No open assignment exists for this personnel member' using errcode = 'P0002';
    end if;
    insert into operation_events (module, action, tone, user_name, actor_id, actor_role, event_time)
      values ('SORTIE', 'Manual beacon check-in recorded · ' || p_personnel_id || ' / ' || p_sortie_id,
              'cyan', p_actor_name, p_actor_id, p_actor_role, transition_time);
    return jsonb_build_object('sortieId', p_sortie_id, 'action', p_action, 'recordedAt', transition_time);
  elsif p_action = 'RETURN' then
    update field_sortie_personnel
      set assignment_status = 'RETURNED',
          actual_return_time = transition_time
      where sortie_id = p_sortie_id
        and personnel_id = p_personnel_id
        and assignment_status in ('FIELD', 'SOS', 'RECALLED');
    if not found then
      raise exception 'No open assignment exists for this personnel member' using errcode = 'P0002';
    end if;
    update expedition_personnel
      set current_safety_status = 'INDOORS_STATION',
          updated_at = transition_time
      where personnel_id = p_personnel_id;
    insert into operation_events (module, action, tone, user_name, actor_id, actor_role, event_time)
      values ('SORTIE', 'Manual return confirmed · ' || p_personnel_id || ' / ' || p_sortie_id,
              'green', p_actor_name, p_actor_id, p_actor_role, transition_time);
    return jsonb_build_object('sortieId', p_sortie_id, 'action', p_action, 'recordedAt', transition_time);
  elsif p_action = 'CLOSE' then
    if exists (
      select 1 from field_sortie_personnel
      where sortie_id = p_sortie_id
        and assignment_status <> 'RETURNED'
    ) then
      raise exception 'All assigned people must be marked returned before closing the sortie' using errcode = '23514';
    end if;
    if sortie_row.sortie_status = 'COMPLETED' then
      return jsonb_build_object('sortieId', p_sortie_id, 'action', p_action, 'status', 'COMPLETED');
    end if;
    update field_sorties
      set sortie_status = 'COMPLETED',
          actual_return_time = transition_time
      where sortie_id = p_sortie_id;
    insert into operation_events (module, action, tone, user_name, actor_id, actor_role, event_time)
      values ('SORTIE', 'Field sortie closed · ' || p_sortie_id,
              'green', p_actor_name, p_actor_id, p_actor_role, transition_time);
    return jsonb_build_object('sortieId', p_sortie_id, 'action', p_action, 'status', 'COMPLETED');
  end if;

  raise exception 'Unknown sortie action' using errcode = '22023';
end;
$$;

create or replace function set_personnel_safety_status(
  p_personnel_id uuid,
  p_status text,
  p_actor_role text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(918240771);
  if p_actor_role not in ('COMMAND', 'SAFETY') then
    raise exception 'Only COMMAND or SAFETY may update personnel safety status' using errcode = '42501';
  end if;
  if p_status not in ('INDOOR', 'SOS') then
    raise exception 'FIELD status can only be set by dispatching a field sortie' using errcode = '22023';
  end if;
  perform 1 from expedition_personnel
    where personnel_id = p_personnel_id
    for update;
  if not found then
    raise exception 'Personnel record not found' using errcode = 'P0002';
  end if;
  if p_status = 'INDOOR' and exists (
    select 1
      from field_sortie_personnel assignment
      join field_sorties sortie using (sortie_id)
      where assignment.personnel_id = p_personnel_id
        and sortie.sortie_status <> 'COMPLETED'
        and assignment.assignment_status <> 'RETURNED'
  ) then
    raise exception 'Confirm return through the linked field sortie before marking this person indoors' using errcode = '23514';
  end if;

  update expedition_personnel
    set current_safety_status = case when p_status = 'SOS' then 'MEDEVAC_IN_PROGRESS' else 'INDOORS_STATION' end,
        updated_at = now()
    where personnel_id = p_personnel_id;

  if p_status = 'SOS' then
    update field_sortie_personnel
      set assignment_status = 'SOS'
      where personnel_id = p_personnel_id
        and assignment_status in ('FIELD', 'RECALLED');
    update field_sorties
      set sortie_status = 'SOS_TRIGGERED'
      where sortie_status in ('ACTIVE', 'OVERDUE', 'RECALLED')
        and sortie_id in (
          select sortie_id from field_sortie_personnel
          where personnel_id = p_personnel_id and assignment_status = 'SOS'
        );
  end if;
end;
$$;

create or replace function create_condition1_cascade(
  p_station_id uuid,
  p_description text,
  p_cargo_ids uuid[],
  p_voyage_ids uuid[],
  p_actor_id text,
  p_actor_name text,
  p_actor_role text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  incident_id uuid;
  affected_sorties uuid[];
  transition_time timestamptz := now();
begin
  perform pg_advisory_xact_lock(918240771);
  if p_actor_role not in ('COMMAND', 'SAFETY') then
    raise exception 'Only COMMAND or SAFETY may activate Condition 1' using errcode = '42501';
  end if;

  insert into emergency_incidents (
    station_id, incident_severity, incident_type, initiating_entity,
    description, lockdown_active, action_log, created_at
  ) values (
    p_station_id, 'LEVEL_3_LIFE_THREATENING', 'BLIZZARD_COND_1',
    'PolarLogix command console', p_description, true,
    jsonb_build_array(jsonb_build_object('action', 'Condition 1 cascade executed', 'at', transition_time)),
    transition_time
  ) returning emergency_incidents.incident_id into incident_id;

  update cargo_manifest
    set current_status = 'AT_STATION_STORAGE',
        updated_at = transition_time
    where cargo_id = any(coalesce(p_cargo_ids, '{}'::uuid[]));
  update expedition_voyages
    set voyage_status = 'DIVERTED'
    where voyage_id = any(coalesce(p_voyage_ids, '{}'::uuid[]));

  update field_sorties
    set sortie_status = case when sortie_status = 'SOS_TRIGGERED' then 'SOS_TRIGGERED' else 'RECALLED' end,
        recalled_at = transition_time
    where sortie_status in ('ACTIVE', 'OVERDUE', 'SOS_TRIGGERED');
  select coalesce(array_agg(sortie_id), '{}'::uuid[])
    into affected_sorties
    from field_sorties
    where sortie_status = 'RECALLED'
      and recalled_at = transition_time;
  update field_sortie_personnel
    set assignment_status = 'RECALLED'
    where sortie_id = any(affected_sorties)
      and assignment_status = 'FIELD';

  insert into operation_events (module, action, tone, user_name, actor_id, actor_role, event_time)
    values ('EMERGENCY', 'Condition 1 cascade executed · active field sorties recalled',
            'red', p_actor_name, p_actor_id, p_actor_role, transition_time);

  return incident_id;
end;
$$;

create or replace function resolve_condition1(
  p_incident_id uuid,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text,
  p_justification text
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  target_incident uuid := p_incident_id;
  transition_time timestamptz := now();
begin
  perform pg_advisory_xact_lock(918240771);
  if p_actor_role not in ('COMMAND', 'SAFETY') then
    raise exception 'Only COMMAND or SAFETY may confirm Condition 1 recovery' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_justification, ''))) < 3 then
    raise exception 'Recovery confirmation text is required' using errcode = '22023';
  end if;

  if target_incident is null then
    select incident_id into target_incident
      from emergency_incidents
      where is_resolved = false
      order by created_at desc
      limit 1
      for update;
  else
    select incident_id into target_incident
      from emergency_incidents
      where incident_id = target_incident
        and is_resolved = false
      for update;
  end if;
  if target_incident is null then
    raise exception 'No active incident is available for recovery' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from field_sorties
    where sortie_status <> 'COMPLETED'
  ) then
    raise exception 'Condition 1 recovery is blocked until every field sortie is closed' using errcode = '23514';
  end if;

  update emergency_incidents
    set is_resolved = true,
        lockdown_active = false,
        resolved_at = transition_time,
        action_log = coalesce(action_log, '[]'::jsonb) ||
          jsonb_build_array(jsonb_build_object('action', 'Recovery state declared', 'at', transition_time))
    where incident_id = target_incident
      and is_resolved = false;

  insert into operation_events (
    module, action, tone, user_name, justification, actor_id, actor_role, event_time
  ) values (
    'EMERGENCY', 'Condition 1 recovery confirmed · all field sorties closed',
    'green', p_actor_name, trim(p_justification), p_actor_id, p_actor_role, transition_time
  );
  return transition_time;
end;
$$;

revoke all on function mark_overdue_field_sorties() from public, anon, authenticated;
revoke all on function dispatch_field_sortie(uuid, uuid, text, uuid, timestamptz, text, text, text, uuid[], text, text, text, text) from public, anon, authenticated;
revoke all on function transition_field_sortie(uuid, text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function set_personnel_safety_status(uuid, text, text) from public, anon, authenticated;
revoke all on function create_condition1_cascade(uuid, text, uuid[], uuid[], text, text, text) from public, anon, authenticated;
revoke all on function resolve_condition1(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function mark_overdue_field_sorties() to service_role;
grant execute on function dispatch_field_sortie(uuid, uuid, text, uuid, timestamptz, text, text, text, uuid[], text, text, text, text) to service_role;
grant execute on function transition_field_sortie(uuid, text, uuid, text, text, text) to service_role;
grant execute on function set_personnel_safety_status(uuid, text, text) to service_role;
grant execute on function create_condition1_cascade(uuid, text, uuid[], uuid[], text, text, text) to service_role;
grant execute on function resolve_condition1(uuid, text, text, text, text) to service_role;

commit;