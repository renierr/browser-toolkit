import { SyncManager } from '@js/sync.ts';
import type { DrawingRecord } from './types.ts';

const DB_NAME = 'bt-sketch-board-db';
const DB_VERSION = 2;
const STORE_NAME = 'drawings';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      SyncManager.ensureSyncMetadataStore(db);
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllDrawings(): Promise<DrawingRecord[]> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();

    req.onsuccess = () => {
      const rows = (req.result as DrawingRecord[]) || [];
      rows.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(rows);
    };

    req.onerror = () => reject(req.error);
  });
}

export async function putDrawing(record: DrawingRecord): Promise<void> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function deleteDrawing(id: string): Promise<void> {
  const db = await openDb();

  // Track deletion for sync
  await SyncManager.trackDeletion(db, 'sketch-board', id);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function syncGallery(manual = false) {
  const db = await openDb();
  return await SyncManager.sync<DrawingRecord>(db, STORE_NAME, 'sketch-board', 'id', { manual });
}
