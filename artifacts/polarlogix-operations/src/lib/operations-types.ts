export type Tone = 'cyan' | 'amber' | 'red' | 'slate' | 'green';
export type OperationsRole = 'COMMAND' | 'LOGISTICS' | 'SAFETY' | 'VIEWER';
export type OperationPermission =
  | 'voyage:write'
  | 'inventory:write'
  | 'personnel:write'
  | 'asset:write'
  | 'cargo:write'
  | 'emergency:write'
  | 'sortie:write'
  | 'approval:decide'
  | 'event:write'
  | 'operations:initialize';
export type AssetStatus = 'READY' | 'IN USE' | 'MAINTENANCE DUE' | 'GROUNDED' | 'OFFLINE';
export type ScenarioKind = 'weather-degradation' | 'vessel-delay' | 'cargo-failure';
export type Status =
  | 'ON STATION'
  | 'UNDERWAY'
  | 'DELAYED'
  | 'READY'
  | 'HOLD'
  | 'NORMAL'
  | 'CRITICAL'
  | 'RECALLED'
  | 'SOS'
  | 'INDOOR';

export type Station = {
  id?: string;
  code: string;
  name: string;
  theatre: string;
  occupancy: number;
  capacity: number;
  weather: string;
  coordinates: string;
};

export type Voyage = {
  id: string;
  expedition: string;
  vessel: string;
  vesselImo?: string;
  polarClass: string;
  route: string;
  status: Status;
  departure: string;
  iceEntry: string;
  delay: number;
};

export type CargoItem = {
  id?: string;
  tracking: string;
  description: string;
  destination: string;
  origin?: string;
  voyageId?: string;
  type: string;
  weight: number;
  temperature: number;
  humidity: number;
  shock: number;
  status: Status;
  coldChain: boolean;
};

export type InventoryItem = {
  id?: string;
  name: string;
  sku: string;
  category: string;
  ved: 'V' | 'E' | 'D';
  quantity: number;
  unit: string;
  dailyBurn: number;
  threshold: number;
  station: string;
};

export type Person = {
  id: string;
  name: string;
  role: string;
  station: string;
  phase: string;
  medical: string;
  training: string;
  blood: string;
  status: 'INDOOR' | 'FIELD' | 'SOS';
  availableForSortie?: boolean;
};

export type Asset = {
  id: string;
  name: string;
  category: 'VEHICLE' | 'GENERATOR' | 'SCIENCE INSTRUMENT' | 'CONTAINER';
  status: AssetStatus;
  location: string;
  nextMaintenance: string;
  criticality: 'V' | 'E' | 'D';
};

export type TrackingUnitKind = 'VESSEL' | 'TUG BOAT' | 'HELICOPTER' | 'UAV';

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

export type Emergency = {
  incidentId?: string;
  stationId?: string;
  type: string;
  severity: string;
  description: string;
  active: boolean;
  lockdown: boolean;
  timestamp: string;
};

export type Event = {
  id: string;
  time: string;
  module: string;
  action: string;
  tone: Tone;
  user?: string;
  justification?: string;
  actorRole?: OperationsRole;
};

export type OperatorRequest = {
  id: string;
  operator: string;
  role: string;
  station: string;
  stationCode: string;
  request: string;
  submitted: string;
  priority: 'ROUTINE' | 'URGENT';
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decisionActor?: string;
  decisionRole?: OperationsRole;
  decisionJustification?: string;
  decidedAt?: string;
};

export type FieldSortieStatus = 'ACTIVE' | 'OVERDUE' | 'SOS_TRIGGERED' | 'RECALLED' | 'COMPLETED';

export type FieldSortie = {
  id: string;
  stationId?: string;
  station: string;
  destination: string;
  leadPersonId: string;
  leadPerson: string;
  departureTime: string;
  expectedReturnTime: string;
  actualReturnTime?: string;
  vehicle?: string;
  commFrequency: string;
  satPhoneCallsign?: string;
  status: FieldSortieStatus;
  recalledAt?: string;
  overdueEscalatedAt?: string;
  assignedPersonnel: Array<{
    id: string;
    name: string;
    status: 'FIELD' | 'SOS' | 'RETURNED' | 'RECALLED';
    beaconConfirmedAt?: string;
    actualReturnTime?: string;
  }>;
};

export type OperationsSnapshot = {
  stations: Station[];
  voyages: Voyage[];
  cargo: CargoItem[];
  inventory: InventoryItem[];
  personnel: Person[];
  assets: Asset[];
  trackingUnits: TrackingUnit[];
  events: Event[];
  emergency: Emergency;
  currentUser: { id: string; name: string; role: OperationsRole };
  operatorRequests: OperatorRequest[];
  fieldSorties: FieldSortie[];
};

export type EmergencyPayload = {
  stationId?: string;
  severity: 'LEVEL_1_ROUTINE' | 'LEVEL_2_URGENT' | 'LEVEL_3_LIFE_THREATENING';
  incidentType: 'BLIZZARD_COND_1' | 'CREVASSE_FALL' | 'COLD_EXPOSURE' | 'FIRE_OUTBREAK' | 'GENERATOR_LOSS' | 'MEDICAL_SURGICAL';
  description: string;
  lockdown: boolean;
};
