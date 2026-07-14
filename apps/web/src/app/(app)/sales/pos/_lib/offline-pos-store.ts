import type {
  PosOfflineQueuedSale,
  PosOfflineSalePayload,
  PosOfflineSnapshot,
  PosSession,
  Sale,
} from "@/lib/operations/types";
import { validateOfflineRetailerCreditSale } from "./offline-retailer-credit";

const DB_NAME = "muisbakery-pos-offline";
const DB_VERSION = 2;
const SNAPSHOT_STORE = "snapshots";
const ACTIVE_SESSION_STORE = "activeSessions";
const QUEUED_SALE_STORE = "queuedSales";
const APPROVAL_RESERVATION_STORE = "approvalReservations";

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

type ApprovalReservationRecord = {
  approvalId: string;
  terminalId: string;
  retailerId: string;
  clientRequestId: string;
  amount: number;
  createdAt: string;
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

function transactionToPromise(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted.")),
    );
    transaction.addEventListener("error", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed.")),
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

      if (!db.objectStoreNames.contains(APPROVAL_RESERVATION_STORE)) {
        const store = db.createObjectStore(APPROVAL_RESERVATION_STORE, {
          keyPath: "approvalId",
        });

        store.createIndex("terminalId", "terminalId", { unique: false });
        store.createIndex("clientRequestId", "clientRequestId", {
          unique: true,
        });
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

  const db = await openOfflineDb();
  const transaction = db.transaction(
    [SNAPSHOT_STORE, QUEUED_SALE_STORE, APPROVAL_RESERVATION_STORE],
    "readwrite",
  );
  const completion = transactionToPromise(transaction);
  const snapshotStore = transaction.objectStore(SNAPSHOT_STORE);
  const queuedSaleStore = transaction.objectStore(QUEUED_SALE_STORE);
  const approvalStore = transaction.objectStore(APPROVAL_RESERVATION_STORE);

  try {
    const [snapshotRecord, queuedSales, approvalReservations] =
      await Promise.all([
        requestToPromise<SnapshotRecord | undefined>(
          snapshotStore.get(payload.terminalId),
        ),
        requestToPromise<PosOfflineQueuedSale[]>(queuedSaleStore.getAll()),
        requestToPromise<ApprovalReservationRecord[]>(approvalStore.getAll()),
      ]);

    if (!snapshotRecord) {
      throw new Error(
        "This terminal has no offline snapshot. Connect once before checking out offline.",
      );
    }

    const reservation = validateOfflineRetailerCreditSale({
      snapshot: snapshotRecord.snapshot,
      payload,
      queuedSales,
      reservedApprovalIds: new Set(
        approvalReservations.map((entry) => entry.approvalId),
      ),
    });

    await requestToPromise(queuedSaleStore.add(record));

    if (reservation?.approvalId) {
      await requestToPromise(
        approvalStore.add({
          approvalId: reservation.approvalId,
          terminalId: reservation.terminalId,
          retailerId: reservation.retailerId,
          clientRequestId: payload.clientRequestId,
          amount: reservation.amount,
          createdAt,
        } satisfies ApprovalReservationRecord),
      );
    }

    await completion;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // The browser may already have aborted the failed transaction.
    }
    await completion.catch(() => undefined);
    throw error;
  }

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
  const db = await openOfflineDb();
  const transaction = db.transaction(
    [QUEUED_SALE_STORE, APPROVAL_RESERVATION_STORE],
    "readwrite",
  );
  const completion = transactionToPromise(transaction);
  const queuedSaleStore = transaction.objectStore(QUEUED_SALE_STORE);
  const approvalStore = transaction.objectStore(APPROVAL_RESERVATION_STORE);
  const current = await requestToPromise<PosOfflineQueuedSale | undefined>(
    queuedSaleStore.get(clientRequestId),
  );

  if (!current) {
    transaction.abort();
    await completion.catch(() => undefined);
    return null;
  }

  const next: PosOfflineQueuedSale = {
    ...current,
    ...patch,
    syncedSale:
      patch.syncedSale === undefined ? current.syncedSale : patch.syncedSale,
    updatedAt: nowIso(),
  };

  await requestToPromise(queuedSaleStore.put(next));

  if (
    (next.status === "SYNCED" || next.status === "DUPLICATE") &&
    current.payload.retailerApprovalId
  ) {
    await requestToPromise(
      approvalStore.delete(current.payload.retailerApprovalId),
    );
  }

  await completion;

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
