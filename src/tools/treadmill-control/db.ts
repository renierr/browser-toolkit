import type { TreadmillData } from './ftms-parser';

export interface TreadmillSession {
  id?: number;
  uid: string;
  startTime: number;
  endTime?: number;
  dataPoints: { timestamp: number; data: TreadmillData }[];
}

const DB_NAME = 'treadmill-control-db';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('uid', 'uid', { unique: true });
      }
    };
  });
}

export async function saveSession(session: TreadmillSession): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(session);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as number);
  });
}

export async function getAllSessions(): Promise<TreadmillSession[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function deleteSession(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

