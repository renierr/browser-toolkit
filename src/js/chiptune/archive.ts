import { hashUint8Array } from '../utils';
import { SyncManager } from '@js/sync.ts';

const DB_NAME = 'chiptune-archive';
const DB_VERSION = 2;
export const STORE_NAME = 'modules';

function uint8ArrayToBase64(data: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export interface ArchivedModule {
  id: string;
  fileName: string;
  fileDataBase64: string;
  fileMimeType: string;
  format: string;
  title: string;
  channels: number;
  archivedAt: number;
  updatedAt: number;
}

type ArchivedModuleRaw = Partial<ArchivedModule> & {
  id: string;
  fileName: string;
  format: string;
  title: string;
  channels: number;
  archivedAt?: number;
  updatedAt?: number;
  fileData?: Blob;
};

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('archivedAt', 'archivedAt', { unique: false });
      }
      SyncManager.ensureSyncMetadataStore(db);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function getModuleBlob(module: ArchivedModule): Blob {
  const bytes = base64ToUint8Array(module.fileDataBase64);
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  return new Blob([arrayBuffer], { type: module.fileMimeType || 'application/octet-stream' });
}

async function putModule(db: IDBDatabase, module: ArchivedModule): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(module);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function normalizeModuleRecord(
  db: IDBDatabase,
  module: ArchivedModuleRaw
): Promise<ArchivedModule | null> {
  if (!module.id || !module.fileName || !module.format || !module.title) {
    return null;
  }

  if (module.fileDataBase64) {
    return {
      id: module.id,
      fileName: module.fileName,
      fileDataBase64: module.fileDataBase64,
      fileMimeType: module.fileMimeType || 'application/octet-stream',
      format: module.format,
      title: module.title,
      channels: module.channels,
      archivedAt: module.archivedAt || Date.now(),
      updatedAt: module.updatedAt || module.archivedAt || Date.now(),
    };
  }

  if (module.fileData instanceof Blob) {
    const data = new Uint8Array(await module.fileData.arrayBuffer());
    const migrated: ArchivedModule = {
      id: module.id,
      fileName: module.fileName,
      fileDataBase64: uint8ArrayToBase64(data),
      fileMimeType: module.fileData.type || 'application/octet-stream',
      format: module.format,
      title: module.title,
      channels: module.channels,
      archivedAt: module.archivedAt || Date.now(),
      updatedAt: module.updatedAt || module.archivedAt || Date.now(),
    };
    await putModule(db, migrated);
    return migrated;
  }

  return null;
}

export async function getAllModules(): Promise<ArchivedModule[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      void (async () => {
        const rawModules = req.result as ArchivedModuleRaw[];
        const normalized = await Promise.all(
          rawModules.map((module) => normalizeModuleRecord(db, module))
        );
        const modules = normalized.filter((module): module is ArchivedModule => module !== null);
        modules.sort((a, b) => b.archivedAt - a.archivedAt);
        resolve(modules);
      })().catch(reject);
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
    req.onsuccess = () => {
      void (async () => {
        const module = req.result as ArchivedModuleRaw | undefined;
        if (!module) {
          resolve(undefined);
          return;
        }
        const normalized = await normalizeModuleRecord(db, module);
        resolve(normalized || undefined);
      })().catch(reject);
    };
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
      fileDataBase64: uint8ArrayToBase64(data),
      fileMimeType: file.type || 'application/octet-stream',
      format,
      title,
      channels,
      archivedAt: Date.now(),
      updatedAt: Date.now(),
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
    await SyncManager.trackDeletion(db, 'chiptune', id);
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
