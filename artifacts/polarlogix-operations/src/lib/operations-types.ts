export type Tone = 'cyan' | 'amber' | 'red' | 'slate' | 'green';
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
};

export type OperationsSnapshot = {
  stations: Station[];
  voyages: Voyage[];
  cargo: CargoItem[];
  inventory: InventoryItem[];
  personnel: Person[];
  emergency: Emergency;
};

export type EmergencyPayload = {
  stationId?: string;
  severity: 'LEVEL_1_ROUTINE' | 'LEVEL_2_URGENT' | 'LEVEL_3_LIFE_THREATENING';
  incidentType: 'BLIZZARD_COND_1' | 'CREVASSE_FALL' | 'COLD_EXPOSURE' | 'FIRE_OUTBREAK' | 'GENERATOR_LOSS' | 'MEDICAL_SURGICAL';
  description: string;
  lockdown: boolean;
};

export type QueueOperation =
  | { id: string; kind: 'voyage-create'; payload: Voyage }
  | { id: string; kind: 'inventory-adjust'; payload: { sku: string; delta: number } }
  | { id: string; kind: 'personnel-status'; payload: { id: string; status: Person['status'] } }
  | { id: string; kind: 'cargo-anomaly'; payload: { cargo: CargoItem } }
  | { id: string; kind: 'emergency-cascade'; payload: { emergency: EmergencyPayload; cargoIds: string[]; voyageIds: string[] } }
  | { id: string; kind: 'emergency-resolve'; payload: { incidentId?: string } };