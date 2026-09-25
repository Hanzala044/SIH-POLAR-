export type QueuedCommand = {
  id: string;
  scopeId: string;
  idempotencyKey: string;
  endpoint: string;
  method: "POST" | "PATCH" | "PUT" | "DELETE";
  payload: unknown;
  createdAt: string;
  status: "PENDING" | "CONFLICT";
  conflict?: string;
};

const databaseName = "polarlogix-command-queue";
const storeName = "commands";
const subscribers = new Map<string, Set<() => void>>();
let databasePromise: Promise<IDBDatabase> | undefined;
let broadcastChannel: BroadcastChannel | undefined;

function getDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is unavailable; offline commands cannot be stored safely."));
  }
  databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        const store = database.createObjectStore(storeName, { keyPath: "id" });
        store.createIndex("scopeId", "scopeId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open the offline command queue."));
    request.onblocked = () => reject(new Error("The offline command queue is blocked by another browser tab."));
  }).catch(error => {
    databasePromise = undefined;
    throw error;
  });
  return databasePromise!;
}

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function publish(scopeId: string) {
  subscribers.get(scopeId)?.forEach(listener => listener());
  if (typeof BroadcastChannel !== "undefined") {
    broadcastChannel ??= new BroadcastChannel(databaseName);
    broadcastChannel.postMessage({ scopeId });
  }
}

if (typeof BroadcastChannel !== "undefined") {
  broadcastChannel = new BroadcastChannel(databaseName);
  broadcastChannel.addEventListener("message", event => {
    const scopeId = event.data?.scopeId;
    if (typeof scopeId === "string") subscribers.get(scopeId)?.forEach(listener => listener());
  });
}

export function subscribeCommandQueue(scopeId: string, listener: () => void) {
  const listeners = subscribers.get(scopeId) || new Set<() => void>();
  listeners.add(listener);
  subscribers.set(scopeId, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) subscribers.delete(scopeId);
  };
}

export async function listQueuedCommands(scopeId: string): Promise<QueuedCommand[]> {
  const database = await getDatabase();
  const transaction = database.transaction(storeName, "readonly");
  const request = transaction.objectStore(storeName).index("scopeId").getAll(scopeId) as IDBRequest<QueuedCommand[]>;
  const result = await new Promise<QueuedCommand[]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error("Could not read queued commands."));
  });
  return result.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

export async function enqueueCommand(input: Omit<QueuedCommand, "id" | "createdAt" | "status" | "conflict">) {
  const database = await getDatabase();
  const command: QueuedCommand = {
    ...input,
    id: newId(),
    createdAt: new Date().toISOString(),
    status: "PENDING",
  };
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).add(command);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Could not persist the offline command."));
    transaction.onabort = () => reject(transaction.error || new Error("Offline command persistence was aborted."));
  });
  publish(command.scopeId);
  return command;
}

export async function removeQueuedCommand(command: QueuedCommand) {
  const database = await getDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).delete(command.id);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Could not acknowledge the queued command."));
    transaction.onabort = () => reject(transaction.error || new Error("Queue acknowledgement was aborted."));
  });
  publish(command.scopeId);
}

export async function markCommandConflict(command: QueuedCommand, conflict: string) {
  const database = await getDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put({ ...command, status: "CONFLICT", conflict });
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Could not record the command conflict."));
    transaction.onabort = () => reject(transaction.error || new Error("Conflict recording was aborted."));
  });
  publish(command.scopeId);
}

export async function retryBlockedCommands(scopeId: string) {
  const commands = await listQueuedCommands(scopeId);
  const blocked = commands.filter(command => command.status === "CONFLICT");
  if (!blocked.length) return;
  const database = await getDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  blocked.forEach(command => store.put({ ...command, status: "PENDING", conflict: undefined }));
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Could not reset blocked commands."));
    transaction.onabort = () => reject(transaction.error || new Error("Resetting blocked commands was aborted."));
  });
  publish(scopeId);
}