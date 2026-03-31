import { hashUint8Array } from '../utils';

const DB_NAME = 'chiptune-archive';
const DB_VERSION = 1;
const STORE_NAME = 'modules';

export interface ArchivedModule {
  id: string;
  fileName: string;
  fileData: Blob;
  format: string;
  title: string;
  channels: number;
  archivedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('archivedAt', 'archivedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllModules(): Promise<ArchivedModule[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const modules = req.result as ArchivedModule[];
      modules.sort((a, b) => b.archivedAt - a.archivedAt);
      resolve(modules);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getModuleById(id: string): Promise<ArchivedModule | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveModule(
  file: File,
  format: string,
  title: string,
  channels: number
): Promise<{ success: boolean; id?: string; exists?: boolean }> {
  try {
    const buffer = await file.arrayBuffer();
    const data = new Uint8Array(buffer);
    const id = await hashUint8Array(data);

    const existing = await getModuleById(id);
    if (existing) {
      return { success: false, id, exists: true };
    }

    const archivedModule: ArchivedModule = {
      id,
      fileName: file.name,
      fileData: new Blob([data], { type: file.type || 'application/octet-stream' }),
      format,
      title,
      channels,
      archivedAt: Date.now(),
    };

    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.add(archivedModule);
      req.onsuccess = () => resolve({ success: true, id });
      req.onerror = () => reject(req.error);
    });
  } catch (error) {
    console.error('[ChiptuneArchive] Save failed:', error);
    return { success: false };
  }
}

export async function deleteModule(id: string): Promise<boolean> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } catch (error) {
    console.error('[ChiptuneArchive] Delete failed:', error);
    return false;
  }
}
