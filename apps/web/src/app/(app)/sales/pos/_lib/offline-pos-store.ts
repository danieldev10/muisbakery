import type {
  PosOfflineQueuedSale,
  PosOfflineSalePayload,
  PosOfflineSnapshot,
  PosSession,
  Sale,
} from "@/lib/operations/types";

const DB_NAME = "muisbakery-pos-offline";
const DB_VERSION = 1;
const SNAPSHOT_STORE = "snapshots";
const ACTIVE_SESSION_STORE = "activeSessions";
const QUEUED_SALE_STORE = "queuedSales";

type SnapshotRecord = {
  terminalId: string;
  snapshot: PosOfflineSnapshot;
  savedAt: string;
};

type ActiveSessionRecord = {
  terminalId: string;
  session: PosSession;
  savedAt: string;
};

function nowIso() {
  return new Date().toISOString();
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("IndexedDB request failed.")),
    );
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openOfflineDb() {
  if (typeof indexedDB === "undefined") {
    throw new Error("This browser does not support offline POS storage.");
  }

  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.addEventListener("upgradeneeded", () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: "terminalId" });
      }

      if (!db.objectStoreNames.contains(ACTIVE_SESSION_STORE)) {
        db.createObjectStore(ACTIVE_SESSION_STORE, { keyPath: "terminalId" });
      }

      if (!db.objectStoreNames.contains(QUEUED_SALE_STORE)) {
        const store = db.createObjectStore(QUEUED_SALE_STORE, {
          keyPath: "clientRequestId",
        });

        store.createIndex("terminalId", "terminalId", { unique: false });
        store.createIndex("status", "status", { unique: false });
      }
    });

    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("Unable to open offline POS storage.")),
    );
  });

  return dbPromise;
}

async function readStore<T>(
  storeName: string,
  callback: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await openOfflineDb();
  const transaction = db.transaction(storeName, "readonly");
  const result = await requestToPromise(callback(transaction.objectStore(storeName)));

  await new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("error", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed.")),
    );
  });

  return result;
}

async function writeStore<T>(
  storeName: string,
  callback: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await openOfflineDb();
  const transaction = db.transaction(storeName, "readwrite");
  const result = await requestToPromise(callback(transaction.objectStore(storeName)));

  await new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("error", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed.")),
    );
  });

  return result;
}

export async function saveOfflineSnapshot(snapshot: PosOfflineSnapshot) {
  const record: SnapshotRecord = {
    terminalId: snapshot.terminal.id,
    snapshot,
    savedAt: nowIso(),
  };

  await writeStore(SNAPSHOT_STORE, (store) => store.put(record));
}

export async function loadOfflineSnapshot(terminalId: string) {
  const record = await readStore<SnapshotRecord | undefined>(
    SNAPSHOT_STORE,
    (store) => store.get(terminalId),
  );

  return record?.snapshot ?? null;
}

export async function saveActiveOfflineSession(
  terminalId: string,
  session: PosSession,
) {
  const record: ActiveSessionRecord = {
    terminalId,
    session,
    savedAt: nowIso(),
  };

  await writeStore(ACTIVE_SESSION_STORE, (store) => store.put(record));
}

export async function loadActiveOfflineSession(terminalId: string) {
  const record = await readStore<ActiveSessionRecord | undefined>(
    ACTIVE_SESSION_STORE,
    (store) => store.get(terminalId),
  );

  return record?.session ?? null;
}

export async function clearActiveOfflineSession(terminalId: string) {
  await writeStore(ACTIVE_SESSION_STORE, (store) => store.delete(terminalId));
}

export async function addQueuedOfflineSale(
  payload: PosOfflineSalePayload,
): Promise<PosOfflineQueuedSale> {
  const createdAt = nowIso();
  const record: PosOfflineQueuedSale = {
    clientRequestId: payload.clientRequestId,
    terminalId: payload.terminalId,
    status: "PENDING",
    payload,
    createdAt,
    updatedAt: createdAt,
    errorMessage: null,
    syncedSale: null,
  };

  await writeStore(QUEUED_SALE_STORE, (store) => store.put(record));

  return record;
}

export async function listQueuedOfflineSales(terminalId: string) {
  const records = await readStore<PosOfflineQueuedSale[]>(
    QUEUED_SALE_STORE,
    (store) => store.getAll(),
  );

  return records
    .filter((record) => record.terminalId === terminalId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function updateQueuedOfflineSale(
  clientRequestId: string,
  patch: Partial<Pick<PosOfflineQueuedSale, "status" | "errorMessage">> & {
    syncedSale?: Sale | null;
  },
) {
  const current = await readStore<PosOfflineQueuedSale | undefined>(
    QUEUED_SALE_STORE,
    (store) => store.get(clientRequestId),
  );

  if (!current) {
    return null;
  }

  const next: PosOfflineQueuedSale = {
    ...current,
    ...patch,
    syncedSale:
      patch.syncedSale === undefined ? current.syncedSale : patch.syncedSale,
    updatedAt: nowIso(),
  };

  await writeStore(QUEUED_SALE_STORE, (store) => store.put(next));

  return next;
}

export async function unresolvedOfflineSales(terminalId: string) {
  const records = await listQueuedOfflineSales(terminalId);

  return records.filter(
    (record) =>
      record.status === "PENDING" ||
      record.status === "SYNCING" ||
      record.status === "FAILED" ||
      record.status === "CONFLICT",
  );
}
