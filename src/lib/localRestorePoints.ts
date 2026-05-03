/**
 * Local-only named restore points (full-app JSON payload) in IndexedDB.
 * Ring buffer: oldest entries removed when exceeding MAX_RESTORE_POINTS.
 */

import { v4 as uuidv4 } from 'uuid';

const DB_NAME = 'trackit_restore_points_v1';
const DB_VERSION = 1;
const STORE = 'restore_points';

export const MAX_RESTORE_POINTS = 8;

export interface RestorePointListEntry {
  id: string;
  name: string;
  createdAt: string;
  sizeBytes: number;
}

interface RestorePointRecord {
  id: string;
  name: string;
  createdAt: string;
  payloadJson: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

export async function listRestorePoints(): Promise<RestorePointListEntry[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const getAll = store.getAll();
    getAll.onerror = () => reject(getAll.error);
    getAll.onsuccess = () => {
      const rows = (getAll.result as RestorePointRecord[]) || [];
      const mapped = rows
        .map((r) => ({
          id: r.id,
          name: r.name,
          createdAt: r.createdAt,
          sizeBytes: typeof r.payloadJson === 'string' ? new Blob([r.payloadJson]).size : 0,
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      resolve(mapped);
    };
    tx.oncomplete = () => db.close();
  });
}

export async function addRestorePoint(name: string, payloadJson: string): Promise<{ id: string }> {
  const db = await openDb();
  const id = uuidv4();
  const createdAt = new Date().toISOString();
  const record: RestorePointRecord = {
    id,
    name: name.trim() || 'Restore point',
    createdAt,
    payloadJson,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const getAll = store.getAll();
    getAll.onerror = () => reject(getAll.error);
    getAll.onsuccess = () => {
      const rows = [...((getAll.result as RestorePointRecord[]) || [])].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt)
      );
      while (rows.length >= MAX_RESTORE_POINTS) {
        const oldest = rows.shift();
        if (oldest) {
          store.delete(oldest.id);
        }
      }
      const putReq = store.put(record);
      putReq.onerror = () => reject(putReq.error ?? new Error('IndexedDB put failed'));
    };
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.oncomplete = () => {
      db.close();
      resolve({ id });
    };
  });
}

export async function getRestorePointPayloadJson(id: string): Promise<string | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const row = req.result as RestorePointRecord | undefined;
      resolve(row?.payloadJson ?? null);
    };
    tx.oncomplete = () => db.close();
  });
}

export async function deleteRestorePoint(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.delete(id);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {};
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
  });
}
