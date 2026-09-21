import type {
  AssetStatus,
  CargoItem,
  EmergencyPayload,
  OperationsSnapshot,
  Person,
  Status,
  Tone,
  Voyage,
} from "./operations-types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(body.error || body.message || `API request failed (${response.status})`));
  }
  return body as T;
}

export function loadOperations() {
  return request<OperationsSnapshot>("/operations");
}

export function createVoyage(voyage: Voyage) {
  return request<{ ok: true }>("/operations/voyages", {
    method: "POST",
    body: JSON.stringify(voyage),
  });
}

export function updateVoyageStatus(id: string, status: Status) {
  return request<{ ok: true }>(`/operations/voyages/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function adjustInventory(sku: string, delta: number) {
  return request<{ ok: true }>("/operations/inventory/adjust", {
    method: "POST",
    body: JSON.stringify({ sku, delta }),
  });
}

export function updatePersonnelStatus(id: string, status: Person["status"]) {
  return request<{ ok: true }>(`/operations/personnel/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function updateAssetStatus(id: string, status: AssetStatus) {
  return request<{ ok: true }>(`/operations/assets/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function updateCargoTelemetry(cargo: CargoItem) {
  return request<{ ok: true }>("/operations/cargo/anomaly", {
    method: "POST",
    body: JSON.stringify({ cargo }),
  });
}

export function createEmergencyCascade(payload: EmergencyPayload, cargoIds: string[], voyageIds: string[]) {
  return request<{ ok: true; incidentId?: string }>("/operations/emergency/cascade", {
    method: "POST",
    body: JSON.stringify({ emergency: payload, cargoIds, voyageIds }),
  });
}

export function resolveEmergency(incidentId?: string) {
  return request<{ ok: true }>("/operations/emergency/resolve", {
    method: "POST",
    body: JSON.stringify({ incidentId }),
  });
}

export function createEvent(event: { module: string; action: string; tone?: Tone; user?: string; justification?: string }) {
  return request<{ ok: true }>("/operations/events", {
    method: "POST",
    body: JSON.stringify(event),
  });
}
