import { supabase } from './supabase';
import type {
  CargoItem,
  Emergency,
  EmergencyPayload,
  InventoryItem,
  OperationsSnapshot,
  Person,
  QueueOperation,
  Station,
  Status,
  Voyage,
} from './operations-types';

const standbyEmergency: Emergency = {
  type: 'No active incidents',
  severity: 'STANDBY',
  description: 'All stations operating within command parameters.',
  active: false,
  lockdown: false,
  timestamp: '—',
};

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

function numberOr(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatDate(value: unknown, fallback = '—') {
  if (!value) return fallback;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(value: unknown, fallback = '—') {
  if (!value) return fallback;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.toISOString().slice(11, 19)} UTC`;
}

function statusFromVoyage(value: string): Status {
  if (value === 'IN_TRANSIT' || value === 'ICE_NAVIGATION') return 'UNDERWAY';
  if (value === 'DIVERTED') return 'DELAYED';
  if (value === 'PLANNED' || value === 'STAGING') return 'READY';
  return 'ON STATION';
}

function voyageStatusToDb(value: Status) {
  if (value === 'UNDERWAY') return 'IN_TRANSIT';
  if (value === 'DELAYED') return 'DIVERTED';
  if (value === 'READY') return 'PLANNED';
  return 'PLANNED';
}

function cargoStatusFromDb(value: string, telemetry?: { is_breached?: boolean }) {
  if (telemetry?.is_breached || value === 'LOST') return 'CRITICAL' as Status;
  if (value === 'AT_STATION_STORAGE' || value === 'OFFLOADED_FAST_ICE') return 'HOLD' as Status;
  return 'NORMAL' as Status;
}

function cargoTypeFromDb(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase());
}

function cargoTypeToDb(value: string): 'FOOD_RATION' | 'FUEL_ATF' | 'FUEL_DIESEL' | 'MRO_SPARE' | 'SCIENCE_PAYLOAD' | 'MEDICAL' {
  const normalized = value.toLowerCase();
  if (normalized.includes('fuel')) return normalized.includes('aviation') ? 'FUEL_ATF' : 'FUEL_DIESEL';
  if (normalized.includes('medical')) return 'MEDICAL';
  if (normalized.includes('science')) return 'SCIENCE_PAYLOAD';
  if (normalized.includes('engineering')) return 'MRO_SPARE';
  return 'FOOD_RATION';
}

function personStatusFromDb(value: string): Person['status'] {
  if (value === 'FIELD_SORTIE') return 'FIELD';
  if (value === 'MEDEVAC_IN_PROGRESS' || value === 'OFFLINE_UNACCOUNTED') return 'SOS';
  return 'INDOOR';
}

function personStatusToDb(value: Person['status']) {
  if (value === 'FIELD') return 'FIELD_SORTIE';
  if (value === 'SOS') return 'MEDEVAC_IN_PROGRESS';
  return 'INDOORS_STATION';
}

function incidentToEmergency(row: Record<string, unknown>): Emergency {
  const severity = String(row.incident_severity || 'LEVEL_1_ROUTINE');
  const type = String(row.incident_type || 'GENERATOR_LOSS');
  const isResolved = Boolean(row.is_resolved);
  return {
    incidentId: String(row.incident_id || ''),
    stationId: row.station_id ? String(row.station_id) : undefined,
    type: type === 'BLIZZARD_COND_1' ? 'Blizzard cascade' : type.replaceAll('_', ' '),
    severity: severity === 'LEVEL_3_LIFE_THREATENING' ? 'CONDITION 1' : severity.replace('LEVEL_', 'LEVEL '),
    description: String(row.description || standbyEmergency.description),
    active: !isResolved,
    lockdown: Boolean(row.lockdown_active) && !isResolved,
    timestamp: formatDateTime(row.created_at),
  };
}

export async function loadOperations(): Promise<OperationsSnapshot> {
  const client = requireClient();
  const [stationResult, voyageResult, cargoResult, telemetryResult, inventoryResult, personnelResult, incidentResult] = await Promise.all([
    client.from('polar_stations').select('*').order('station_code'),
    client.from('expedition_voyages').select('*').order('created_at', { ascending: false }),
    client.from('cargo_manifest').select('*').order('updated_at', { ascending: false }),
    client.from('cargo_telemetry').select('*').order('recorded_at', { ascending: false }).limit(500),
    client.from('inventory_items').select('*').order('sku_code'),
    client.from('expedition_personnel').select('*').order('full_name'),
    client.from('emergency_incidents').select('*').order('created_at', { ascending: false }).limit(20),
  ]);

  const results = [stationResult, voyageResult, cargoResult, telemetryResult, inventoryResult, personnelResult, incidentResult];
  const failed = results.find(result => result.error);
  if (failed?.error) throw new Error(`Supabase read failed: ${failed.error.message}`);

  const stations: Station[] = (stationResult.data || []).map(row => {
    const station: Station = {
      id: row.station_id,
      code: row.station_code,
      name: row.name,
      theatre: row.operating_theatre === 'ARCTIC' ? 'Arctic theatre' : row.name === 'Maitri' ? 'Queen Maud Land' : row.name === 'Bharati' ? 'Larsemann Hills' : 'Antarctic theatre',
      occupancy: numberOr(row.current_occupancy),
      capacity: numberOr(row.max_winter_capacity || row.max_summer_capacity),
      weather: row.name === 'Maitri' ? 'Blowing snow' : row.name === 'Bharati' ? 'Clear / −18°' : 'Overcast / −6°',
      coordinates: row.coordinates?.coordinates ? `${row.coordinates.coordinates[1]}°, ${row.coordinates.coordinates[0]}°` : 'Coordinates unavailable',
    };
    return station;
  });

  const voyages: Voyage[] = (voyageResult.data || []).map(row => ({
    id: row.voyage_id,
    expedition: row.expedition_number,
    vessel: row.vessel_name,
    polarClass: row.polar_class_rating,
    route: `${row.departure_port} → ${row.intermediate_port}`,
    status: statusFromVoyage(row.voyage_status),
    departure: formatDate(row.planned_departure_date),
    iceEntry: formatDate(row.estimated_ice_entry_date),
    delay: row.voyage_status === 'DIVERTED' ? 1 : 0,
  }));

  const latestTelemetry = new Map<string, Record<string, unknown>>();
  for (const row of telemetryResult.data || []) {
    if (!latestTelemetry.has(row.cargo_id)) latestTelemetry.set(row.cargo_id, row);
  }
  const stationNamesById = new Map(stations.map(station => [station.id, station.name]));
  const cargo: CargoItem[] = (cargoResult.data || []).map(row => {
    const telemetry = latestTelemetry.get(row.cargo_id);
    return {
      id: row.cargo_id,
      tracking: row.tracking_number,
      description: row.cargo_description,
      destination: stationNamesById.get(row.destination_station_id) || 'Unassigned',
      type: cargoTypeFromDb(row.cargo_type),
      weight: numberOr(row.weight_kg),
      temperature: numberOr(telemetry?.temperature_celsius),
      humidity: numberOr(telemetry?.relative_humidity),
      shock: numberOr(telemetry?.shock_g_force),
      status: cargoStatusFromDb(row.current_status, telemetry),
      coldChain: Boolean(row.is_cold_chain),
    };
  });

  const inventory: InventoryItem[] = (inventoryResult.data || []).map(row => ({
    id: row.item_id,
    name: row.name,
    sku: row.sku_code,
    category: String(row.category).replaceAll('_', ' '),
    ved: row.ved_category,
    quantity: numberOr(row.quantity_on_hand),
    unit: row.unit_of_measure,
    dailyBurn: numberOr(row.daily_burn_rate),
    threshold: numberOr(row.safety_stock_threshold),
    station: stationNamesById.get(row.station_id) || 'Unassigned',
  }));

  const personnel: Person[] = (personnelResult.data || []).map(row => ({
    id: row.personnel_id,
    name: row.full_name,
    role: String(row.role_category).replaceAll('_', ' ').replace(/\b\w/g, character => character.toUpperCase()),
    station: stationNamesById.get(row.assigned_station_id) || 'Unassigned',
    phase: row.deployment_phase === 'WINTER_OVER' ? 'Winter-over' : 'Summer',
    medical: row.aiims_medical_class === 'FAILED' ? 'Failed' : `Class ${String(row.aiims_medical_class).replace('CLASS_', '')}`,
    training: row.itbp_survival_training_cleared ? 'Current' : 'Refresh due',
    blood: row.blood_group,
    status: personStatusFromDb(row.current_safety_status),
  }));

  const latestIncident = (incidentResult.data || []).find(row => !row.is_resolved);
  return {
    stations,
    voyages,
    cargo,
    inventory,
    personnel,
    emergency: latestIncident ? incidentToEmergency(latestIncident) : standbyEmergency,
  };
}

export async function createVoyage(voyage: Voyage) {
  const client = requireClient();
  const destination = voyage.route.split('→').at(-1)?.trim() || 'Maitri';
  const { error } = await client.from('expedition_voyages').insert({
    expedition_number: voyage.expedition,
    vessel_name: voyage.vessel,
    vessel_imo_number: `PLX-${voyage.id.replace(/\D/g, '') || Date.now()}`,
    polar_class_rating: voyage.polarClass,
    departure_port: voyage.route.split('→')[0]?.trim() || 'Goa, India',
    intermediate_port: destination,
    planned_departure_date: new Date(voyage.departure).toISOString().slice(0, 10),
    estimated_ice_entry_date: new Date(voyage.iceEntry.replace('·', '')).toISOString().slice(0, 10),
    voyage_status: voyageStatusToDb(voyage.status),
  });
  if (error) throw new Error(`Supabase voyage write failed: ${error.message}`);
}

export async function adjustInventory(sku: string, delta: number) {
  const client = requireClient();
  const current = await client.from('inventory_items').select('quantity_on_hand').eq('sku_code', sku).single();
  if (current.error) throw new Error(`Supabase inventory read failed: ${current.error.message}`);
  const { error } = await client.from('inventory_items').update({
    quantity_on_hand: Math.max(0, numberOr(current.data.quantity_on_hand) + delta),
    last_reconciled_date: new Date().toISOString(),
  }).eq('sku_code', sku);
  if (error) throw new Error(`Supabase inventory write failed: ${error.message}`);
}

export async function updatePersonnelStatus(id: string, status: Person['status']) {
  const { error } = await requireClient().from('expedition_personnel').update({
    current_safety_status: personStatusToDb(status),
    updated_at: new Date().toISOString(),
  }).eq('personnel_id', id);
  if (error) throw new Error(`Supabase personnel write failed: ${error.message}`);
}

export async function updateCargoTelemetry(cargo: CargoItem) {
  const client = requireClient();
  if (!cargo.id) throw new Error(`Cargo ${cargo.tracking} is not linked to Supabase`);
  const { error } = await client.from('cargo_telemetry').insert({
    cargo_id: cargo.id,
    recorded_at: new Date().toISOString(),
    temperature_celsius: cargo.temperature,
    relative_humidity: cargo.humidity,
    shock_g_force: cargo.shock,
    door_open_flag: false,
    is_breached: cargo.status === 'CRITICAL',
    synced_from_edge: false,
  });
  if (error) throw new Error(`Supabase telemetry write failed: ${error.message}`);
}

export async function createEmergencyCascade(payload: EmergencyPayload, cargoIds: string[], voyageIds: string[]) {
  const client = requireClient();
  const inserted = await client.from('emergency_incidents').insert({
    station_id: payload.stationId || null,
    incident_severity: payload.severity,
    incident_type: payload.incidentType,
    initiating_entity: 'PolarLogix command console',
    description: payload.description,
    lockdown_active: payload.lockdown,
    action_log: [{ action: 'Condition 1 cascade executed', at: new Date().toISOString() }],
  }).select('incident_id').single();
  if (inserted.error) throw new Error(`Supabase incident write failed: ${inserted.error.message}`);

  const writes = [
    ...cargoIds.map(cargoId => client.from('cargo_manifest').update({ current_status: 'AT_STATION_STORAGE', updated_at: new Date().toISOString() }).eq('cargo_id', cargoId)),
    ...voyageIds.map(voyageId => client.from('expedition_voyages').update({ voyage_status: 'DIVERTED' }).eq('voyage_id', voyageId)),
  ];
  const results = await Promise.all(writes);
  const failed = results.find(result => result.error);
  if (failed?.error) throw new Error(`Supabase cascade write failed: ${failed.error.message}`);
  return inserted.data;
}

export async function resolveEmergency(incidentId?: string) {
  const client = requireClient();
  let targetIncidentId = incidentId;
  if (!targetIncidentId) {
    const latest = await client
      .from('emergency_incidents')
      .select('incident_id')
      .eq('is_resolved', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest.error) throw new Error(`Supabase incident lookup failed: ${latest.error.message}`);
    targetIncidentId = latest.data?.incident_id;
  }
  if (!targetIncidentId) return;
  const { error } = await client.from('emergency_incidents').update({
    is_resolved: true,
    lockdown_active: false,
    resolved_at: new Date().toISOString(),
    action_log: [{ action: 'Recovery state declared', at: new Date().toISOString() }],
  }).eq('incident_id', targetIncidentId);
  if (error) throw new Error(`Supabase incident recovery failed: ${error.message}`);
}

export async function applyQueuedOperation(operation: QueueOperation) {
  switch (operation.kind) {
    case 'voyage-create':
      return createVoyage(operation.payload);
    case 'inventory-adjust':
      return adjustInventory(operation.payload.sku, operation.payload.delta);
    case 'personnel-status':
      return updatePersonnelStatus(operation.payload.id, operation.payload.status);
    case 'cargo-anomaly':
      return updateCargoTelemetry(operation.payload.cargo);
    case 'emergency-cascade':
      return createEmergencyCascade(operation.payload.emergency, operation.payload.cargoIds, operation.payload.voyageIds);
    case 'emergency-resolve':
      return resolveEmergency(operation.payload.incidentId);
  }
}