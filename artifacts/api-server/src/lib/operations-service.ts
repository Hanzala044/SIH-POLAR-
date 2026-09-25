import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "./supabase";
import type { OperatorIdentity } from "./operations-auth";

type Status =
  | "ON STATION"
  | "UNDERWAY"
  | "DELAYED"
  | "READY"
  | "HOLD"
  | "NORMAL"
  | "CRITICAL"
  | "RECALLED"
  | "SOS"
  | "INDOOR";
type AssetStatus = "READY" | "IN USE" | "MAINTENANCE DUE" | "GROUNDED" | "OFFLINE";
type PersonStatus = "INDOOR" | "FIELD" | "SOS";
type Tone = "cyan" | "amber" | "red" | "slate" | "green";

export type OperationsSnapshot = {
  stations: Array<Record<string, unknown>>;
  voyages: Array<Record<string, unknown>>;
  cargo: Array<Record<string, unknown>>;
  inventory: Array<Record<string, unknown>>;
  personnel: Array<Record<string, unknown>>;
  assets: Array<Record<string, unknown>>;
  trackingUnits: TrackingUnit[];
  events: Array<Record<string, unknown>>;
  emergency: Record<string, unknown>;
  currentUser: OperatorIdentity;
  operatorRequests: Array<Record<string, unknown>>;
  fieldSorties: Array<Record<string, unknown>>;
};

export type TrackingUnitKind = "VESSEL" | "TUG BOAT" | "HELICOPTER" | "UAV";
export type TrackingUnit = {
  id: string;
  kind: TrackingUnitKind;
  label: string;
  latitude: number;
  longitude: number;
  status: string;
  detail: string;
  voyageId?: string;
  routeKey?: string;
  progress?: number;
  speedKnots?: number;
  eta?: string;
};

const standbyEmergency = {
  type: "No active incidents",
  severity: "STANDBY",
  description: "All stations operating within command parameters.",
  active: false,
  lockdown: false,
  timestamp: "—",
};

const stationIds = {
  maitri: "8a6a4d1e-4db5-4ab2-bb55-000000000001",
  bharati: "8a6a4d1e-4db5-4ab2-bb55-000000000002",
  himadri: "8a6a4d1e-4db5-4ab2-bb55-000000000003",
  ocean: "8a6a4d1e-4db5-4ab2-bb55-000000000004",
};

const voyageIds = {
  vasundhara: "9b7b5e2f-5ec6-4bc3-8c66-000000000001",
  sagar: "9b7b5e2f-5ec6-4bc3-8c66-000000000002",
  polarstern: "9b7b5e2f-5ec6-4bc3-8c66-000000000003",
};

const cargoIds = {
  produce: "aa8c6f30-6fd7-4cd4-9d77-000000000001",
  samples: "aa8c6f30-6fd7-4cd4-9d77-000000000002",
  pump: "aa8c6f30-6fd7-4cd4-9d77-000000000003",
  medical: "aa8c6f30-6fd7-4cd4-9d77-000000000004",
  diesel: "aa8c6f30-6fd7-4cd4-9d77-000000000005",
  mast: "aa8c6f30-6fd7-4cd4-9d77-000000000006",
};

const seedAssets = [
  ["a-01", "Vostok tracked carrier", "VEHICLE", "READY", "Maitri motor pool", "18 Feb 2025", "V"],
  ["a-02", "Hagglunds Bv206", "VEHICLE", "IN USE", "Bharati east traverse", "22 Feb 2025", "E"],
  ["a-03", "Maitri genset G-04", "GENERATOR", "READY", "Maitri power house", "09 Mar 2025", "V"],
  ["a-04", "Bharati emergency genset", "GENERATOR", "MAINTENANCE DUE", "Bharati utility bay", "Due now", "V"],
  ["a-05", "AWS mast Alpha", "SCIENCE INSTRUMENT", "IN USE", "Maitri west sector", "12 Mar 2025", "E"],
  ["a-06", "Ice-core drill package", "SCIENCE INSTRUMENT", "READY", "Bharati science store", "02 Apr 2025", "D"],
  ["a-07", "PLX cold-chain pod 804", "CONTAINER", "IN USE", "MV Vasundhara", "26 Feb 2025", "V"],
  ["a-08", "PLX dry stores pod 805", "CONTAINER", "READY", "Cape Town staging", "30 Apr 2025", "E"],
] as const;
const seedEvents = [
  ["CARGO", "Cold-chain scan passed · PLX-804-19", "cyan"],
  ["PERSONNEL", "Muster reconciliation complete · 93 / 96", "green"],
  ["EXPEDITION", "MV Vasundhara entered ice corridor", "cyan"],
  ["INVENTORY", "Generator lube oil threshold review", "amber"],
  ["WEATHER", "Blizzard watch · Maitri sector", "amber"],
] as const;

const trackingUnits: TrackingUnit[] = [
  { id: "VES-01", kind: "VESSEL", label: "MV Vasundhara", latitude: -58.5, longitude: 22, status: "UNDERWAY", detail: "NCPOR-44 · ice corridor to Maitri", voyageId: voyageIds.vasundhara, routeKey: "Cape Town → Maitri", progress: 0.42, speedKnots: 6, eta: "31 Jan · 14:00 UTC" },
  { id: "VES-02", kind: "VESSEL", label: "MV Sagar Kanya", latitude: -49, longitude: 47, status: "READY", detail: "NCPOR-45 · Cape Town to Bharati", voyageId: voyageIds.sagar, routeKey: "Cape Town → Bharati", progress: 0.36, speedKnots: 0, eta: "08 Feb · 06:00 UTC" },
  { id: "VES-03", kind: "VESSEL", label: "RV Polarstern II", latitude: 79.1, longitude: 13.1, status: "DELAYED", detail: "NCPOR-46 · Longyearbyen to Himadri", voyageId: voyageIds.polarstern, routeKey: "Longyearbyen → Himadri", progress: 0.54, speedKnots: 0, eta: "09 Feb · WEATHER HOLD" },
  { id: "TUG-01", kind: "TUG BOAT", label: "NCPOR Tug Atlas", latitude: -59.6, longitude: 26.5, status: "ESCORTING", detail: "Supporting MV Vasundhara through the ice edge", routeKey: "Cape Town → Maitri", progress: 0.52, speedKnots: 4, eta: "ESCORT WINDOW · 04:20" },
  { id: "TUG-02", kind: "TUG BOAT", label: "NCPOR Tug Meridian", latitude: -64.4, longitude: 35.2, status: "STANDBY", detail: "Ready for Southern Ocean transfer", routeKey: "Maitri → Southern Ocean", progress: 0.18, speedKnots: 0, eta: "ON-CALL · 12 MIN" },
  { id: "TUG-03", kind: "TUG BOAT", label: "Harbour Tug Maitri", latitude: -70.4, longitude: 11.3, status: "ON STATION", detail: "Maitri coastal logistics and berth support", eta: "BERTH WATCH" },
  { id: "HEL-01", kind: "HELICOPTER", label: "Dhruv H-01", latitude: -70.35, longitude: 12.6, status: "PATROL", detail: "Maitri west sector visibility patrol", routeKey: "Maitri → Southern Ocean", progress: 0.08, speedKnots: 24, eta: "PATROL LEG · 00:18" },
  { id: "HEL-02", kind: "HELICOPTER", label: "Dhruv H-02", latitude: -69.05, longitude: 76.6, status: "READY", detail: "Bharati east traverse and medevac standby", eta: "LAUNCH READY" },
  { id: "UAV-01", kind: "UAV", label: "Aurora UAV-01", latitude: 78.72, longitude: 12.2, status: "SURVEY", detail: "Himadri corridor ice reconnaissance", routeKey: "Longyearbyen → Himadri", progress: 0.62, speedKnots: 16, eta: "SURVEY LEG · 00:42" },
];

let readyPromise: Promise<void> | undefined;

async function tableIsEmpty(table: string, column: string) {
  const result = await supabaseAdmin.from(table).select(column).limit(1);
  if (result.error) throw new Error(`Supabase seed read failed for ${table}: ${result.error.message}`);
  return !result.data?.length;
}

async function seedSupabaseDatabase() {
  if (await tableIsEmpty("polar_stations", "station_id")) {
    const { error } = await supabaseAdmin.from("polar_stations").insert([
      { station_id: stationIds.maitri, station_code: "MAI", name: "Maitri", operating_theatre: "ANTARCTICA", coordinates: "SRID=4326;POINT(11.7333 -70.75)", max_summer_capacity: 48, max_winter_capacity: 48, current_occupancy: 39 },
      { station_id: stationIds.bharati, station_code: "BHA", name: "Bharati", operating_theatre: "ANTARCTICA", coordinates: "SRID=4326;POINT(76.1833 -69.4)", max_summer_capacity: 47, max_winter_capacity: 47, current_occupancy: 42 },
      { station_id: stationIds.himadri, station_code: "HIM", name: "Himadri", operating_theatre: "ARCTIC", coordinates: "SRID=4326;POINT(11.9333 78.9167)", max_summer_capacity: 16, max_winter_capacity: 16, current_occupancy: 12 },
      { station_id: stationIds.ocean, station_code: "SEA", name: "Southern Ocean", operating_theatre: "ANTARCTICA", coordinates: "SRID=4326;POINT(41.1333 -64.2)", max_summer_capacity: 0, max_winter_capacity: 0, current_occupancy: 0 },
    ]);
    if (error) throw new Error(`Supabase station seed failed: ${error.message}`);
  }

  if (await tableIsEmpty("expedition_voyages", "voyage_id")) {
    const { error } = await supabaseAdmin.from("expedition_voyages").insert([
      { voyage_id: voyageIds.vasundhara, expedition_number: "NCPOR-44", vessel_name: "MV Vasundhara", vessel_imo_number: "IMO-PLX-44001", polar_class_rating: "PC-6", departure_port: "Cape Town", intermediate_port: "Maitri", planned_departure_date: "2025-01-18", estimated_ice_entry_date: "2025-01-31", voyage_status: "IN_TRANSIT" },
      { voyage_id: voyageIds.sagar, expedition_number: "NCPOR-45", vessel_name: "MV Sagar Kanya", vessel_imo_number: "IMO-PLX-45001", polar_class_rating: "PC-5", departure_port: "Cape Town", intermediate_port: "Bharati", planned_departure_date: "2025-02-08", estimated_ice_entry_date: "2025-02-21", voyage_status: "PLANNED" },
      { voyage_id: voyageIds.polarstern, expedition_number: "NCPOR-46", vessel_name: "RV Polarstern II", vessel_imo_number: "IMO-PLX-46001", polar_class_rating: "PC-3", departure_port: "Longyearbyen", intermediate_port: "Himadri", planned_departure_date: "2025-02-02", estimated_ice_entry_date: "2025-02-09", voyage_status: "DIVERTED" },
    ]);
    if (error) throw new Error(`Supabase voyage seed failed: ${error.message}`);
  }

  const canonicalCargoRows = [
      { cargo_id: cargoIds.produce, tracking_number: "PLX-804-19", voyage_id: voyageIds.vasundhara, destination_station_id: stationIds.maitri, cargo_description: "Fresh produce / 14 day pack", cargo_type: "FOOD_RATION", weight_kg: 842, volume_cbm: 1, is_cold_chain: true, current_status: "IN_TRANSIT" },
      { cargo_id: cargoIds.samples, tracking_number: "PLX-804-23", voyage_id: voyageIds.vasundhara, destination_station_id: stationIds.bharati, cargo_description: "Cryogenic sample canisters", cargo_type: "SCIENCE_PAYLOAD", weight_kg: 124, volume_cbm: 1, is_cold_chain: true, current_status: "IN_TRANSIT" },
      { cargo_id: cargoIds.pump, tracking_number: "PLX-805-02", voyage_id: voyageIds.vasundhara, destination_station_id: stationIds.maitri, cargo_description: "Hydraulic pump assembly", cargo_type: "MRO_SPARE", weight_kg: 316, volume_cbm: 1, is_cold_chain: false, current_status: "MANIFESTED" },
      { cargo_id: cargoIds.medical, tracking_number: "PLX-805-08", voyage_id: voyageIds.sagar, destination_station_id: stationIds.bharati, cargo_description: "Medical resupply / tier 1", cargo_type: "MEDICAL", weight_kg: 98, volume_cbm: 1, is_cold_chain: true, current_status: "AT_STATION_STORAGE" },
      { cargo_id: cargoIds.diesel, tracking_number: "PLX-805-11", voyage_id: voyageIds.vasundhara, destination_station_id: stationIds.maitri, cargo_description: "Diesel additive drums", cargo_type: "FUEL_DIESEL", weight_kg: 1200, volume_cbm: 1, is_cold_chain: false, current_status: "IN_TRANSIT" },
      { cargo_id: cargoIds.mast, tracking_number: "PLX-805-16", voyage_id: voyageIds.sagar, destination_station_id: stationIds.himadri, cargo_description: "Meteorology mast spares", cargo_type: "SCIENCE_PAYLOAD", weight_kg: 205, volume_cbm: 1, is_cold_chain: false, current_status: "MANIFESTED" },
  ];
  const cargoTrackingResult = await supabaseAdmin.from("cargo_manifest").select("tracking_number");
  if (cargoTrackingResult.error) throw new Error(`Supabase cargo seed read failed: ${cargoTrackingResult.error.message}`);
  const existingCargoTracking = new Set((cargoTrackingResult.data || []).map(row => row.tracking_number));
  const missingCargoRows = canonicalCargoRows.filter(row => !existingCargoTracking.has(row.tracking_number));
  if (missingCargoRows.length) {
    const { error } = await supabaseAdmin.from("cargo_manifest").insert(missingCargoRows);
    if (error) throw new Error(`Supabase cargo seed failed: ${error.message}`);
  }

  if (await tableIsEmpty("cargo_telemetry", "telemetry_id")) {
    const cargoReference = await supabaseAdmin
      .from("cargo_manifest")
      .select("cargo_id, tracking_number")
      .in("tracking_number", ["PLX-804-19", "PLX-804-23", "PLX-805-02", "PLX-805-08", "PLX-805-11", "PLX-805-16"]);
    if (cargoReference.error) throw new Error(`Supabase cargo reference read failed: ${cargoReference.error.message}`);
    const cargoIdByTracking = new Map((cargoReference.data || []).map(row => [row.tracking_number, row.cargo_id]));
    const cargoIdFor = (tracking: string) => {
      const cargoId = cargoIdByTracking.get(tracking);
      if (!cargoId) throw new Error(`Supabase cargo reference is missing: ${tracking}`);
      return cargoId;
    };
    const { error } = await supabaseAdmin.from("cargo_telemetry").insert([
      { cargo_id: cargoIdFor("PLX-804-19"), recorded_at: new Date().toISOString(), temperature_celsius: -17.2, relative_humidity: 68, shock_g_force: 0.42, is_breached: false, synced_from_edge: false },
      { cargo_id: cargoIdFor("PLX-804-23"), recorded_at: new Date().toISOString(), temperature_celsius: -74.8, relative_humidity: 31, shock_g_force: 0.18, is_breached: false, synced_from_edge: false },
      { cargo_id: cargoIdFor("PLX-805-02"), recorded_at: new Date().toISOString(), temperature_celsius: -11.4, relative_humidity: 42, shock_g_force: 1.76, is_breached: false, synced_from_edge: false },
      { cargo_id: cargoIdFor("PLX-805-08"), recorded_at: new Date().toISOString(), temperature_celsius: 4.1, relative_humidity: 45, shock_g_force: 0.31, is_breached: false, synced_from_edge: false },
      { cargo_id: cargoIdFor("PLX-805-11"), recorded_at: new Date().toISOString(), temperature_celsius: -14.8, relative_humidity: 48, shock_g_force: 0.52, is_breached: false, synced_from_edge: false },
      { cargo_id: cargoIdFor("PLX-805-16"), recorded_at: new Date().toISOString(), temperature_celsius: -8.2, relative_humidity: 39, shock_g_force: 0.26, is_breached: false, synced_from_edge: false },
    ]);
    if (error) throw new Error(`Supabase telemetry seed failed: ${error.message}`);
  }

  if (await tableIsEmpty("inventory_items", "item_id")) {
    const { error } = await supabaseAdmin.from("inventory_items").insert([
      { station_id: stationIds.maitri, sku_code: "FUEL-D-17", name: "Arctic diesel", ved_category: "V", category: "FUEL", quantity_on_hand: 18420, unit_of_measure: "L", daily_burn_rate: 860, safety_stock_threshold: 7200 },
      { station_id: stationIds.bharati, sku_code: "LIFE-W-04", name: "Potable water reserve", ved_category: "V", category: "FOOD", quantity_on_hand: 9280, unit_of_measure: "L", daily_burn_rate: 410, safety_stock_threshold: 3600 },
      { station_id: stationIds.maitri, sku_code: "LIFE-O-11", name: "Oxygen cylinders", ved_category: "V", category: "MEDICAL_SUPPLY", quantity_on_hand: 184, unit_of_measure: "cyl", daily_burn_rate: 4.2, safety_stock_threshold: 72 },
      { station_id: stationIds.maitri, sku_code: "ENG-L-09", name: "Generator lube oil", ved_category: "E", category: "MACHINERY_SPARE", quantity_on_hand: 620, unit_of_measure: "L", daily_burn_rate: 18, safety_stock_threshold: 160 },
      { station_id: stationIds.bharati, sku_code: "PROV-R-22", name: "Emergency rations", ved_category: "E", category: "FOOD", quantity_on_hand: 2460, unit_of_measure: "packs", daily_burn_rate: 48, safety_stock_threshold: 720 },
      { station_id: stationIds.maitri, sku_code: "FUEL-A-02", name: "Aviation fuel", ved_category: "E", category: "FUEL", quantity_on_hand: 7400, unit_of_measure: "L", daily_burn_rate: 260, safety_stock_threshold: 2200 },
    ]);
    if (error) throw new Error(`Supabase inventory seed failed: ${error.message}`);
  }

  if (await tableIsEmpty("expedition_personnel", "personnel_id")) {
    const { error } = await supabaseAdmin.from("expedition_personnel").insert([
      { govt_id_hash: "p-01", full_name: "Dr. Kavya Menon", assigned_station_id: stationIds.maitri, role_category: "STATION_DOCTOR", deployment_phase: "WINTER_OVER", itbp_survival_training_cleared: true, aiims_medical_class: "CLASS_1", blood_group: "O+", current_safety_status: "INDOORS_STATION" },
      { govt_id_hash: "p-02", full_name: "Arjun Raghavan", assigned_station_id: stationIds.bharati, role_category: "VEHICLE_MECHANIC", deployment_phase: "WINTER_OVER", itbp_survival_training_cleared: true, aiims_medical_class: "CLASS_1", blood_group: "B+", current_safety_status: "FIELD_SORTIE" },
      { govt_id_hash: "p-03", full_name: "Nisha Thomas", assigned_station_id: stationIds.himadri, role_category: "SCIENTIST", deployment_phase: "SUMMER_ONLY", itbp_survival_training_cleared: false, aiims_medical_class: "CLASS_1", blood_group: "A+", current_safety_status: "INDOORS_STATION" },
      { govt_id_hash: "p-04", full_name: "Vikram Singh", assigned_station_id: stationIds.maitri, role_category: "STATION_COMMANDER", deployment_phase: "WINTER_OVER", itbp_survival_training_cleared: true, aiims_medical_class: "CLASS_1", blood_group: "AB+", current_safety_status: "INDOORS_STATION" },
      { govt_id_hash: "p-05", full_name: "Sana Qureshi", assigned_station_id: stationIds.bharati, role_category: "LOGISTICS_CREW", deployment_phase: "SUMMER_ONLY", itbp_survival_training_cleared: true, aiims_medical_class: "CLASS_1", blood_group: "O-", current_safety_status: "FIELD_SORTIE" },
      { govt_id_hash: "p-06", full_name: "Rohan Iyer", assigned_station_id: stationIds.maitri, role_category: "LOGISTICS_CREW", deployment_phase: "WINTER_OVER", itbp_survival_training_cleared: true, aiims_medical_class: "CLASS_1", blood_group: "B-", current_safety_status: "INDOORS_STATION" },
    ]);
    if (error) throw new Error(`Supabase personnel seed failed: ${error.message}`);
  }
}

async function seedNormalizedOperationalRecords() {
  if (await tableIsEmpty("operational_assets", "asset_id")) {
    const { error } = await supabaseAdmin.from("operational_assets").insert(
      seedAssets.map(([assetCode, assetName, assetCategory, assetStatus, location, nextMaintenance, criticality]) => ({
        asset_code: assetCode,
        asset_name: assetName,
        asset_category: assetCategory,
        asset_status: assetStatus,
        location,
        next_maintenance: nextMaintenance,
        criticality,
      })),
    );
    if (error) throw new Error(`Supabase asset seed failed: ${error.message}`);
  }

  if (await tableIsEmpty("operation_events", "event_id")) {
    const { error } = await supabaseAdmin.from("operation_events").insert(
      seedEvents.map(([module, action, tone], index) => ({
        event_time: new Date(Date.now() - index * 60_000).toISOString(),
        module,
        action,
        tone,
      })),
    );
    if (error) throw new Error(`Supabase event seed failed: ${error.message}`);
  }
}
export async function ensureDatabaseReady() {
  readyPromise ??= (async () => {
    await seedSupabaseDatabase();
    await seedNormalizedOperationalRecords();
  })().catch(error => {
    readyPromise = undefined;
    throw error;
  });
  await readyPromise;
}

function numberOr(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatDate(value: unknown, fallback = "—") {
  if (!value) return fallback;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(value: unknown, fallback = "—") {
  if (!value) return fallback;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.toISOString().slice(11, 19)} UTC`;
}

function statusFromVoyage(value: string): Status {
  if (value === "IN_TRANSIT" || value === "ICE_NAVIGATION") return "UNDERWAY";
  if (value === "DIVERTED") return "DELAYED";
  if (value === "PLANNED" || value === "STAGING") return "READY";
  return "ON STATION";
}

function voyageStatusToDb(value: Status) {
  if (value === "UNDERWAY") return "IN_TRANSIT";
  if (value === "DELAYED") return "DIVERTED";
  if (value === "READY") return "PLANNED";
  return "PLANNED";
}

function cargoStatusFromDb(value: string, telemetry?: { is_breached?: boolean }): Status {
  if (telemetry?.is_breached || value === "LOST") return "CRITICAL";
  if (value === "AT_STATION_STORAGE" || value === "OFFLOADED_FAST_ICE") return "HOLD";
  return "NORMAL";
}

function incidentToEmergency(row: Record<string, unknown>) {
  const severity = String(row.incident_severity || "LEVEL_1_ROUTINE");
  const type = String(row.incident_type || "GENERATOR_LOSS");
  const isResolved = Boolean(row.is_resolved);
  return {
    incidentId: String(row.incident_id || ""),
    stationId: row.station_id ? String(row.station_id) : undefined,
    type: type === "BLIZZARD_COND_1" ? "Blizzard cascade" : type.replaceAll("_", " "),
    severity: severity === "LEVEL_3_LIFE_THREATENING" ? "CONDITION 1" : severity.replace("LEVEL_", "LEVEL "),
    description: String(row.description || standbyEmergency.description),
    active: !isResolved,
    lockdown: Boolean(row.lockdown_active) && !isResolved,
    timestamp: formatDateTime(row.created_at),
  };
}

export async function loadOperations(currentUser: OperatorIdentity): Promise<OperationsSnapshot> {
  await ensureDatabaseReady();
  const escalation = await supabaseAdmin.rpc("mark_overdue_field_sorties");
  if (escalation.error) throw new Error(`Overdue sortie escalation failed: ${escalation.error.message}`);
  const [stationResult, voyageResult, cargoResult, telemetryResult, inventoryResult, personnelResult, assetResult, eventResult, incidentResult, sortieResult, sortiePersonnelResult, requestResult, decisionResult] = await Promise.all([
    supabaseAdmin.from("polar_stations").select("*").order("station_code"),
    supabaseAdmin.from("expedition_voyages").select("*").order("created_at", { ascending: false }),
    supabaseAdmin.from("cargo_manifest").select("*").order("updated_at", { ascending: false }),
    supabaseAdmin.from("cargo_telemetry").select("*").order("recorded_at", { ascending: false }).limit(500),
    supabaseAdmin.from("inventory_items").select("*").order("sku_code"),
    supabaseAdmin.from("expedition_personnel").select("*").order("full_name"),
    supabaseAdmin.from("operational_assets").select("*").order("asset_code"),
    supabaseAdmin.from("operation_events").select("*").order("event_time", { ascending: false }),
    supabaseAdmin.from("emergency_incidents").select("*").order("created_at", { ascending: false }).limit(20),
    supabaseAdmin.from("field_sorties").select("*").order("departure_time", { ascending: false }),
    supabaseAdmin.from("field_sortie_personnel").select("*"),
    supabaseAdmin.from("operator_access_requests").select("*").order("submitted_at", { ascending: false }),
    supabaseAdmin.from("operator_access_decisions").select("*"),
  ]);
  const results = [stationResult, voyageResult, cargoResult, telemetryResult, inventoryResult, personnelResult, assetResult, eventResult, incidentResult, sortieResult, sortiePersonnelResult, requestResult, decisionResult];
  const failed = results.find(result => result.error);
  if (failed?.error) throw new Error(`Supabase read failed: ${failed.error.message}`);

  const stations = (stationResult.data || []).map(row => ({
    id: row.station_id,
    code: row.station_code,
    name: row.name,
    theatre: row.operating_theatre === "ARCTIC" ? "Arctic theatre" : row.name === "Maitri" ? "Queen Maud Land" : row.name === "Bharati" ? "Larsemann Hills" : "Antarctic theatre",
    occupancy: numberOr(row.current_occupancy),
    capacity: numberOr(row.max_winter_capacity || row.max_summer_capacity),
    weather: row.weather_summary || "Conditions unavailable",
    coordinates: row.coordinates?.coordinates ? `${row.coordinates.coordinates[1]}°, ${row.coordinates.coordinates[0]}°` : "Coordinates unavailable",
  }));
  const stationNamesById = new Map(stations.map(station => [station.id, station.name]));
  const voyageById = new Map((voyageResult.data || []).map(row => [row.voyage_id, row]));
  const voyages = (voyageResult.data || []).map(row => ({
    id: row.voyage_id,
    expedition: row.expedition_number,
    vessel: row.vessel_name,
    vesselImo: row.vessel_imo_number,
    polarClass: row.polar_class_rating,
    route: `${row.departure_port} → ${row.intermediate_port}`,
    status: statusFromVoyage(row.voyage_status),
    departure: formatDate(row.planned_departure_date),
    iceEntry: formatDate(row.estimated_ice_entry_date),
    delay: row.voyage_status === "DIVERTED" ? 1 : 0,
  }));
  const latestTelemetry = new Map<string, Record<string, unknown>>();
  for (const row of telemetryResult.data || []) if (!latestTelemetry.has(row.cargo_id)) latestTelemetry.set(row.cargo_id, row);
  const cargo = (cargoResult.data || []).map(row => {
    const telemetry = latestTelemetry.get(row.cargo_id);
    return {
      id: row.cargo_id,
      tracking: row.tracking_number,
      description: row.cargo_description,
      destination: stationNamesById.get(row.destination_station_id) || "Unassigned",
      origin: voyageById.get(row.voyage_id)?.departure_port || "India logistics hub",
      voyageId: row.voyage_id,
      type: String(row.cargo_type).replaceAll("_", " ").replace(/\b\w/g, character => character.toUpperCase()),
      weight: numberOr(row.weight_kg),
      temperature: numberOr(telemetry?.temperature_celsius),
      humidity: numberOr(telemetry?.relative_humidity),
      shock: numberOr(telemetry?.shock_g_force),
      status: cargoStatusFromDb(row.current_status, telemetry),
      coldChain: Boolean(row.is_cold_chain),
    };
  });
  const inventory = (inventoryResult.data || []).map(row => ({
    id: row.item_id,
    name: row.name,
    sku: row.sku_code,
    category: String(row.category).replaceAll("_", " "),
    ved: row.ved_category,
    quantity: numberOr(row.quantity_on_hand),
    unit: row.unit_of_measure,
    dailyBurn: numberOr(row.daily_burn_rate),
    threshold: numberOr(row.safety_stock_threshold),
    station: stationNamesById.get(row.station_id) || "Unassigned",
  }));
  const personnel = (personnelResult.data || []).map(row => ({
    id: row.personnel_id,
    name: row.full_name,
    role: String(row.role_category).replaceAll("_", " ").replace(/\b\w/g, character => character.toUpperCase()),
    station: stationNamesById.get(row.assigned_station_id) || "Unassigned",
    phase: row.deployment_phase === "WINTER_OVER" ? "Winter-over" : "Summer",
    medical: row.aiims_medical_class === "FAILED" ? "Failed" : `Class ${String(row.aiims_medical_class).replace("CLASS_", "")}`,
    training: row.itbp_survival_training_cleared ? "Current" : "Refresh due",
    blood: row.blood_group,
    status: row.current_safety_status === "FIELD_SORTIE" ? "FIELD" : row.current_safety_status === "MEDEVAC_IN_PROGRESS" || row.current_safety_status === "OFFLINE_UNACCOUNTED" ? "SOS" : "INDOOR",
    availableForSortie: row.current_safety_status === "INDOORS_STATION",
  }));
  const assets = (assetResult.data || []).map(row => ({
    id: String(row.asset_code),
    name: String(row.asset_name),
    category: String(row.asset_category),
    status: String(row.asset_status),
    location: String(row.location),
    nextMaintenance: String(row.next_maintenance),
    criticality: String(row.criticality),
  }));
  const events = (eventResult.data || []).map(row => ({
    id: String(row.event_id),
    time: formatDateTime(row.event_time),
    module: String(row.module),
    action: String(row.action),
    tone: row.tone,
    user: row.user_name ? String(row.user_name) : undefined,
    justification: row.justification ? String(row.justification) : undefined,
    actorRole: row.actor_role ? String(row.actor_role) : undefined,
  }));
  const personnelNames = new Map((personnelResult.data || []).map(row => [String(row.personnel_id), String(row.full_name)]));
  const assignedBySortie = new Map<string, Record<string, unknown>[]>();
  for (const assignment of sortiePersonnelResult.data || []) {
    const sortieId = String(assignment.sortie_id);
    const assignments = assignedBySortie.get(sortieId) || [];
    assignments.push(assignment);
    assignedBySortie.set(sortieId, assignments);
  }
  const fieldSorties = (sortieResult.data || []).map(row => ({
    id: String(row.sortie_id),
    stationId: row.station_id ? String(row.station_id) : undefined,
    station: stationNamesById.get(String(row.station_id)) || "Unassigned",
    destination: String(row.destination_name),
    leadPersonId: String(row.lead_personnel_id || ""),
    leadPerson: personnelNames.get(String(row.lead_personnel_id)) || "Unassigned",
    departureTime: String(row.departure_time),
    expectedReturnTime: String(row.expected_return_time),
    actualReturnTime: row.actual_return_time ? String(row.actual_return_time) : undefined,
    vehicle: row.vehicle_identifier ? String(row.vehicle_identifier) : undefined,
    commFrequency: String(row.comm_frequency_vhf),
    satPhoneCallsign: row.sat_phone_callsign ? String(row.sat_phone_callsign) : undefined,
    status: String(row.sortie_status),
    recalledAt: row.recalled_at ? String(row.recalled_at) : undefined,
    overdueEscalatedAt: row.overdue_escalated_at ? String(row.overdue_escalated_at) : undefined,
    assignedPersonnel: (assignedBySortie.get(String(row.sortie_id)) || []).map(assignment => ({
      id: String(assignment.personnel_id),
      name: personnelNames.get(String(assignment.personnel_id)) || "Unknown operator",
      status: String(assignment.assignment_status),
      beaconConfirmedAt: assignment.beacon_confirmed_at ? String(assignment.beacon_confirmed_at) : undefined,
      actualReturnTime: assignment.actual_return_time ? String(assignment.actual_return_time) : undefined,
    })),
  }));
  const decisionsByRequest = new Map((decisionResult.data || []).map(row => [String(row.request_id), row]));
  const operatorRequests = (requestResult.data || []).map(row => {
    const decision = decisionsByRequest.get(String(row.request_id));
    return {
      id: String(row.request_id),
      operator: String(row.operator_name),
      role: String(row.requested_role),
      station: String(row.station_name),
      stationCode: String(row.station_code),
      request: String(row.request_summary),
      submitted: formatDateTime(row.submitted_at),
      priority: String(row.priority),
      status: String(row.request_status),
      decisionActor: decision?.actor_name ? String(decision.actor_name) : undefined,
      decisionRole: decision?.actor_role ? String(decision.actor_role) : undefined,
      decisionJustification: decision?.justification ? String(decision.justification) : undefined,
      decidedAt: decision?.decided_at ? String(decision.decided_at) : undefined,
    };
  });
  const latestIncident = (incidentResult.data || []).find(row => !row.is_resolved);
  return {
    stations,
    voyages,
    cargo,
    inventory,
    personnel,
    assets,
    trackingUnits,
    events,
    emergency: latestIncident ? incidentToEmergency(latestIncident) : standbyEmergency,
    currentUser,
    operatorRequests,
    fieldSorties,
  };
}

function parseDateOnly(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date value: ${value}`);
  return parsed.toISOString().slice(0, 10);
}

export async function createVoyage(voyage: Record<string, unknown>) {
  await ensureDatabaseReady();
  const expedition = String(voyage.expedition || "").trim();
  const vessel = String(voyage.vessel || "").trim();
  const polarClass = String(voyage.polarClass || "").trim();
  const routeParts = String(voyage.route || "").split("→").map(part => part.trim());
  const departurePort = routeParts[0] || "";
  const destinationPort = routeParts.at(-1) || "";
  const departureDate = parseDateOnly(String(voyage.departure || ""));
  const iceEntryDate = parseDateOnly(String(voyage.iceEntry || ""));
  const status = String(voyage.status || "READY") as Status;
  const suppliedId = String(voyage.id || "");
  const voyageId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(suppliedId)
    ? suppliedId
    : randomUUID();
  const suppliedImo = String(voyage.vesselImo || "").trim();
  const vesselImo = suppliedImo || `PLX-${voyageId.replaceAll("-", "").slice(0, 12).toUpperCase()}`;

  if (!expedition || !vessel || !polarClass || !departurePort || !destinationPort) {
    throw new Error("Expedition, vessel, polar class, departure port, and destination are required.");
  }
  if (departureDate > iceEntryDate) {
    throw new Error("Estimated ice-entry date cannot be earlier than planned departure.");
  }
  if (!["READY", "UNDERWAY", "DELAYED"].includes(status)) {
    throw new Error("Choose a supported voyage status.");
  }
  if (vesselImo.length > 20) throw new Error("Vessel IMO / registry reference must be 20 characters or fewer.");

  const { data, error } = await supabaseAdmin.from("expedition_voyages").insert({
    voyage_id: voyageId,
    expedition_number: expedition,
    vessel_name: vessel,
    vessel_imo_number: vesselImo,
    polar_class_rating: polarClass,
    departure_port: departurePort,
    intermediate_port: destinationPort,
    planned_departure_date: departureDate,
    estimated_ice_entry_date: iceEntryDate,
    voyage_status: voyageStatusToDb(status),
  }).select("voyage_id").single();
  if (error) throw new Error(`Supabase voyage write failed: ${error.message}`);
  return { voyageId: String(data.voyage_id) };
}

export async function updateVoyageStatus(id: string, status: Status) {
  await ensureDatabaseReady();
  const { error } = await supabaseAdmin.from("expedition_voyages").update({ voyage_status: voyageStatusToDb(status) }).eq("voyage_id", id);
  if (error) throw new Error(`Supabase voyage update failed: ${error.message}`);
}

export async function adjustInventory(sku: string, delta: number) {
  await ensureDatabaseReady();
  const current = await supabaseAdmin.from("inventory_items").select("quantity_on_hand").eq("sku_code", sku).single();
  if (current.error) throw new Error(`Supabase inventory read failed: ${current.error.message}`);
  const { error } = await supabaseAdmin.from("inventory_items").update({
    quantity_on_hand: Math.max(0, numberOr(current.data.quantity_on_hand) + delta),
    last_reconciled_date: new Date().toISOString(),
  }).eq("sku_code", sku);
  if (error) throw new Error(`Supabase inventory write failed: ${error.message}`);
}

export async function updatePersonnelStatus(id: string, status: PersonStatus, identity: OperatorIdentity) {
  await ensureDatabaseReady();
  const result = await supabaseAdmin.rpc("set_personnel_safety_status", {
    p_personnel_id: id,
    p_status: status,
    p_actor_role: identity.role,
  });
  if (result.error) throw new Error(`Personnel safety-state update failed: ${result.error.message}`);
}

export async function updateAssetStatus(id: string, status: AssetStatus) {
  await ensureDatabaseReady();
  const { error } = await supabaseAdmin.from("operational_assets").update({
    asset_status: status,
    updated_at: new Date().toISOString(),
  }).eq("asset_code", id);
  if (error) throw new Error(`Supabase asset update failed: ${error.message}`);
}

export async function updateCargoTelemetry(cargo: Record<string, unknown>) {
  await ensureDatabaseReady();
  const id = String(cargo.id || "");
  if (!id) throw new Error("Cargo record is missing its database id.");
  const { error } = await supabaseAdmin.from("cargo_telemetry").insert({
    cargo_id: id,
    recorded_at: new Date().toISOString(),
    temperature_celsius: Number(cargo.temperature),
    relative_humidity: Number(cargo.humidity),
    shock_g_force: Number(cargo.shock),
    door_open_flag: false,
    is_breached: cargo.status === "CRITICAL",
    synced_from_edge: false,
  });
  if (error) throw new Error(`Supabase telemetry write failed: ${error.message}`);
}

export async function createEmergencyCascade(payload: Record<string, unknown>, cargoIds: string[], voyageIds: string[], identity: OperatorIdentity) {
  await ensureDatabaseReady();
  if (payload.incidentType === "BLIZZARD_COND_1") {
    const result = await supabaseAdmin.rpc("create_condition1_cascade", {
      p_station_id: payload.stationId || null,
      p_description: String(payload.description || "Condition 1 active"),
      p_cargo_ids: cargoIds,
      p_voyage_ids: voyageIds,
      p_actor_id: identity.userId,
      p_actor_name: identity.name,
      p_actor_role: identity.role,
    });
    if (result.error) throw new Error(`Condition 1 cascade failed: ${result.error.message}`);
    return { incident_id: result.data as string };
  }
  const now = new Date().toISOString();
  const inserted = await supabaseAdmin.from("emergency_incidents").insert({
    station_id: payload.stationId || null,
    incident_severity: payload.severity,
    incident_type: payload.incidentType,
    initiating_entity: "PolarLogix command console",
    description: payload.description,
    lockdown_active: payload.lockdown,
    action_log: [{ action: "Condition 1 cascade executed", at: now }],
  }).select("incident_id").single();
  if (inserted.error) throw new Error(`Supabase incident write failed: ${inserted.error.message}`);
  const writes = [
    ...cargoIds.map(cargoId => supabaseAdmin.from("cargo_manifest").update({ current_status: "AT_STATION_STORAGE", updated_at: now }).eq("cargo_id", cargoId)),
    ...voyageIds.map(voyageId => supabaseAdmin.from("expedition_voyages").update({ voyage_status: "DIVERTED" }).eq("voyage_id", voyageId)),
  ];
  const results = await Promise.all(writes);
  const failed = results.find(result => result.error);
  if (failed?.error) throw new Error(`Supabase cascade write failed: ${failed.error.message}`);
  return inserted.data;
}

export async function resolveEmergency(incidentId: string | null, identity: OperatorIdentity, justification: string) {
  await ensureDatabaseReady();
  const result = await supabaseAdmin.rpc("resolve_condition1", {
    p_incident_id: incidentId,
    p_actor_id: identity.userId,
    p_actor_name: identity.name,
    p_actor_role: identity.role,
    p_justification: justification,
  });
  if (result.error) throw new Error(`Condition 1 recovery failed: ${result.error.message}`);
  return result.data;
}

export async function dispatchFieldSortie(
  input: {
    id: string;
    stationId: string;
    destination: string;
    leadPersonId: string;
    expectedReturnTime: string;
    vehicle?: string;
    commFrequency: string;
    satPhoneCallsign?: string;
    personnelIds: string[];
  },
  identity: OperatorIdentity,
  idempotencyKey: string,
) {
  const result = await supabaseAdmin.rpc("dispatch_field_sortie", {
    p_sortie_id: input.id,
    p_station_id: input.stationId,
    p_destination_name: input.destination,
    p_lead_personnel_id: input.leadPersonId,
    p_expected_return_time: input.expectedReturnTime,
    p_vehicle_identifier: input.vehicle || null,
    p_comm_frequency_vhf: input.commFrequency,
    p_sat_phone_callsign: input.satPhoneCallsign || null,
    p_personnel_ids: input.personnelIds,
    p_actor_id: identity.userId,
    p_actor_name: identity.name,
    p_actor_role: identity.role,
    p_idempotency_key: idempotencyKey,
  });
  if (result.error) throw new Error(`Field-sortie dispatch failed: ${result.error.message}`);
  return result.data;
}

export async function transitionFieldSortie(
  sortieId: string,
  action: "BEACON" | "RETURN" | "CLOSE",
  personnelId: string | undefined,
  identity: OperatorIdentity,
) {
  const result = await supabaseAdmin.rpc("transition_field_sortie", {
    p_sortie_id: sortieId,
    p_action: action,
    p_personnel_id: personnelId || null,
    p_actor_id: identity.userId,
    p_actor_name: identity.name,
    p_actor_role: identity.role,
  });
  if (result.error) throw new Error(`Field-sortie update failed: ${result.error.message}`);
  return result.data;
}

export async function createEvent(event: { module: string; action: string; tone?: Tone; justification?: string }, identity: OperatorIdentity) {
  await ensureDatabaseReady();
  const { error } = await supabaseAdmin.from("operation_events").insert({
    module: event.module,
    action: event.action,
    tone: event.tone || "cyan",
    user_name: identity.name,
    justification: event.justification,
    actor_id: identity.userId,
    actor_role: identity.role,
  });
  if (error) throw new Error(`Supabase event write failed: ${error.message}`);
}

export async function decideOperatorAccessRequest(
  requestId: string,
  decision: string,
  justification: string,
  identity: OperatorIdentity,
  idempotencyKey: string,
) {
  const result = await supabaseAdmin.rpc("decide_operator_access_request", {
    p_request_id: requestId,
    p_decision: decision,
    p_actor_id: identity.userId,
    p_actor_name: identity.name,
    p_actor_role: identity.role,
    p_justification: justification,
    p_idempotency_key: idempotencyKey,
  });
  if (result.error) throw new Error(`Operator decision failed: ${result.error.message}`);
  return result.data;
}
