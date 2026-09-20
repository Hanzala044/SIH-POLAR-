-- PolarLogix - Supabase/PostgreSQL production schema
-- Run this in the Supabase SQL editor after enabling PostGIS.

create extension if not exists "uuid-ossp";
create extension if not exists "postgis";

create table if not exists polar_stations (
  station_id uuid primary key default uuid_generate_v4(),
  station_code varchar(10) unique not null,
  name varchar(100) not null,
  operating_theatre varchar(20) not null check (operating_theatre in ('ANTARCTICA', 'ARCTIC')),
  coordinates geometry(Point, 4326) not null,
  max_summer_capacity integer not null,
  max_winter_capacity integer not null,
  current_occupancy integer not null default 0,
  is_edge_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists expedition_voyages (
  voyage_id uuid primary key default uuid_generate_v4(),
  expedition_number varchar(20) not null,
  vessel_name varchar(100) not null,
  vessel_imo_number varchar(20) unique not null,
  polar_class_rating varchar(10) not null,
  departure_port varchar(50) not null default 'Goa, India',
  intermediate_port varchar(50) not null default 'Cape Town, South Africa',
  planned_departure_date date not null,
  actual_departure_date date,
  estimated_ice_entry_date date not null,
  voyage_status varchar(30) not null default 'PLANNED'
    check (voyage_status in ('PLANNED', 'STAGING', 'IN_TRANSIT', 'ICE_NAVIGATION', 'DISCHARGING', 'COMPLETED', 'DIVERTED')),
  created_at timestamptz not null default now()
);

create table if not exists cargo_manifest (
  cargo_id uuid primary key default uuid_generate_v4(),
  tracking_number varchar(50) unique not null,
  voyage_id uuid references expedition_voyages(voyage_id),
  destination_station_id uuid references polar_stations(station_id),
  cargo_description text not null,
  cargo_type varchar(30) not null
    check (cargo_type in ('FOOD_RATION', 'FUEL_ATF', 'FUEL_DIESEL', 'MRO_SPARE', 'SCIENCE_PAYLOAD', 'MEDICAL')),
  weight_kg numeric(10, 2) not null,
  volume_cbm numeric(10, 2) not null,
  is_hazmat boolean not null default false,
  imdg_class varchar(10),
  is_cold_chain boolean not null default false,
  temp_min_celsius numeric(5, 2),
  temp_max_celsius numeric(5, 2),
  stowage_deck_location varchar(50),
  current_status varchar(30) not null default 'MANIFESTED'
    check (current_status in ('MANIFESTED', 'LOADED_VESSEL', 'IN_TRANSIT', 'OFFLOADED_FAST_ICE', 'AT_STATION_STORAGE', 'CONSUMED', 'LOST')),
  updated_at timestamptz not null default now()
);

create table if not exists cargo_telemetry (
  telemetry_id bigint generated always as identity,
  cargo_id uuid not null references cargo_manifest(cargo_id) on delete cascade,
  recorded_at timestamptz not null,
  temperature_celsius numeric(5, 2),
  relative_humidity numeric(5, 2),
  shock_g_force numeric(6, 3),
  door_open_flag boolean not null default false,
  battery_level_pct numeric(5, 2),
  location_coordinates geometry(Point, 4326),
  is_breached boolean not null default false,
  synced_from_edge boolean not null default false,
  primary key (telemetry_id, recorded_at)
);

create table if not exists inventory_items (
  item_id uuid primary key default uuid_generate_v4(),
  station_id uuid references polar_stations(station_id),
  sku_code varchar(50) not null,
  name varchar(150) not null,
  ved_category varchar(1) not null check (ved_category in ('V', 'E', 'D')),
  category varchar(30) not null
    check (category in ('FUEL', 'FOOD', 'MACHINERY_SPARE', 'MEDICAL_SUPPLY', 'SCIENCE_REAGENT')),
  quantity_on_hand numeric(12, 3) not null,
  unit_of_measure varchar(20) not null,
  daily_burn_rate numeric(10, 3) not null default 0,
  safety_stock_threshold numeric(12, 3) not null,
  storage_bin_location varchar(50),
  shelf_life_expiry date,
  last_reconciled_date timestamptz not null default now(),
  unique (station_id, sku_code)
);

create table if not exists expedition_personnel (
  personnel_id uuid primary key default uuid_generate_v4(),
  govt_id_hash varchar(64) unique not null,
  full_name varchar(120) not null,
  assigned_station_id uuid references polar_stations(station_id),
  role_category varchar(30) not null
    check (role_category in ('SCIENTIST', 'LOGISTICS_CREW', 'STATION_DOCTOR', 'VEHICLE_MECHANIC', 'STATION_COMMANDER')),
  deployment_phase varchar(15) not null
    check (deployment_phase in ('SUMMER_ONLY', 'WINTER_OVER')),
  itbp_survival_training_cleared boolean not null default false,
  aiims_medical_class varchar(10) not null
    check (aiims_medical_class in ('CLASS_1', 'CLASS_2', 'FAILED')),
  blood_group varchar(5) not null,
  active_bunk_number varchar(20),
  current_safety_status varchar(25) not null default 'INDOORS_STATION'
    check (current_safety_status in ('INDOORS_STATION', 'FIELD_SORTIE', 'IN_TRANSIT_AIR', 'MEDEVAC_IN_PROGRESS', 'OFFLINE_UNACCOUNTED')),
  updated_at timestamptz not null default now()
);

create table if not exists field_sorties (
  sortie_id uuid primary key default uuid_generate_v4(),
  station_id uuid references polar_stations(station_id),
  lead_personnel_id uuid references expedition_personnel(personnel_id),
  destination_name varchar(100) not null,
  destination_area geometry(Polygon, 4326),
  departure_time timestamptz not null,
  expected_return_time timestamptz not null,
  actual_return_time timestamptz,
  vehicle_identifier varchar(50),
  comm_frequency_vhf varchar(20) not null,
  sat_phone_callsign varchar(30),
  sortie_status varchar(20) not null default 'ACTIVE'
    check (sortie_status in ('ACTIVE', 'COMPLETED', 'OVERDUE', 'SOS_TRIGGERED'))
);

create table if not exists emergency_incidents (
  incident_id uuid primary key default uuid_generate_v4(),
  station_id uuid references polar_stations(station_id),
  incident_severity varchar(20) not null
    check (incident_severity in ('LEVEL_1_ROUTINE', 'LEVEL_2_URGENT', 'LEVEL_3_LIFE_THREATENING')),
  incident_type varchar(30) not null
    check (incident_type in ('BLIZZARD_COND_1', 'CREVASSE_FALL', 'COLD_EXPOSURE', 'FIRE_OUTBREAK', 'GENERATOR_LOSS', 'MEDICAL_SURGICAL')),
  initiating_entity varchar(100),
  geo_coordinates geometry(Point, 4326),
  description text not null,
  action_log jsonb not null default '[]'::jsonb,
  lockdown_active boolean not null default false,
  is_resolved boolean not null default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_stations_geom on polar_stations using gist (coordinates);
create index if not exists idx_sorties_geom on field_sorties using gist (destination_area);
create index if not exists idx_telemetry_cargo_time on cargo_telemetry (cargo_id, recorded_at desc);
create index if not exists idx_inventory_ved on inventory_items (station_id, ved_category);

-- The emergency console subscribes to this table in the production client:
-- supabase.channel('emergency-events')
--   .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'emergency_incidents' }, handler)
--   .subscribe()
alter table emergency_incidents replica identity full;

-- -----------------------------------------------------------------------------
-- Supabase security and realtime publication
-- -----------------------------------------------------------------------------
-- The client uses the publishable anon key, so every operational table must be
-- protected by RLS. Set the user's role in Supabase Auth app_metadata:
-- NCPOR_ADMIN, NCPOR_COMMANDER, or NCPOR_OPERATIONS.
create or replace function public.has_ncpor_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = any(required_roles);
$$;

revoke all on function public.has_ncpor_role(text[]) from public;
grant execute on function public.has_ncpor_role(text[]) to authenticated;

alter table polar_stations enable row level security;
alter table expedition_voyages enable row level security;
alter table cargo_manifest enable row level security;
alter table cargo_telemetry enable row level security;
alter table inventory_items enable row level security;
alter table expedition_personnel enable row level security;
alter table field_sorties enable row level security;
alter table emergency_incidents enable row level security;

drop policy if exists "ncpor read stations" on polar_stations;
create policy "ncpor read stations" on polar_stations for select to authenticated
  using (public.has_ncpor_role(array['NCPOR_ADMIN', 'NCPOR_COMMANDER', 'NCPOR_OPERATIONS']));
drop policy if exists "ncpor manage stations" on polar_stations;
create policy "ncpor manage stations" on polar_stations for all to authenticated
  using (public.has_ncpor_role(array['NCPOR_ADMIN']))
  with check (public.has_ncpor_role(array['NCPOR_ADMIN']));

drop policy if exists "ncpor read voyages" on expedition_voyages;
create policy "ncpor read voyages" on expedition_voyages for select to authenticated
  using (public.has_ncpor_role(array['NCPOR_ADMIN', 'NCPOR_COMMANDER', 'NCPOR_OPERATIONS']));
drop policy if exists "ncpor manage voyages" on expedition_voyages;
create policy "ncpor manage voyages" on expedition_voyages for all to authenticated
  using (public.has_ncpor_role(array['NCPOR_ADMIN', 'NCPOR_COMMANDER', 'NCPOR_OPERATIONS']))
  with check (public.has_ncpor_role(array['NCPOR_ADMIN', 'NCPOR_COMMANDER', 'NCPOR_OPERATIONS']));

drop policy if exists "ncpor read cargo manifest" on cargo_manifest;
create policy "ncpor read cargo manifest" on cargo_manifest for select to authenticated
  using (public.has_ncpor_role(array['NCPOR_ADMIN', 'NCPOR_COMMANDER', 'NCPOR_OPERATIONS']));
drop policy if exists "ncpor manage cargo manifest" on cargo_manifest;
create policy "ncpor manage cargo manifest" on cargo_manifest for all to authenticated
  using (public.has_ncpor_role(array['NCPOR_ADMIN', 'NCPOR_COMMANDER', 'NCPOR_OPERATIONS']))
  with check (public.has_ncpor_role(array['NCPOR_ADMIN', 'NCPOR_COMMANDER', 'NCPOR_OPERATIONS']));

drop policy if exists "ncpor read telemetry" on cargo_telemetry;
create policy "ncpor read telemetry" on cargo_telemetry for select to authenticated
  using (public.has_ncpor_role(array['NCPOR_ADMIN', 'NCPOR_COMMANDER', 'NCPOR_OPERATIONS']));
drop policy if exists "ncpor append telemetry" on cargo_telemetry;
create policy "ncpor append telemetry" on cargo_telemetry for insert to authenticated
  with check (public.has_ncpor_role(array['NCPOR_ADMIN', 'NCPOR_COMMANDER', 'NCPOR_OPERATIONS']));

drop policy if exists "ncpor read inventory" on inventory_items;
create policy "ncpor read inventory" on inventory_items for select to authenticated
  using (public.has_ncpor_role(array['NCPOR_ADMIN', 'NCPOR_COMMANDER', 'NCPOR_OPERATIONS']));
drop policy if exists "ncpor manage inventory" on inventory_items;
create policy "ncpor manage inventory" on inventory_items for update to authenticated
  using (public.has_ncpor_role(array['NCPOR_ADMIN', 'NCPOR_COMMANDER', 'NCPOR_OPERATIONS']))
  with check (public.has_ncpor_role(array['NCPOR_ADMIN', 'NCPOR_COMMANDER', 'NCPOR_OPERATIONS']));

drop policy if exists "ncpor read personnel" on expedition_personnel;
create policy "ncpor read personnel" on expedition_personnel for select to authenticated
  using (public.has_ncpor_role(array['NCPOR_ADMIN', 'NCPOR_COMMANDER', 'NCPOR_OPERATIONS']));
drop policy if exists "ncpor update personnel" on expedition_personnel;
create policy "ncpor update personnel" on expedition_personnel for update to authenticated
  using (public.has_ncpor_role(array['NCPOR_ADMIN', 'NCPOR_COMMANDER', 'NCPOR_OPERATIONS']))
  with check (public.has_ncpor_role(array['NCPOR_ADMIN', 'NCPOR_COMMANDER', 'NCPOR_OPERATIONS']));

drop policy if exists "ncpor read field sorties" on field_sorties;
create policy "ncpor read field sorties" on field_sorties for select to authenticated
  using (public.has_ncpor_role(array['NCPOR_ADMIN', 'NCPOR_COMMANDER', 'NCPOR_OPERATIONS']));
drop policy if exists "ncpor manage field sorties" on field_sorties;
create policy "ncpor manage field sorties" on field_sorties for all to authenticated
  using (public.has_ncpor_role(array['NCPOR_ADMIN', 'NCPOR_COMMANDER', 'NCPOR_OPERATIONS']))
  with check (public.has_ncpor_role(array['NCPOR_ADMIN', 'NCPOR_COMMANDER', 'NCPOR_OPERATIONS']));

drop policy if exists "ncpor read incidents" on emergency_incidents;
create policy "ncpor read incidents" on emergency_incidents for select to authenticated
  using (public.has_ncpor_role(array['NCPOR_ADMIN', 'NCPOR_COMMANDER', 'NCPOR_OPERATIONS']));
drop policy if exists "ncpor create incidents" on emergency_incidents;
create policy "ncpor create incidents" on emergency_incidents for insert to authenticated
  with check (public.has_ncpor_role(array['NCPOR_ADMIN', 'NCPOR_COMMANDER', 'NCPOR_OPERATIONS']));
drop policy if exists "ncpor resolve incidents" on emergency_incidents;
create policy "ncpor resolve incidents" on emergency_incidents for update to authenticated
  using (public.has_ncpor_role(array['NCPOR_ADMIN', 'NCPOR_COMMANDER']))
  with check (public.has_ncpor_role(array['NCPOR_ADMIN', 'NCPOR_COMMANDER']));

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'emergency_incidents'
  ) then
    alter publication supabase_realtime add table public.emergency_incidents;
  end if;
end $$;