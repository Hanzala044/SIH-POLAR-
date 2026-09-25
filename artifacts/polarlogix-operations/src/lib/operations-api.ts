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
import {
  enqueueCommand,
  listQueuedCommands,
  markCommandConflict,
  removeQueuedCommand,
  retryBlockedCommands,
  type QueuedCommand,
} from "./offline-command-queue";

export type MutationResult = { ok: true; queued?: true; idempotencyKey?: string };

let queueScopeId: string | null = null;

function createIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function setCommandQueueScope(scopeId: string | null) {
  queueScopeId = scopeId;
}

async function queueMutation(endpoint: string, method: QueuedCommand["method"], payload: unknown, idempotencyKey: string) {
  if (!queueScopeId) {
    throw new Error("Cannot queue an operation without an authenticated operator session.");
  }
  await enqueueCommand({
    scopeId: queueScopeId,
    idempotencyKey,
    endpoint,
    method,
    payload,
  });
  return { ok: true, queued: true, idempotencyKey } satisfies MutationResult;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  const isMutation = method !== "GET" && method !== "HEAD";
  const idempotencyKey = isMutation ? createIdempotencyKey() : undefined;
  const endpoint = `/api${path}`;
  let payload: unknown;
  if (init?.body && typeof init.body === "string") {
    try {
      payload = JSON.parse(init.body);
    } catch {
      payload = init.body;
    }
  }
  const headers = {
    "Content-Type": "application/json",
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    ...(init?.headers || {}),
  };
  if (isMutation && typeof navigator !== "undefined" && !navigator.onLine) {
    return await queueMutation(endpoint, method as QueuedCommand["method"], payload, idempotencyKey!) as T;
  }
  let response: Response;
  try {
    response = await fetch(endpoint, {
      ...init,
      method,
      credentials: "include",
      headers,
    });
  } catch (error) {
    if (isMutation && (typeof navigator === "undefined" || !navigator.onLine || error instanceof TypeError)) {
      return await queueMutation(endpoint, method as QueuedCommand["method"], payload, idempotencyKey!) as T;
    }
    throw error;
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(body.error || body.message || `API request failed (${response.status})`));
  }
  return body as T;
}

export async function checkOperationsHealth() {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  try {
    const response = await fetch("/api/healthz", { credentials: "include", cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

export async function replayQueuedCommands(scopeId: string, retryBlocked = false) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { replayed: 0, conflict: null as QueuedCommand | null };
  if (retryBlocked) await retryBlockedCommands(scopeId);
  const commands = await listQueuedCommands(scopeId);
  let replayed = 0;
  for (const command of commands) {
    if (command.status === "CONFLICT") return { replayed, conflict: command };
    let response: Response;
    try {
      response = await fetch(command.endpoint, {
        method: command.method,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": command.idempotencyKey,
        },
        body: JSON.stringify(command.payload),
      });
    } catch {
      return { replayed, conflict: null };
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = String(body.error || body.message || `API request failed (${response.status})`);
      await markCommandConflict(command, `${response.status} ${reason}`);
      return { replayed, conflict: { ...command, status: "CONFLICT" as const, conflict: `${response.status} ${reason}` } };
    }
    await removeQueuedCommand(command);
    replayed += 1;
  }
  return { replayed, conflict: null as QueuedCommand | null };
}

export function loadOperations() {
  return request<OperationsSnapshot>("/operations");
}

export function createVoyage(voyage: Voyage) {
  return request<MutationResult & { voyageId: string }>("/operations/voyages", {
    method: "POST",
    body: JSON.stringify(voyage),
  });
}

export function updateVoyageStatus(id: string, status: Status) {
  return request<MutationResult>(`/operations/voyages/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function adjustInventory(sku: string, delta: number) {
  return request<MutationResult>("/operations/inventory/adjust", {
    method: "POST",
    body: JSON.stringify({ sku, delta }),
  });
}

export function updatePersonnelStatus(id: string, status: Person["status"]) {
  return request<MutationResult>(`/operations/personnel/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function updateAssetStatus(id: string, status: AssetStatus) {
  return request<MutationResult>(`/operations/assets/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function updateCargoTelemetry(cargo: CargoItem) {
  return request<MutationResult>("/operations/cargo/anomaly", {
    method: "POST",
    body: JSON.stringify({ cargo }),
  });
}

export function createEmergencyCascade(payload: EmergencyPayload, cargoIds: string[], voyageIds: string[]) {
  return request<MutationResult & { incidentId?: string }>("/operations/emergency/cascade", {
    method: "POST",
    body: JSON.stringify({ emergency: payload, cargoIds, voyageIds }),
  });
}

export function resolveEmergency(incidentId: string | undefined, justification: string) {
  return request<MutationResult>("/operations/emergency/resolve", {
    method: "POST",
    body: JSON.stringify({ incidentId, justification }),
  });
}

export function createEvent(event: { module: string; action: string; tone?: Tone; user?: string; justification?: string }) {
  return request<MutationResult>("/operations/events", {
    method: "POST",
    body: JSON.stringify(event),
  });
}

export function decideOperatorRequest(id: string, decision: "APPROVED" | "REJECTED", justification: string) {
  return request<MutationResult & { decision?: unknown }>(`/operations/approvals/${encodeURIComponent(id)}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision, justification }),
  });
}

export function dispatchFieldSortie(payload: {
  id: string;
  stationId: string;
  destination: string;
  leadPersonId: string;
  expectedReturnTime: string;
  vehicle?: string;
  commFrequency: string;
  satPhoneCallsign?: string;
  personnelIds: string[];
}) {
  return request<MutationResult & { sortie?: { sortieId: string; status: string; departureTime: string } }>("/operations/sorties", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function recordSortieBeacon(sortieId: string, personnelId: string) {
  return request<MutationResult>(`/operations/sorties/${encodeURIComponent(sortieId)}/beacon`, {
    method: "POST",
    body: JSON.stringify({ personnelId }),
  });
}

export function returnSortiePerson(sortieId: string, personnelId: string) {
  return request<MutationResult>(`/operations/sorties/${encodeURIComponent(sortieId)}/return`, {
    method: "POST",
    body: JSON.stringify({ personnelId }),
  });
}

export function closeFieldSortie(sortieId: string) {
  return request<MutationResult>(`/operations/sorties/${encodeURIComponent(sortieId)}/close`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}
