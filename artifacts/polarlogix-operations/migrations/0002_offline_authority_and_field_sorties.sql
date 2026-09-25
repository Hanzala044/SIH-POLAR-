begin;

alter table operation_events
  add column if not exists actor_id text,
  add column if not exists actor_role varchar(16)
    check (actor_role is null or actor_role in ('COMMAND', 'LOGISTICS', 'SAFETY', 'VIEWER'));

create table if not exists operation_idempotency (
  actor_id text not null,
  idempotency_key varchar(128) not null,
  endpoint text not null,
  http_method varchar(8) not null,
  command_status varchar(16) not null default 'PROCESSING'
    check (command_status in ('PROCESSING', 'COMPLETED')),
  response_status integer,
  response_body jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (actor_id, idempotency_key)
);

create table if not exists operator_access_requests (
  request_id varchar(64) primary key,
  operator_name varchar(120) not null,
  requested_role varchar(80) not null,
  station_name varchar(100) not null,
  station_code varchar(12) not null,
  request_summary text not null,
  submitted_at timestamptz not null default now(),
  priority varchar(12) not null check (priority in ('ROUTINE', 'URGENT')),
  request_status varchar(12) not null default 'PENDING'
    check (request_status in ('PENDING', 'APPROVED', 'REJECTED'))
);

create table if not exists operator_access_decisions (
  request_id varchar(64) primary key
    references operator_access_requests(request_id) on delete restrict,
  idempotency_key varchar(128) not null unique,
  decision varchar(12) not null check (decision in ('APPROVED', 'REJECTED')),
  actor_id text not null,
  actor_name varchar(120) not null,
  actor_role varchar(16) not null check (actor_role in ('COMMAND', 'SAFETY')),
  justification text not null,
  decided_at timestamptz not null default now()
);

create table if not exists field_sortie_personnel (
  sortie_id uuid not null references field_sorties(sortie_id) on delete cascade,
  personnel_id uuid not null references expedition_personnel(personnel_id) on delete restrict,
  assignment_status varchar(16) not null default 'FIELD'
    check (assignment_status in ('FIELD', 'SOS', 'RETURNED', 'RECALLED')),
  beacon_confirmed_at timestamptz,
  actual_return_time timestamptz,
  primary key (sortie_id, personnel_id)
);

alter table field_sorties
  add column if not exists overdue_escalated_at timestamptz,
  add column if not exists recalled_at timestamptz;

alter table field_sorties
  drop constraint if exists field_sorties_sortie_status_check;
alter table field_sorties
  add constraint field_sorties_sortie_status_check
    check (sortie_status in ('ACTIVE', 'COMPLETED', 'OVERDUE', 'SOS_TRIGGERED', 'RECALLED'));

insert into field_sortie_personnel (sortie_id, personnel_id, assignment_status)
select sortie_id, lead_personnel_id,
       case when sortie_status in ('COMPLETED', 'RECALLED') then 'RETURNED' else 'FIELD' end
from field_sorties
where lead_personnel_id is not null
on conflict (sortie_id, personnel_id) do nothing;

insert into operator_access_requests
  (request_id, operator_name, requested_role, station_name, station_code, request_summary, submitted_at, priority)
values
  ('REQ-204', 'Ananya Rao', 'Field Scientist', 'Bharati', 'BHT', 'Access cargo telemetry and weather uplink', now() - interval '18 minutes', 'URGENT'),
  ('REQ-203', 'Vikram Singh', 'Station Commander', 'Maitri', 'MAI', 'Approve vehicle sortie · LSV-03', now() - interval '43 minutes', 'ROUTINE'),
  ('REQ-202', 'Nisha Thomas', 'Science Lead', 'Himadri', 'HMI', 'Authorize science equipment transfer', now() - interval '64 minutes', 'ROUTINE'),
  ('REQ-201', 'Rohan Iyer', 'Logistics Crew', 'Maitri', 'MAI', 'Request temporary fuel inventory access', now() - interval '89 minutes', 'ROUTINE')
on conflict (request_id) do nothing;

create or replace function decide_operator_access_request(
  p_request_id text,
  p_decision text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text,
  p_justification text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_decision operator_access_decisions%rowtype;
  request_row operator_access_requests%rowtype;
  decision_time timestamptz := now();
begin
  if p_actor_role not in ('COMMAND', 'SAFETY') then
    raise exception 'Only COMMAND or SAFETY may decide operator requests' using errcode = '42501';
  end if;
  if p_decision not in ('APPROVED', 'REJECTED') then
    raise exception 'Decision must be APPROVED or REJECTED' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_justification, ''))) < 3 then
    raise exception 'A decision justification is required' using errcode = '22023';
  end if;

  select * into existing_decision
    from operator_access_decisions
    where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'requestId', existing_decision.request_id,
      'status', existing_decision.decision,
      'actorId', existing_decision.actor_id,
      'actor', existing_decision.actor_name,
      'role', existing_decision.actor_role,
      'justification', existing_decision.justification,
      'decidedAt', existing_decision.decided_at
    );
  end if;

  select * into request_row
    from operator_access_requests
    where request_id = p_request_id
    for update;
  if not found then
    raise exception 'Operator request not found' using errcode = 'P0002';
  end if;
  if request_row.request_status <> 'PENDING' then
    raise exception 'Operator request has already been decided' using errcode = '23505';
  end if;

  insert into operator_access_decisions (
    request_id, idempotency_key, decision, actor_id, actor_name,
    actor_role, justification, decided_at
  ) values (
    p_request_id, p_idempotency_key, p_decision, p_actor_id, p_actor_name,
    p_actor_role, trim(p_justification), decision_time
  ) returning * into existing_decision;

  update operator_access_requests
    set request_status = p_decision
    where request_id = p_request_id;

  insert into operation_events (
    module, action, tone, user_name, justification, actor_id, actor_role, event_time
  ) values (
    'AUTHORITY',
    'Operator access ' || lower(p_decision) || ' · ' || request_row.operator_name || ' / ' || request_row.station_name,
    case when p_decision = 'APPROVED' then 'green' else 'red' end,
    p_actor_name,
    trim(p_justification),
    p_actor_id,
    p_actor_role,
    decision_time
  );

  return jsonb_build_object(
    'requestId', existing_decision.request_id,
    'status', existing_decision.decision,
    'actorId', existing_decision.actor_id,
    'actor', existing_decision.actor_name,
    'role', existing_decision.actor_role,
    'justification', existing_decision.justification,
    'decidedAt', existing_decision.decided_at
  );
end;
$$;

revoke all on function decide_operator_access_request(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function decide_operator_access_request(text, text, text, text, text, text, text) to service_role;

alter table operation_idempotency enable row level security;
alter table operator_access_requests enable row level security;
alter table operator_access_decisions enable row level security;
alter table field_sortie_personnel enable row level security;

commit;